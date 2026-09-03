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


@pytest.mark.parametrize("q", DATA["questions"], ids=lambda q: q["id"])
def test_each_question(q):
    prefix = next(c["prefix"] for c in DATA["categories"] if c["id"] == q["category"])
    assert q["id"].startswith(prefix + "-"), f"id の接頭辞はカテゴリの prefix ({prefix}-)"
