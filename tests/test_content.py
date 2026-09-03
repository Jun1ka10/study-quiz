"""レッスンと問題の整合性テスト。内容を追加したら `uv run pytest` で確認する。"""

import pytest

from scripts.build import load_all

DATA = load_all()


def test_has_content():
    assert DATA["categories"]
    assert DATA["lessons"]
    assert DATA["questions"]


def test_every_category_has_at_least_one_lesson():
    with_lessons = {ls["category"] for ls in DATA["lessons"]}
    missing = [c["id"] for c in DATA["categories"] if c["id"] not in with_lessons]
    assert not missing, f"レッスンが無いカテゴリ: {missing}"


@pytest.mark.parametrize("lesson", DATA["lessons"], ids=lambda ls: ls["id"])
def test_each_lesson(lesson):
    qs = [q for q in DATA["questions"] if q["lesson"] == lesson["id"]]
    assert len(qs) >= 3, "確認問題は 3 問以上"
    assert "<h1" not in lesson["html"], "本文に h1 は書かない (タイトルは frontmatter)"
    assert lesson["summary"], "summary は必須 (ホーム画面の一覧に出る)"
    assert lesson["exerciseHtml"], "「## やってみる」節は必須。読んで終わりにしない"


def test_every_question_belongs_to_a_lesson():
    lesson_ids = {ls["id"] for ls in DATA["lessons"]}
    assert all(q["lesson"] in lesson_ids for q in DATA["questions"])


@pytest.mark.parametrize("q", DATA["questions"], ids=lambda q: q["id"])
def test_each_question(q):
    prefix = next(c["prefix"] for c in DATA["categories"] if c["id"] == q["category"])
    assert q["id"].startswith(prefix + "-"), f"id の接頭辞はカテゴリの prefix ({prefix}-)"


def test_project_has_steps():
    assert DATA["project"]["steps"], "プロジェクトトラックにステップが無い"


@pytest.mark.parametrize("step", DATA["project"]["steps"], ids=lambda st: st["id"])
def test_each_step(step):
    assert step["prereqs"], "各ステップは先に読むレッスンを 1 つ以上指す"
    assert "<h1" not in step["html"]
    assert "できたか確認" in step["html"], "各ステップに「できたか確認」の節を置く"
