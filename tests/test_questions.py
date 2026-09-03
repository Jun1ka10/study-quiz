"""問題ファイルの整合性テスト。問題を追加したら `uv run pytest` で確認する。"""

import pytest

from scripts.build import QUESTIONS_DIR, load_questions


def test_questions_dir_has_files():
    assert list(QUESTIONS_DIR.glob("*.yaml"))


def test_load_all_questions_is_valid():
    qs = load_questions()
    assert len(qs) > 0


@pytest.mark.parametrize("q", load_questions(), ids=lambda q: q["id"])
def test_each_question(q):
    assert q["question"].strip()
    assert q["explanation"].strip(), "解説は必須"
    assert len(set(q["choices"])) == len(q["choices"]), "選択肢が重複している"
    assert q["id"].startswith(q["category"][:2]), "id の接頭辞はカテゴリと揃える"
