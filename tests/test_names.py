import pytest

from plotluck.names import normalise_name


@pytest.mark.parametrize("raw, expected", [
    ("Nando's", "nandos"),
    ("Nandos", "nandos"),
    ("NANDO’S", "nandos"),
    ("Café  Rouge", "cafe rouge"),
    ("Fish & Chips", "fish and chips"),
    ("Fish&Chips", "fish and chips"),
    ("Wagamama, Soho.", "wagamama soho"),
    ("  The   Crown ", "the crown"),
    ("", ""),
])
def test_normalise_name(raw, expected):
    assert normalise_name(raw) == expected


@pytest.mark.parametrize("raw, expected", [
    ("Pizza Express - Soho", "pizza express"),
    ("Pizza Express (Kings Cross)", "pizza express"),
    ("Pizza Express - Soho (Old)", "pizza express soho"),
    ("Jean-Luc's", "jean lucs"),
    ("Pizza Express", "pizza express"),
])
def test_suffix_removal_is_optional_and_drops_one_trailing_branch(raw, expected):
    assert normalise_name(raw, drop_branch_suffix=True) == expected


def test_suffix_kept_by_default():
    assert normalise_name("Pizza Express - Soho") == "pizza express soho"
