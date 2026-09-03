---
id: infra-10
title: Kubernetes の概要
summary: Pod / Deployment / Service / Ingress の役割、マニフェストの読み方、いつ使うべきで、いつ Cloud Run で足りるか
minutes: 12
---
## 何をするものか

Kubernetes (k8s) は、多数のコンテナを複数のマシンに配置し、落ちたら立て直し、増減させ、通信をつなぐ **オーケストレータ** です。「望ましい状態」を YAML で宣言すると、それに近づけ続けます。

Cloud Run や ECS Fargate は、この機能の一部を「コンテナを渡すだけ」に簡略化したものです。**まず k8s が要るか** を考えます。

## 主要なリソース

| リソース | 役割 | 例え |
|---|---|---|
| Pod | 1 つ以上のコンテナの実行単位。使い捨て | プロセス |
| Deployment | Pod を N 個維持し、ローリングアップデートする | systemd + Auto Scaling |
| Service | Pod 群に安定した名前と IP を与える (負荷分散) | 内部 LB / DNS |
| Ingress | 外からの HTTP を Service に振り分ける (TLS 終端) | ALB |
| ConfigMap / Secret | 設定 / 秘密を Pod に渡す | 環境変数の置き場 |
| Job / CronJob | 1 回 / 定期のバッチ | Cloud Run Job + Scheduler |
| Namespace | リソースの区画 | プロジェクト / 環境の分け |
| PersistentVolume | 永続ディスク | EBS |

## マニフェストを読む

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3                          # Pod を 3 つ維持
  selector:
    matchLabels: { app: api }
  template:                            # Pod の雛形
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: asia-northeast1-docker.pkg.dev/proj/app/api:abc1234
          ports: [{ containerPort: 8000 }]
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: api-secrets, key: database_url } }
          resources:
            requests: { cpu: "250m", memory: "256Mi" }     # 最低限確保
            limits:   { cpu: "1",    memory: "512Mi" }     # 上限
          readinessProbe:
            httpGet: { path: /readyz, port: 8000 }
          livenessProbe:
            httpGet: { path: /healthz, port: 8000 }
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector: { app: api }               # このラベルの Pod に流す
  ports: [{ port: 80, targetPort: 8000 }]
```

- `labels` と `selector` で「どの Pod にどう流すか」が結ばれる
- `resources` を書かないとスケジューリングと安定性が崩れる
- `readinessProbe` が通るまでトラフィックを受けない、`livenessProbe` が落ちると再起動

```bash
kubectl apply -f api.yaml
kubectl get pods -l app=api
kubectl logs -f deploy/api
kubectl describe pod api-xxxx           # 起動しない理由はここ
kubectl exec -it api-xxxx -- sh
kubectl rollout status deploy/api
kubectl rollout undo deploy/api         # ロールバック
```

## 運用で必ず出てくるもの

- **Ingress コントローラと証明書** (cert-manager)
- **HPA** (水平オートスケール): CPU やメトリクスで replicas を増減
- **ログとメトリクスの収集** (Cloud Logging / Prometheus)
- **Secret の管理** (External Secrets で Secret Manager と同期)
- **マニフェストの管理** (Helm / Kustomize、GitOps の ArgoCD)
- **クラスタのアップグレード** (年に数回、ノードの入れ替え)

「コンテナを動かす」より、この周辺の方が仕事が多い。GKE Autopilot や EKS はノード管理を軽くしますが、上の項目は残ります。

## いつ使うか

| 状況 | 選択 |
|---|---|
| Web API + バッチ、チーム小、トラフィック中程度 | **Cloud Run / ECS Fargate で足りる** |
| 多数のサービス、独自のネットワーク要件、GPU / ステートフルなワークロード、マルチクラウド | k8s を検討 |
| 既に k8s の運用経験者がいる | k8s でもよい |

判断の目安は「k8s の運用 (上のリスト) に人を割けるか」です。割けないなら、Cloud Run のようなマネージドを使い、必要になったら移ります。k8s の概念 (Deployment / Service / Probe / resources) は Cloud Run の設定にもそのまま対応するので、知っておく価値はあります。

## Cloud Run との対応

| k8s | Cloud Run |
|---|---|
| Deployment + Service + Ingress | Service (1 つで全部) |
| replicas / HPA | min / max instances (自動) |
| readinessProbe | startup probe |
| CronJob | Job + Scheduler |
| Secret | Secret Manager の注入 |
| resources | CPU / メモリの設定 |

## まとめ

- k8s は「望ましい状態を宣言し、維持し続ける」オーケストレータ
- Pod / Deployment / Service / Ingress / ConfigMap / Secret / Job
- labels と selector、probe、resources を読めれば大半のマニフェストは読める
- 小規模なら Cloud Run で足りる。k8s は運用に人を割けるときに

## やってみる

**ゴール:** ローカルの k8s で Deployment と Service を動かし、ローリングとロールバックを見る。

1. `kind` (`brew install kind` / `go install`) か `minikube` でローカルクラスタを作る: `kind create cluster`
2. 上の Deployment (image は `nginxdemos/hello:plain-text` に置き換え、port 80、probe は `/`) と Service を `app.yaml` に書いて `kubectl apply -f app.yaml`
3. `kubectl get pods -w` で 3 つ起動するのを見る。`kubectl port-forward svc/api 8080:80` → `curl localhost:8080` を数回して別 Pod に当たるのを見る
4. `kubectl delete pod <1 つ>` して、すぐ新しい Pod が作られる (望ましい状態の維持) のを確認
5. image を存在しないタグに変えて apply → `kubectl rollout status` が止まり、`kubectl describe pod` で ImagePullBackOff を読む → `kubectl rollout undo` で戻す
6. `kind delete cluster`

**確認:** 消しても復活する、壊れた更新は止まって戻せる、を見た。Cloud Run との対応表を自分の言葉で言える。
