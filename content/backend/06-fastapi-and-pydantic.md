---
id: be-06
title: FastAPI と Pydantic
summary: ルーター分割、パス / クエリ / ボディの受け取り、Pydantic による検証、Depends、HTTPException
minutes: 14
---
## 最小のアプリ

```python
from fastapi import FastAPI

app = FastAPI(title="My API")

@app.get("/healthz")
def healthz():
    return {"status": "ok"}          # dict を返せば JSON になる
```

```bash
uvicorn main:app --reload --port 8080     # 開発
```

`/docs` を開くと自動生成された API ドキュメント (Swagger UI) が出ます。型を書いておけばそのまま仕様書になります。

## ルーターで分割する

機能ごとに `routers/actors.py` のようにファイルを分け、`main.py` で束ねます。

```python
# routers/actors.py
from fastapi import APIRouter
router = APIRouter()

@router.get("/actors")
def list_actors(): ...

@router.post("/actors", status_code=201)
def create_actor(): ...

@router.delete("/actors/{actor_id}", status_code=204)
def delete_actor(actor_id: int): ...

# main.py
from routers import actors
app.include_router(actors.router)
```

## 入力の受け取り方

FastAPI は **関数の引数の型** を見て、どこから値を取るかを決めます。

```python
from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    email: EmailStr                       # 形式チェック
    password: str = Field(min_length=8)

@router.get("/actors/{actor_id}")
def get_actor(actor_id: int, verbose: bool = False):
    # actor_id: パスパラメータ (int に変換。数字でなければ 422)
    # verbose:  クエリ ?verbose=true
    ...

@router.post("/users", status_code=201)
def create_user(body: UserCreate):
    # body: JSON ボディ。Pydantic で検証済み
    ...
```

| 引数の種類 | 判定 |
|---|---|
| パスに `{name}` がある | パスパラメータ |
| 単純型 (int / str / bool) でパスに無い | クエリパラメータ |
| Pydantic モデル | JSON ボディ |

## Pydantic: 検証と変換

Pydantic モデルは「入ってくるデータの形」を宣言します。型に合わなければ FastAPI が **422** とエラー詳細を返し、関数は呼ばれません。

```python
class ActorOut(BaseModel):
    id: int
    name: str
    kind: str

@router.get("/actors/{actor_id}", response_model=ActorOut)
def get_actor(actor_id: int, db: Session = Depends(get_db)):
    actor = db.get(Actor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail="actor not found")
    return actor            # ORM オブジェクトを response_model が整形する (余計な列は落ちる)
```

`response_model` を付けると、返す JSON の形も固定され、内部の列 (パスワードハッシュなど) が漏れません。

## Depends: 依存性注入

DB セッションやログインユーザーのように「毎回要るもの」は `Depends` で受け取ります。

```python
from sqlalchemy.orm import Session
from database import SessionLocal

def get_db():
    db = SessionLocal()
    try:
        yield db          # ここでハンドラが動く
    finally:
        db.close()        # 終わったら必ず閉じる

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    ...                   # JWT を検証して User を返す。駄目なら HTTPException(401)

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user
```

- `yield` の後が後片付け (close)
- 依存は入れ子にできる (`get_current_user` が `get_db` に依存)
- テストでは `app.dependency_overrides[get_db] = fake_db` で差し替えられる

「誰が・どの組織で」のような文脈も、この仕組みで各ハンドラに配ります。

## エラーの返し方

```python
from fastapi import HTTPException

raise HTTPException(status_code=404, detail="not found")
raise HTTPException(status_code=403, detail="forbidden")
```

その場で処理が止まり、`{"detail": "not found"}` が返ります。

## Django との違い

| | Django | FastAPI |
|---|---|---|
| 入力検証 | シリアライザ / フォーム | Pydantic (型ヒント) |
| DB | 自前 ORM | 好きなもの (SQLAlchemy が定番) |
| 認証 | ミドルウェア + セッション | Depends で自前 (JWT が多い) |
| 画面 | テンプレート | 無い |
| 型による自動ドキュメント | 無い | `/docs` |

## まとめ

- ルーターで分割し、main で include
- 引数の型で パス / クエリ / ボディ が決まる。検証失敗は 422
- 出力は `response_model` で形を固定
- DB やユーザーは `Depends`。yield の後が後片付け
- エラーは `HTTPException`

## やってみる

**ゴール:** FastAPI で 422 と Depends を体験する。

1. `uv init fademo && cd fademo && uv add fastapi uvicorn`
2. `main.py`:
   ```python
   from fastapi import Depends, FastAPI, HTTPException
   from pydantic import BaseModel, Field
   app = FastAPI()
   class Item(BaseModel):
       name: str = Field(min_length=1)
       price: int = Field(ge=0)
   DB = {}
   def get_db(): return DB
   @app.post("/items", status_code=201)
   def create(item: Item, db=Depends(get_db)):
       db[item.name] = item; return item
   @app.get("/items/{name}")
   def read(name: str, db=Depends(get_db)):
       if name not in db: raise HTTPException(404, "not found")
       return db[name]
   ```
3. `uv run uvicorn main:app --reload` → `http://localhost:8000/docs` で試す
4. `curl -i -X POST localhost:8000/items -H "Content-Type: application/json" -d '{"name":"","price":-1}'` → 422 を読む

**確認:** 422 の本文に 2 つのエラーが field 名付きで入っている。/docs が自動でできている。
