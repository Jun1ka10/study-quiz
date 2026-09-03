---
id: js-07
title: PWA と Service Worker
summary: manifest、Service Worker のライフサイクル、キャッシュ戦略、更新の流し方。このアプリがオフラインで動く仕組み
minutes: 12
---
## PWA の 3 要素

1. **HTTPS**: Service Worker の登録条件 (localhost は例外)
2. **manifest.json**: 名前・アイコン・起動 URL・表示モード。「ホーム画面に追加」の情報
3. **Service Worker**: ページとは別スレッドで動くスクリプト。ネットワーク要求を横取りしてキャッシュから返せる

```html
<link rel="manifest" href="manifest.json">
<script>navigator.serviceWorker.register("sw.js");</script>
```

```json
{ "name": "Study Quiz", "short_name": "Quiz", "start_url": "./", "display": "standalone",
  "theme_color": "#1f6feb", "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }] }
```

## Service Worker のライフサイクル

```
register → install (キャッシュを作る) → waiting (古い SW がいれば待つ) → activate (古いキャッシュを消す) → fetch を横取り
```

```javascript
const CACHE = "app-v3";
const ASSETS = ["./", "index.html", "app.js", "style.css", "data.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;                      // 書き込みは触らない
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;   // API は素通し
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```

- `skipWaiting`: 古い SW を待たずに即 activate
- `clients.claim`: 開いているタブの制御を即取る
- キャッシュ名をバージョンにし、activate で古いものを消す

## キャッシュ戦略

| 資源 | 戦略 | 理由 |
|---|---|---|
| アプリ本体 (HTML / JS / CSS / 画像) | キャッシュ優先 | 変わらない。オフラインで開ける |
| データ (問題 JSON) | キャッシュ優先 + バージョンで更新 | オフラインでも読める |
| API (ログイン、進捗) | 素通し (ネットワーク) | 古い結果を返してはいけない |
| POST / PUT | 触らない | キャッシュしてはいけない |

「全部キャッシュ優先」にすると、ログイン後も古いレスポンスが返る、といった事故になります。

## 更新を届ける

ブラウザは sw.js を定期的 (ナビゲーション時、24 時間ごと) に取りに行き、**1 バイトでも違えば** 新しい SW として install します。ただし

- 古い SW が制御するタブが開いている間、新 SW は waiting で止まる (skipWaiting しない限り)
- ホーム画面から起動した PWA は何日も開きっぱなしになり、更新チェックが走らない

対策: `visibilitychange` で前面に来たら `registration.update()`、`controllerchange` で `location.reload()` (作業中なら「更新があります」ボタン)。GitHub Pages のように HTTP キャッシュが効く配信先では、install 時の取得に `cache: "reload"` を付けます。

## デバッグ

DevTools → Application → Service Workers (状態、Update、Unregister)、Cache Storage (中身)、Network の Offline チェック。「変更が反映されない」はまず Unregister + Cache 削除で切り分けます。

## 制約

- SW からは DOM を触れない。ページとは `postMessage` で通信
- iOS は Push や一部 API に制限がある。ホーム画面に追加した PWA からでないと通知が出ない
- ストレージ (Cache / IndexedDB) は容量制限があり、長期間使わないと消されることがある

## まとめ

- HTTPS + manifest + Service Worker
- install でキャッシュ、activate で古いのを消す、fetch で横取り
- 本体はキャッシュ優先、API は素通し、書き込みは触らない
- 更新は skipWaiting + claim + reload。前面復帰時に update()

## やってみる

**ゴール:** 最小の PWA を作り、オフラインで開けるところまで。

1. `pwa/index.html`:
   ```html
   <link rel="manifest" href="manifest.json"><h1 id="h">hello</h1>
   <script>navigator.serviceWorker.register("sw.js");</script>
   ```
   `manifest.json`: `{"name":"Demo","start_url":"./","display":"standalone","icons":[]}`
   `sw.js`:
   ```javascript
   const C = "v1";
   self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(["./", "index.html", "manifest.json"]))));
   self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
   self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
   ```
2. `python3 -m http.server 8080` で開き、DevTools → Application → Service Workers で `activated` を確認
3. Network タブで Offline にして再読み込み。表示されることを確認
4. `hello` を `hello v2` に、`C` を `v2` に変えて再読み込み 2 回。Application → Cache Storage に v2 だけ残るのを見る

**確認:** オフラインで開けた。バージョンを変えると古いキャッシュが消えた。
