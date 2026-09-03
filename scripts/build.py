"""content/ (レッスン) と questions/ (問題プール) から site/data.json と site/sw.js を生成する。

使い方: uv run python scripts/build.py

入力:
  content/categories.yaml        カテゴリの並び・説明・今後書く予定のレッスン名
  content/<category>/NN-*.md     レッスン。frontmatter (id/title/questions) + 本文 Markdown。NN が順番
  questions/<category>.yaml      レッスンに紐づかない問題プール (ランダム演習・復習用)
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
QUESTIONS_DIR = ROOT / "questions"
SITE_DIR = ROOT / "site"
# Service Worker がキャッシュするファイル (site/ からの相対パス)
APP_SHELL = ["./", "index.html", "app.js", "style.css", "manifest.json", "data.json", "icon.svg"]

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)
LESSON_FILE_RE = re.compile(r"^(\d{2})-[a-z0-9-]+\.md$")

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


class ContentError(ValueError):
    pass


def _md(text: str) -> str:
    return markdown.markdown(text, extensions=["fenced_code", "tables", "sane_lists"])


def _validate_question(q: dict, where: str, seen: set[str]) -> None:
    qid = q.get("id")
    if not qid:
        raise ContentError(f"{where}: id がありません")
    if qid in seen:
        raise ContentError(f"{where}: id が重複しています: {qid}")
    seen.add(qid)
    choices = q.get("choices") or []
    if len(choices) < 2:
        raise ContentError(f"{where}: {qid} の choices は 2 つ以上必要です")
    if len(set(choices)) != len(choices):
        raise ContentError(f"{where}: {qid} の choices が重複しています")
    if not isinstance(q.get("answer"), int) or not (0 <= q["answer"] < len(choices)):
        raise ContentError(f"{where}: {qid} の answer が choices の範囲外です")
    if q.get("difficulty", 1) not in (1, 2, 3):
        raise ContentError(f"{where}: {qid} の difficulty は 1..3 です")
    if not str(q.get("explanation", "")).strip():
        raise ContentError(f"{where}: {qid} に explanation がありません")
    if not str(q.get("question", "")).strip():
        raise ContentError(f"{where}: {qid} に question がありません")


def _question_payload(q: dict, category: str, category_title: str, lesson: str | None) -> dict:
    return {
        "id": q["id"],
        "category": category,
        "categoryTitle": category_title,
        "lesson": lesson,
        "difficulty": q.get("difficulty", 1),
        "question": q["question"],
        "choices": q["choices"],
        "answer": q["answer"],
        "explanation": q.get("explanation", ""),
    }


def load_categories() -> list[dict]:
    data = yaml.safe_load((CONTENT_DIR / "categories.yaml").read_text(encoding="utf-8"))
    cats = data["categories"]
    ids = [c["id"] for c in cats]
    if len(ids) != len(set(ids)):
        raise ContentError("categories.yaml: id が重複しています")
    prefixes = [c.get("prefix") for c in cats]
    if not all(prefixes) or len(prefixes) != len(set(prefixes)):
        raise ContentError("categories.yaml: 各カテゴリに一意な prefix が必要です")
    return cats


def load_lessons(categories: list[dict], seen_qids: set[str]) -> list[dict]:
    """content/<category>/NN-*.md を読み、順番付きのレッスン一覧にする。"""
    titles = {c["id"]: c["title"] for c in categories}
    lessons: list[dict] = []
    seen_ids: set[str] = set()
    for cat in categories:
        cdir = CONTENT_DIR / cat["id"]
        if not cdir.is_dir():
            continue
        orders: set[str] = set()
        for path in sorted(cdir.glob("*.md")):
            m = LESSON_FILE_RE.match(path.name)
            if not m:
                raise ContentError(f"{path}: ファイル名は NN-slug.md 形式にしてください")
            if m.group(1) in orders:
                raise ContentError(f"{path}: 番号 {m.group(1)} が同じカテゴリ内で重複しています")
            orders.add(m.group(1))
            fm = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
            if not fm:
                raise ContentError(f"{path}: frontmatter (--- で囲む) がありません")
            meta = yaml.safe_load(fm.group(1)) or {}
            body = fm.group(2).strip()
            lid = meta.get("id")
            if not lid:
                raise ContentError(f"{path}: frontmatter に id がありません")
            if lid in seen_ids:
                raise ContentError(f"{path}: レッスン id が重複しています: {lid}")
            seen_ids.add(lid)
            if not meta.get("title"):
                raise ContentError(f"{path}: frontmatter に title がありません")
            if not body:
                raise ContentError(f"{path}: 本文が空です")
            questions = []
            for q in meta.get("questions") or []:
                _validate_question(q, f"{path.name}", seen_qids)
                questions.append(_question_payload(q, cat["id"], titles[cat["id"]], lid))
            lessons.append(
                {
                    "id": lid,
                    "category": cat["id"],
                    "order": int(m.group(1)),
                    "title": meta["title"],
                    "summary": meta.get("summary", ""),
                    "minutes": meta.get("minutes", 5),
                    "html": _md(body),
                    "questions": questions,
                }
            )
    return lessons


def load_pool(categories: list[dict], seen_qids: set[str], lesson_ids: set[str]) -> list[dict]:
    """questions/*.yaml (レッスンに紐づかない問題プール)。lesson: を書けば紐づけもできる。"""
    titles = {c["id"]: c["title"] for c in categories}
    out: list[dict] = []
    for path in sorted(QUESTIONS_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        category = data["category"]
        if category not in titles:
            raise ContentError(f"{path.name}: カテゴリ {category} が content/categories.yaml にありません")
        for q in data["questions"]:
            _validate_question(q, path.name, seen_qids)
            lesson = q.get("lesson")
            if lesson and lesson not in lesson_ids:
                raise ContentError(f"{path.name}: {q['id']} の lesson {lesson} が存在しません")
            out.append(_question_payload(q, category, titles[category], lesson))
    return out


def load_all() -> dict:
    categories = load_categories()
    seen_qids: set[str] = set()
    lessons = load_lessons(categories, seen_qids)
    pool = load_pool(categories, seen_qids, {ls["id"] for ls in lessons})
    # レッスン内の問題 + プールを 1 本のリストに (クライアントは lesson フィールドで引く)
    questions = [q for ls in lessons for q in ls["questions"]] + pool
    lessons_out = [{k: v for k, v in ls.items() if k != "questions"} for ls in lessons]
    cats_out = []
    for c in categories:
        cats_out.append(
            {
                "id": c["id"],
                "title": c["title"],
                "prefix": c["prefix"],
                "description": c.get("description", ""),
                "planned": c.get("planned", []),
                "lessonCount": sum(1 for ls in lessons if ls["category"] == c["id"]),
                "questionCount": sum(1 for q in questions if q["category"] == c["id"]),
            }
        )
    return {"categories": cats_out, "lessons": lessons_out, "questions": questions}


def build() -> dict:
    data = load_all()
    (SITE_DIR / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for stale in ("questions.json",):
        (SITE_DIR / stale).unlink(missing_ok=True)

    # 内容のハッシュをバージョンにする → 何か変わればキャッシュが更新される
    h = hashlib.sha256()
    for name in APP_SHELL:
        p = SITE_DIR / name
        if p.is_file():
            h.update(p.read_bytes())
    version = h.hexdigest()[:12]
    sw = SW_TEMPLATE.replace("__VERSION__", version).replace("__ASSETS__", json.dumps(APP_SHELL))
    (SITE_DIR / "sw.js").write_text(sw, encoding="utf-8")
    return {
        "lessons": len(data["lessons"]),
        "questions": len(data["questions"]),
        "categories": len(data["categories"]),
        "version": version,
    }


if __name__ == "__main__":
    info = build()
    print(
        f"data.json: {info['lessons']} レッスン / {info['questions']} 問 / {info['categories']} カテゴリ, "
        f"sw version={info['version']}"
    )
