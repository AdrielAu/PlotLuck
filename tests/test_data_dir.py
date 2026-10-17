import pytest

from plotluck import data_dir
from plotluck.data import ENV_VAR


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.delenv(ENV_VAR, raising=False)
    (tmp_path / "data" / "sample").mkdir(parents=True)
    return tmp_path


def add_full_dir(root):
    (root / "data" / "full").mkdir()


def test_sample_overrides_existing_full(root, monkeypatch):
    add_full_dir(root)
    monkeypatch.setenv(ENV_VAR, "sample")
    assert data_dir(root) == root / "data" / "sample"


def test_full_requested(root, monkeypatch):
    add_full_dir(root)
    monkeypatch.setenv(ENV_VAR, "full")
    assert data_dir(root) == root / "data" / "full"


def test_unset_with_full_present_returns_full(root):
    add_full_dir(root)
    assert data_dir(root) == root / "data" / "full"


def test_unset_without_full_returns_sample(root):
    assert data_dir(root) == root / "data" / "sample"


def test_invalid_value_names_allowed_values(root, monkeypatch):
    monkeypatch.setenv(ENV_VAR, "bogus")
    with pytest.raises(ValueError, match="sample.*full"):
        data_dir(root)


def test_independent_of_working_directory(monkeypatch, tmp_path):
    monkeypatch.delenv(ENV_VAR, raising=False)
    first = data_dir()
    monkeypatch.chdir(tmp_path)
    assert data_dir() == first
    assert first.is_absolute()
