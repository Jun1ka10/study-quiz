---
id: be-04
title: Django のビュー・URL・テンプレート
summary: 関数ビューの書き方、urls.py、テンプレート構文、フォームと CSRF、ログイン必須の付け方
minutes: 14
exercise: |
  **ゴール:** ビュー・URL・テンプレートをつなぎ、CSRF エラーを 1 回出す。

  1. `members/views.py`:
     ```python
     from django.shortcuts import render, redirect
     from .models import Client
     def index(request):
         if request.method == "POST":
             Client.objects.create(name=request.POST["name"]); return redirect("index")
         return render(request, "index.html", {"clients": Client.objects.all()})
     ```
  2. `config/urls.py` に `path("", views.index, name="index")`。`templates/index.html` を作り `settings.TEMPLATES[0]["DIRS"]` に `BASE_DIR / "templates"` を足す
     ```django
     <form method="post"><input name="name"><button>追加</button></form>
     <ul>{% for c in clients %}<li>{{ c.name }}</li>{% endfor %}</ul>
     ```
  3. 送信して 403 を見る。`{% csrf_token %}` を form 内に足して通す

  **確認:** 403 の理由を説明できる。POST 後に redirect している理由も。
questions:
  - id: be-l04-1
    difficulty: 1
    question: "ビュー関数が必ず受け取り、必ず返すものは?"
    choices:
      - "モデル / テンプレート"
      - "HttpRequest / HttpResponse (render や redirect が作る)"
      - "文字列 / 辞書"
      - "URL / HTML"
    answer: 1
    explanation: "`def member(request): ... return render(request, \"members/index.html\", ctx)`。render や redirect、JsonResponse はすべて HttpResponse の一種。"
  - id: be-l04-2
    difficulty: 1
    question: "`path(\"members/<uuid:pk>/\", views.detail, name=\"member/detail\")` の `<uuid:pk>` は?"
    choices:
      - "クエリ文字列"
      - "パスの一部を uuid として取り出し、ビューの引数 pk に渡す"
      - "コメント"
      - "テンプレートの変数"
    answer: 1
    explanation: "`def detail(request, pk):` で受ける。`name=` を付けると テンプレートで `{% url 'member/detail' pk=m.pk %}` と逆引きできる。"
  - id: be-l04-3
    difficulty: 2
    question: "POST フォームで `403 CSRF verification failed` が出た。足りないものは?"
    choices:
      - "method=\"post\""
      - "テンプレートの form 内の `{% csrf_token %}` (JS の fetch なら X-CSRFToken ヘッダー)"
      - "action 属性"
      - "ログイン"
    answer: 1
    explanation: "CSRF 対策で、状態を変える POST には Django が発行したトークンが必要。fetch で JSON を送る場合は Cookie の csrftoken をヘッダーに載せる。"
  - id: be-l04-4
    difficulty: 2
    question: "未ログインのユーザーをログイン画面に飛ばしたい。最も簡単なのは?"
    choices:
      - "ビューの先頭で if request.user.is_authenticated を書く"
      - "`@login_required` デコレータをビューに付ける"
      - "テンプレートで隠す"
      - "URL を秘密にする"
    answer: 1
    explanation: "`from django.contrib.auth.decorators import login_required`。未ログインなら settings.LOGIN_URL へリダイレクトし、`?next=` で戻り先を付けてくれる。"
---
## ビュー関数

```python
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import Member

@login_required
def member(request):
    members = Member.objects.order_by("username")
    return render(request, "members/index.html", {"members": members})

@login_required
def member_detail(request, pk):
    m = get_object_or_404(Member, pk=pk)     # 無ければ 404
    return render(request, "members/detail.html", {"member": m})
```

- 引数は `request` (+ URL から取り出した値)
- 戻り値は `HttpResponse`。`render` (テンプレート → HTML)、`redirect`、`JsonResponse` がそれを作る
- `@login_required` で未ログインをログイン画面へ

このレッスンは **関数ビュー** 主体で説明します。クラスベースビュー (ListView など) もありますが、読むときは「結局 request を受けて response を返す」と考えれば同じです。

## urls.py

```python
# members/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("", views.member, name="member"),
    path("<uuid:pk>/", views.member_detail, name="member/detail"),
    path("csv", views.member_csv_download, name="member/csv"),
]

# config/urls.py (プロジェクト側で束ねる)
urlpatterns = [
    path("admin/", admin.site.urls),
    path("members/", include("members.urls")),
]
```

`<uuid:pk>` や `<int:id>` でパスの一部を型付きで受け取れます。`name=` を付けておくと、テンプレートやコードから **逆引き** できるので、URL を変えても呼び出し側を直さずに済みます。

## テンプレート

```django
{% extends "base.html" %}
{% block content %}
<h1>{{ members|length }} 名</h1>
<ul>
  {% for m in members %}
    <li><a href="{% url 'member/detail' pk=m.pk %}">{{ m.username }}</a>
      {% if not m.active %}<span>(無効)</span>{% endif %}</li>
  {% empty %}
    <li>まだいません</li>
  {% endfor %}
</ul>
{% endblock %}
```

| 構文 | 意味 |
|---|---|
| `{{ 変数 }}` | 値を出力 (自動で HTML エスケープされる) |
| `{% if %}` `{% for %}` | 制御 |
| `{% url 'name' %}` | URL の逆引き |
| `{% extends %}` `{% block %}` | 共通レイアウト (base.html) の継承 |
| `{{ x\|date:"Y/m/d" }}` | フィルタ |

テンプレートで複雑なロジックは書けません (書けないように設計されています)。計算はビューで済ませ、テンプレートは表示だけにします。

## フォームと CSRF

```django
<form method="post">
  {% csrf_token %}
  <input name="username">
  <button>保存</button>
</form>
```

```python
def member_create(request):
    if request.method == "POST":
        Member.objects.create(username=request.POST["username"])
        return redirect("member")          # POST 後はリダイレクト (二重送信防止)
    return render(request, "members/new.html")
```

状態を変える POST には **CSRF トークン** が必須です。無いと 403 になります。JS の `fetch` から送るときは Cookie の `csrftoken` を `X-CSRFToken` ヘッダーに載せます。

## JSON を返す

画面内の JS が呼ぶ小さな API は `JsonResponse` で足ります。

```python
from django.http import JsonResponse

def member_json(request):
    data = list(Member.objects.values("pk", "username"))
    return JsonResponse({"members": data})
```

本格的な API は次のレッスンの Django REST framework を使います。

## メッセージ

「保存しました」のような一回きりの通知は `messages` フレームワークです。

```python
from django.contrib import messages
messages.success(request, "保存しました")
```

テンプレート側 (`_message.html`) で `{% for message in messages %}` と回して表示します。

## まとめ

- ビュー = request を受けて response を返す関数。`render` / `redirect` / `JsonResponse`
- URL は `path()` で型付きに受け取り、`name` で逆引き
- テンプレートは表示だけ。ロジックはビューへ
- POST には `{% csrf_token %}`、POST 後は redirect、認証は `@login_required`
