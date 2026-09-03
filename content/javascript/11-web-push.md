---
id: js-11
title: Web Push 通知
summary: 購読、VAPID 鍵、push イベント、サーバーからの送信。「毎朝、今日の復習が N 問あります」を届ける仕組み
minutes: 12
---
## 登場人物

```
サーバー ──(購読情報宛てに送信)──▶ push サービス (ブラウザベンダー) ──▶ 端末のブラウザ ──▶ Service Worker の push イベント ──▶ 通知
```

- サーバーは端末を知らない。**購読情報** (endpoint URL + 暗号鍵) を宛先として持つ
- push サービスは Google / Apple / Mozilla が運営。アプリ側は契約不要
- 本文は購読時の鍵で暗号化され、push サービスには読めない

## 1. 鍵を作る (VAPID)

サーバーの身元を示す鍵ペアです。一度作ってサーバーに保存 (秘密鍵は Secret Manager)。

```bash
npx web-push generate-vapid-keys
# または python: py_vapid
```

公開鍵はフロントに渡し、秘密鍵は送信時の署名に使います。

## 2. 購読する (フロント)

```javascript
async function subscribePush() {
  if (!("PushManager" in window)) return null;              // 非対応
  const perm = await Notification.requestPermission();       // ユーザー操作 (ボタン) から呼ぶ
  if (perm !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  await fetch("/api/push/subscribe", { method: "POST", headers: authHeaders(), body: JSON.stringify(sub) });
  return sub;
}
```

購読情報は `{ endpoint, keys: { p256dh, auth } }` の JSON です。ユーザーに紐づけて DB に保存します (`push_subscriptions`: user_id, endpoint (unique), keys, created_at)。

## 3. 受け取る (Service Worker)

```javascript
self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(data.title ?? "Study Quiz", {
    body: data.body, icon: "icon.svg", data: { url: data.url ?? "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
```

`userVisibleOnly: true` の約束として、push を受けたら **必ず通知を表示** します (無音で処理だけするのは不可)。

## 4. 送る (サーバー)

```python
from pywebpush import webpush, WebPushException

def send(sub: PushSubscription, payload: dict) -> None:
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": sub.keys},
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": "mailto:admin@example.com"},
            ttl=60 * 60 * 12,
        )
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            delete_subscription(sub)          # 失効。掃除する
        else:
            raise
```

毎朝のリマインダーなら、Cloud Run Job で「due な問題数 > 0 のユーザー」を集計し、購読ごとに送ります。

## 制約と作法

- **HTTPS 必須**。localhost は可
- **iPhone**: iOS 16.4+、ホーム画面に追加した PWA からのみ。「インストール → 通知を有効化」の導線を出す
- 許可はユーザー操作 (ボタン) の中で求める。ページ表示直後に出すと拒否されやすく、一度拒否されると再表示できない
- 頻度は控えめに。解除されると購読が消える
- 1 ユーザーが複数端末を持つので、購読は user_id に対して複数行
- 送信結果 (404 / 410) で失効を掃除する

## まとめ

- 購読情報 (endpoint + 鍵) が宛先。VAPID がサーバーの身元
- フロントで subscribe → サーバーに保存 → SW の push で表示
- 送信は pywebpush / web-push。失効は 404 / 410 で消す
- iPhone は PWA インストールが前提。許可はボタンから

## やってみる

**ゴール:** ローカルで自分に 1 通 push を送る。

1. `uv add pywebpush` → `python3 -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); v.save_key('vapid.pem'); print(v.public_key.public_bytes(__import__('cryptography').hazmat.primitives.serialization.Encoding.X962, __import__('cryptography').hazmat.primitives.serialization.PublicFormat.UncompressedPoint).hex())"` で公開鍵を控える (面倒なら `npx web-push generate-vapid-keys` でも可)
2. js-07 の PWA の `sw.js` に足す:
   ```javascript
   self.addEventListener("push", (e) => { const d = e.data?.json() || {}; e.waitUntil(self.registration.showNotification(d.title || "Study Quiz", { body: d.body })); });
   self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(clients.openWindow("./")); });
   ```
3. ページのコンソールで (公開鍵を base64url → Uint8Array にする関数は自分で書く):
   ```javascript
   const reg = await navigator.serviceWorker.ready;
   const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(PUBLIC_KEY) });
   JSON.stringify(sub)
   ```
4. Python で `webpush(subscription_info=<貼り付け>, data='{"title":"復習","body":"今日は 3 問"}', vapid_private_key="vapid.pem", vapid_claims={"sub":"mailto:you@example.com"})`

**確認:** ページを閉じていても通知が出た。購読情報の endpoint がブラウザベンダーの URL になっている。
