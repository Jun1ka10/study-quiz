"""content/ (レッスン) と questions/ (問題プール) から site/data.json と site/sw.js を生成する。

使い方: uv run python scripts/build.py

入力:
  content/categories.yaml        カテゴリの並び・説明・今後書く予定のレッスン名
  content/<category>/NN-*.md     レッスン。frontmatter (id/title/summary/minutes) + 本文 Markdown。
                                 本文末尾の「## やってみる」節が課題 (必須)。NN が順番
  content/<category>/NN-*.yaml   同名 md の確認問題。lesson: が md の id と一致すること (必須)
  content/project/project.yaml   プロジェクトトラック (1 つのアプリを最初から最後まで作る道筋) の題名と説明
  content/project/NN-*.md        プロジェクトのステップ。frontmatter (id/title/summary/phase/prereqs/minutes) + 本文
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
SITE_DIR = ROOT / "site"
# Service Worker がキャッシュするファイル (site/ からの相対パス)
APP_SHELL = ["./", "index.html", "app.js", "style.css", "manifest.json", "data.json", "icon.svg"]

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.S)
LESSON_FILE_RE = re.compile(r"^(\d{2})-[a-z0-9-]+\.md$")
EXERCISE_HEADING = "\n## やってみる\n"

SW_TEMPLATE = """// 自動生成: scripts/build.py が書き出す。直接編集しない。
const VERSION = "__VERSION__";
const CACHE = "study-quiz-" + VERSION;
const ASSETS = __ASSETS__;

// install: 全ファイルを取り直してキャッシュ。cache: "reload" で HTTP キャッシュ (GitHub Pages は 10 分) を迂回する
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) =>
        fetch(new Request(u, { cache: "reload" })).then((r) => {
          if (!r.ok) throw new Error("fetch failed: " + u);
          return c.put(u, r);
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
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
    return markdown.markdown(
        text,
        extensions=["pymdownx.superfences", "pymdownx.highlight", "tables", "sane_lists"],
        # 構文ハイライトは使わない (pygments の有無で出力が変わらないように)
        extension_configs={"pymdownx.highlight": {"use_pygments": False}},
    )


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
        orphans = {y.name for y in cdir.glob("*.yaml")} - {m.with_suffix(".yaml").name for m in cdir.glob("*.md")}
        if orphans:
            raise ContentError(f"{cdir}: 対応する md の無い確認問題ファイル: {sorted(orphans)}")
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
            # 本文末尾の「## やってみる」節を課題として切り出す
            if EXERCISE_HEADING not in body:
                raise ContentError(f"{path}: 「## やってみる」節がありません (課題は必須)")
            main_md, exercise_md = body.split(EXERCISE_HEADING, 1)
            if not exercise_md.strip():
                raise ContentError(f"{path}: 「## やってみる」節が空です")
            body = main_md.rstrip()
            # 隣の yaml = 確認問題
            qpath = path.with_suffix(".yaml")
            if not qpath.exists():
                raise ContentError(f"{path}: 確認問題 {qpath.name} がありません")
            qdata = yaml.safe_load(qpath.read_text(encoding="utf-8")) or {}
            if qdata.get("lesson") != lid:
                raise ContentError(f"{qpath}: lesson ({qdata.get('lesson')}) が {path.name} の id ({lid}) と一致しません")
            questions = []
            for q in qdata.get("questions") or []:
                _validate_question(q, qpath.name, seen_qids)
                questions.append(_question_payload(q, cat["id"], titles[cat["id"]], lid))
            if len(questions) < 3:
                raise ContentError(f"{qpath}: 確認問題は 3 問以上必要です")
            lessons.append(
                {
                    "id": lid,
                    "category": cat["id"],
                    "order": int(m.group(1)),
                    "title": meta["title"],
                    "summary": meta.get("summary", ""),
                    "minutes": meta.get("minutes", 5),
                    "html": _md(body),
                    "exerciseHtml": _md(exercise_md.strip()),
                    "questions": questions,
                }
            )
    return lessons


def load_project(lesson_ids: set[str]) -> dict:
    """content/project/ のステップを順番付きで読む。prereqs は存在するレッスン id でなければならない。"""
    pdir = CONTENT_DIR / "project"
    meta_path = pdir / "project.yaml"
    if not meta_path.exists():
        return {"title": "", "description": "", "steps": []}
    meta = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
    steps: list[dict] = []
    seen: set[str] = set()
    for path in sorted(pdir.glob("*.md")):
        m = LESSON_FILE_RE.match(path.name)
        if not m:
            raise ContentError(f"{path}: ファイル名は NN-slug.md 形式にしてください")
        fm = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
        if not fm:
            raise ContentError(f"{path}: frontmatter がありません")
        st = yaml.safe_load(fm.group(1)) or {}
        body = fm.group(2).strip()
        sid = st.get("id")
        if not sid or sid in seen:
            raise ContentError(f"{path}: id が無いか重複しています")
        seen.add(sid)
        for key in ("title", "summary", "phase"):
            if not st.get(key):
                raise ContentError(f"{path}: frontmatter に {key} がありません")
        prereqs = st.get("prereqs") or []
        for lid in prereqs:
            if lid not in lesson_ids:
                raise ContentError(f"{path}: prereqs のレッスン {lid} が存在しません")
        if not body:
            raise ContentError(f"{path}: 本文が空です")
        steps.append(
            {
                "id": sid,
                "order": int(m.group(1)),
                "title": st["title"],
                "summary": st["summary"],
                "phase": st["phase"],
                "prereqs": prereqs,
                "minutes": st.get("minutes", 60),
                "html": _md(body),
            }
        )
    return {"title": meta["title"], "description": meta.get("description", ""), "steps": steps}


def load_all() -> dict:
    categories = load_categories()
    seen_qids: set[str] = set()
    lessons = load_lessons(categories, seen_qids)
    # 問題は必ずレッスンに属する。クライアントは lesson フィールドで引く
    questions = [q for ls in lessons for q in ls["questions"]]
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
    project = load_project({ls["id"] for ls in lessons})
    return {"categories": cats_out, "lessons": lessons_out, "questions": questions, "project": project}


def build() -> dict:
    data = load_all()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    # 内容のハッシュをバージョンにする → 何か変わればキャッシュが更新される。
    # data.json 自身には version を埋めるので、ハッシュは埋める前の payload で取る
    h = hashlib.sha256(payload.encode("utf-8"))
    for name in APP_SHELL:
        p = SITE_DIR / name
        if p.is_file() and name != "data.json":
            h.update(p.read_bytes())
    version = h.hexdigest()[:12]

    data["meta"] = {"version": version, "builtAt": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")}
    (SITE_DIR / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for stale in ("questions.json",):
        (SITE_DIR / stale).unlink(missing_ok=True)
    sw = SW_TEMPLATE.replace("__VERSION__", version).replace("__ASSETS__", json.dumps(APP_SHELL))
    (SITE_DIR / "sw.js").write_text(sw, encoding="utf-8")
    return {
        "steps": len(data["project"]["steps"]),
        "lessons": len(data["lessons"]),
        "questions": len(data["questions"]),
        "categories": len(data["categories"]),
        "version": version,
    }


if __name__ == "__main__":
    info = build()
    print(
        f"data.json: {info['lessons']} レッスン / {info['questions']} 問 / {info['categories']} カテゴリ / "
        f"プロジェクト {info['steps']} ステップ, "
        f"sw version={info['version']}"
    )
