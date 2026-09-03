---
id: be-05
title: Django REST framework
summary: APIView とシリアライザ、認証と権限。mokujitsu の API がどう守られているか
minutes: 12
questions:
  - id: be-l05-1
    difficulty: 1
    question: "DRF のシリアライザの役割は?"
    choices:
      - "DB 接続"
      - "モデル ↔ JSON の変換と、入力のバリデーション"
      - "URL のルーティング"
      - "テンプレートの描画"
    answer: 1
    explanation: "出力時は model → dict → JSON、入力時は JSON → 検証 → model。`ModelSerializer` ならフィールド定義をモデルから拾える。"
  - id: be-l05-2
    difficulty: 2
    question: "`APIView` の `get` / `post` メソッドが返すべきものは?"
    choices:
      - "dict"
      - "`Response(data, status=...)`"
      - "render(...)"
      - "文字列"
    answer: 1
    explanation: "`from rest_framework.response import Response`。dict を渡せば JSON になる。ステータスは `status.HTTP_201_CREATED` などの定数で。"
  - id: be-l05-3
    difficulty: 2
    question: "`authentication_classes` と `permission_classes` の違いは?"
    choices:
      - "同じ"
      - "authentication は「誰か」を特定する、permission は「その人にこの操作を許すか」を決める"
      - "permission が先に動く"
      - "authentication は管理画面専用"
    answer: 1
    explanation: "認証 (セッション / トークン / API キー) で request.user が決まり、その後に権限 (IsAuthenticated / 自作) が判定する。"
  - id: be-l05-4
    difficulty: 2
    question: "`serializer.is_valid()` が False のとき、正しい対応は?"
    choices:
      - "無視して save() する"
      - "`serializer.errors` を 400 で返す (または `is_valid(raise_exception=True)`)"
      - "500 を返す"
      - "空の JSON を返す"
    answer: 1
    explanation: "入力不正はクライアント側の問題なので 400。errors にはフィールドごとの理由が入る。"
---
## DRF が足すもの

Django だけでも `JsonResponse` で API は書けますが、入力検証・認証・権限・エラー形式を毎回書くことになります。Django REST framework (DRF) はそこを揃えてくれます。

## シリアライザ

モデルと JSON の橋渡しです。

```python
from rest_framework import serializers
from .models import Member

class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = ["member_pk", "username", "mail", "active"]
        read_only_fields = ["member_pk"]
```

```python
MemberSerializer(member).data                  # model → dict (→ Response で JSON)
MemberSerializer(Member.objects.all(), many=True).data

s = MemberSerializer(data=request.data)        # JSON → 検証
if s.is_valid():
    s.save()                                   # create
else:
    s.errors                                   # {"mail": ["この項目は必須です。"]}
```

フィールド単位の検証は `validate_<field>`、全体は `validate` メソッドに書きます。

## APIView

mokujitsu が使っているのはこの形です。

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

class MemberListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Member.objects.filter(company=request.user.company)
        return Response(MemberSerializer(qs, many=True).data)

    def post(self, request):
        s = MemberSerializer(data=request.data)
        s.is_valid(raise_exception=True)       # 不正なら 400 を自動で返す
        s.save(company=request.user.company)
        return Response(s.data, status=status.HTTP_201_CREATED)
```

```python
# urls.py
path("api/members/", MemberListView.as_view()),
```

`request.data` は JSON でもフォームでも同じように読めます。戻り値は必ず `Response`。

## 認証と権限

| 段階 | 設定 | 役割 |
|---|---|---|
| 認証 | `authentication_classes` | リクエストが「誰か」を決める (request.user) |
| 権限 | `permission_classes` | その人にこの操作を許すか |

```python
from rest_framework import authentication, exceptions

class ApiKeyAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        key = request.headers.get("X-API-Key")
        if not key:
            return None                        # 他の認証に任せる
        try:
            client = ApiClient.objects.get(key=key, active=True)
        except ApiClient.DoesNotExist:
            raise exceptions.AuthenticationFailed("invalid key")
        return (client.user, client)           # (user, auth)
```

外部システムから呼ばれる API (Slack、freee 連携) はこのように専用の認証クラスを書き、画面と同じセッション認証には頼りません。

権限は `IsAuthenticated` のほか、`BasePermission` を継承して `has_permission` を書けば自作できます。拒否は `PermissionDenied` を raise すれば 403 になります。

## ステータスコードの使い分け

| 状況 | コード |
|---|---|
| 取得成功 | 200 |
| 作成成功 | 201 |
| 削除成功 (本文なし) | 204 |
| 入力不正 | 400 (serializer.errors) |
| 未認証 / 権限なし | 401 / 403 |
| 無い | 404 (`get_object_or_404`) |

## まとめ

- シリアライザ = モデル ↔ JSON + バリデーション
- APIView の get / post は `Response` を返す
- 認証で「誰か」、権限で「許すか」。外部連携は専用の認証クラス
- 入力不正は 400、作成は 201
