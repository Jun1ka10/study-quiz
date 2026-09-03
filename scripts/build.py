"""questions/*.yaml を site/questions.json にまとめ、Service Worker を生成する。

使い方: uv run python scripts/build.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_DIR = ROOT / "questions"
SITE_DIR = ROOT / "site"
# Service Worker がキャッシュするファイル (site/ からの相対パス)
# ホーム画面でのカテゴリ表示順。無いものは末尾にアルファベット順
CATEGORY_ORDER = ["python", "design", "aws", "gcp", "infra"]
APP_SHELL = ["./", "index.html", "app.js", "style.css", "manifest.json", "questions.json", "icon.svg"]

SW_TEMPLATE = """// 自動生成: scripts/build.py が書き出す。直接編集しない。
const CACHE = "study-quiz-__VERSION__";
const ASSETS = __ASSETS__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先。無ければネットワークへ (オフラインでも動く)
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
"""


def load_questions() -> list[dict]:
    """全カテゴリを読み込み、id 重複と answer 範囲を検証したうえで平坦なリストにする。"""
    out: list[dict] = []
    seen: set[str] = set()
    for path in sorted(QUESTIONS_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        category = data["category"]
        title = data["title"]
        for q in data["questions"]:
            qid = q["id"]
            if qid in seen:
                raise ValueError(f"{path.name}: id が重複しています: {qid}")
            seen.add(qid)
            if not (0 <= q["answer"] < len(q["choices"])):
                raise ValueError(f"{path.name}: {qid} の answer が choices の範囲外です")
            if len(q["choices"]) < 2:
                raise ValueError(f"{path.name}: {qid} の choices は 2 つ以上必要です")
            if q.get("difficulty", 1) not in (1, 2, 3):
                raise ValueError(f"{path.name}: {qid} の difficulty は 1..3 です")
            out.append(
                {
                    "id": qid,
                    "category": category,
                    "categoryTitle": title,
                    "difficulty": q.get("difficulty", 1),
                    "question": q["question"],
                    "choices": q["choices"],
                    "answer": q["answer"],
                    "explanation": q.get("explanation", ""),
                }
            )
    return out


def build() -> dict:
    questions = load_questions()
    categories = []
    def order_key(c: tuple[str, str]) -> tuple[int, str]:
        return (CATEGORY_ORDER.index(c[0]) if c[0] in CATEGORY_ORDER else len(CATEGORY_ORDER), c[0])

    for c in sorted({(q["category"], q["categoryTitle"]) for q in questions}, key=order_key):
        categories.append({"id": c[0], "title": c[1], "count": sum(1 for q in questions if q["category"] == c[0])})
    payload = {"categories": categories, "questions": questions}
    (SITE_DIR / "questions.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    # 内容のハッシュをバージョンにする → 何か変わればキャッシュが更新される
    h = hashlib.sha256()
    for name in APP_SHELL:
        p = SITE_DIR / name
        if p.is_file():
            h.update(p.read_bytes())
    version = h.hexdigest()[:12]
    sw = SW_TEMPLATE.replace("__VERSION__", version).replace("__ASSETS__", json.dumps(APP_SHELL))
    (SITE_DIR / "sw.js").write_text(sw, encoding="utf-8")
    return {"questions": len(questions), "categories": len(categories), "version": version}


if __name__ == "__main__":
    info = build()
    print(f"questions.json: {info['questions']} 問 / {info['categories']} カテゴリ, sw version={info['version']}")
