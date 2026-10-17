import pytest

from plotluck import data_dir


@pytest.fixture
def layout(tmp_path, monkeypatch):
    monkeypatch.delenv("PLOTLUCK_DATA", raising=False)
    (tmp_path / "data" / "sample").mkdir(parents=True)
    return tmp_path


def add_full(root):
    (root / "data" / "full").mkdir()


def test_sample_overrides_existing_full(layout, monkeypatch):
    add_full(layout)
    monkeypatch.setenv("PLOTLUCK_DATA", "sample")
    assert data_dir(layout) == layout / "data" / "sample"


def test_full_requested(layout, monkeypatch):
    add_full(layout)
    monkeypatch.setenv("PLOTLUCK_DATA", "full")
    assert data_dir(layout) == layout / "data" / "full"


def test_unset_with_full_present_returns_full(layout):
    add_full(layout)
    assert data_dir(layout) == layout / "data" / "full"


def test_unset_without_full_returns_sample(layout):
    assert data_dir(layout) == layout / "data" / "sample"


def test_invalid_value_names_allowed_values(layout, monkeypatch):
    monkeypatch.setenv("PLOTLUCK_DATA", "bogus")
    with pytest.raises(ValueError, match="sample.*full"):
        data_dir(layout)


def test_independent_of_working_directory(monkeypatch, tmp_path):
    monkeypatch.delenv("PLOTLUCK_DATA", raising=False)
    first = data_dir()
    monkeypatch.chdir(tmp_path)
    assert data_dir() == first
    assert first.is_absolute()
