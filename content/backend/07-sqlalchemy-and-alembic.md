---
id: be-07
title: SQLAlchemy 2 と Alembic
summary: Mapped 記法のモデル、Session と select、リレーション、Alembic でのマイグレーション運用
minutes: 14
questions:
  - id: be-l07-1
    difficulty: 1
    question: "SQLAlchemy 2 のモデル定義で、列を宣言する書き方は?"
    choices:
      - "name = Column(String)"
      - "name: Mapped[str] = mapped_column(String(200), nullable=False)"
      - "name = models.CharField()"
      - "name: str"
    answer: 1
    explanation: "2.0 スタイルは型ヒント `Mapped[型]` + `mapped_column()`。`Mapped[str | None]` なら NULL 許可の意味も型に乗る。"
  - id: be-l07-2
    difficulty: 2
    question: "`db.add(obj)` しただけでは DB に書かれない。確定させるには?"
    choices: ["db.save()", "db.commit()", "db.flush() だけで十分", "自動で書かれる"]
    answer: 1
    explanation: "Session は変更をためておき commit で 1 トランザクションとして確定する。途中で例外なら rollback。flush は SQL を送るが確定ではない。"
  - id: be-l07-3
    difficulty: 2
    question: "SQLAlchemy 2 で「id が 5 の Actor を 1 件取る」現代的な書き方は?"
    choices:
      - "db.query(Actor).get(5)"
      - "db.get(Actor, 5)  または  db.execute(select(Actor).where(Actor.id == 5)).scalar_one_or_none()"
      - "Actor.objects.get(id=5)"
      - "SELECT * FROM actor"
    answer: 1
    explanation: "主キーなら `db.get`。条件付きは `select()` を `db.execute()` に渡し `scalars()` / `scalar_one_or_none()` で取り出す。`db.query()` は旧スタイル。"
  - id: be-l07-4
    difficulty: 2
    question: "モデルに列を足した。Alembic での手順は?"
    choices:
      - "alembic upgrade head だけ"
      - "alembic revision --autogenerate -m \"add column\" で差分ファイルを作り、中身を確認してから alembic upgrade head"
      - "DB を作り直す"
      - "SQL を手で流す"
    answer: 1
    explanation: "autogenerate は完璧ではない (型変更や rename を見落とす) ので必ず生成ファイルを読む。agent-base は 100 本以上のリビジョンを積んでいる。"
---
## 役割分担

- **SQLAlchemy**: Python のクラスとテーブルを対応付け、SQL を組み立てる (ORM)
- **Alembic**: モデルの変更を DB に反映するマイグレーションツール (Django の makemigrations / migrate に相当)

Django は両方が同梱ですが、FastAPI では自分で組み合わせます。agent-base はこの構成です。

## エンジンとセッション

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

engine = create_engine("postgresql+psycopg2://user:pass@host/db", pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase):
    pass
```

- **engine**: 接続プールを持つ、アプリで 1 つ
- **Session**: 1 リクエスト (1 トランザクション) の作業単位。FastAPI では `Depends(get_db)` で配る

## モデル (2.0 スタイル)

```python
from datetime import datetime
from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(1000))     # NULL 可
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    members: Mapped[list["UserOrganization"]] = relationship(back_populates="organization")

class UserOrganization(Base):
    __tablename__ = "user_organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)

    organization: Mapped["Organization"] = relationship(back_populates="members")
```

- `Mapped[str]` は NOT NULL、`Mapped[str | None]` は NULL 可。型ヒントがそのまま制約になる
- `relationship` でオブジェクト同士を行き来できる (`org.members`、`uo.organization`)
- `ondelete="CASCADE"` は DB 側の外部キー制約

## 読む: select

```python
from sqlalchemy import select

db.get(Organization, 1)                                   # 主キーで 1 件 (無ければ None)

stmt = select(Organization).where(Organization.slug == "acme")
org = db.execute(stmt).scalar_one_or_none()               # 0 or 1 件

stmt = select(Organization).order_by(Organization.name).limit(20)
orgs = db.execute(stmt).scalars().all()                   # リスト

stmt = select(Organization).join(UserOrganization).where(UserOrganization.user_id == user.id)
```

`db.query(...)` は 1.x の書き方で、まだ動きますが新しく書くなら `select()` です。

## 書く: add / commit

```python
org = Organization(slug="acme", name="ACME")
db.add(org)
db.commit()          # ここで INSERT が確定。id が振られる
db.refresh(org)      # server_default の列を読み直す

org.name = "ACME Inc."
db.commit()          # 変更を追跡しているので add 不要

db.delete(org)
db.commit()
```

- Session は変更をためて、**commit で 1 トランザクション** として確定する
- 途中で例外が出たら `db.rollback()`。FastAPI の `get_db` で `except: db.rollback()` を入れておく
- `flush()` は SQL を送るだけで確定ではない (commit 前に id が欲しいときに使う)

## N+1 と読み込み戦略

Django と同じ問題があります。

```python
from sqlalchemy.orm import selectinload, joinedload

select(Organization).options(selectinload(Organization.members))   # 2 回の SELECT にまとめる
select(UserOrganization).options(joinedload(UserOrganization.organization))   # JOIN
```

## Alembic

```bash
alembic init alembic                                    # 初回だけ
alembic revision --autogenerate -m "add org color"      # モデルとの差分からファイル生成
alembic upgrade head                                    # 適用
alembic downgrade -1                                    # 1 つ戻す
alembic current / history                               # 状態
```

生成されたファイルは `alembic/versions/0120_add_org_color.py` のようになり、`upgrade()` と `downgrade()` を持ちます。

```python
def upgrade():
    op.add_column("organizations", sa.Column("color", sa.String(20), nullable=True))

def downgrade():
    op.drop_column("organizations", "color")
```

**autogenerate は必ず目で確認します。** 列名の変更を「削除 + 追加」と解釈してデータを消したり、型変更を見落としたりします。agent-base では migration 専用の Cloud Run Job がデプロイ時に `alembic upgrade head` を実行します。

## まとめ

- engine は 1 つ、Session はリクエストごと
- モデルは `Mapped[型] = mapped_column()`。`| None` で NULL 可
- 読むのは `select()` + `db.execute()`、書くのは `add` → `commit`
- マイグレーションは `revision --autogenerate` → 中身を読む → `upgrade head`
