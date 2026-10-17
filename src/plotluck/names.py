"""Restaurant-name normalisation, shared by the data audit and the cleaning stages.

``normalise_name`` makes spelling variants of one name compare equal
("Nando's" / "Nandos" / "NANDO’S"). With ``drop_branch_suffix`` it also removes
one trailing branch marker (" - Soho", " (Kings Cross)").
"""

import re
import unicodedata

# A trailing " - Branch" (spaced dash, so "Jean-Luc" is safe) or " (Branch)".
_DASH_SUFFIX = re.compile(r"\s+[-–—]\s+[^-–—]+$")
_PAREN_SUFFIX = re.compile(r"\s*\([^()]*\)$")
_APOSTROPHES = "'’‘ʼ`´"
_PUNCTUATION = re.compile(r"[^\w\s]|_")


def normalise_name(name: str, *, drop_branch_suffix: bool = False) -> str:
    """Casefold, strip accents, drop apostrophes and punctuation, map ``&`` to ``and``, collapse spaces."""
    if drop_branch_suffix:
        name = name.strip()
        stripped = _PAREN_SUFFIX.sub("", name)
        name = stripped if stripped != name else _DASH_SUFFIX.sub("", name)
    text = unicodedata.normalize("NFKD", name.casefold())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("&", " and ")
    text = text.translate({ord(c): None for c in _APOSTROPHES})
    text = _PUNCTUATION.sub(" ", text)
    return " ".join(text.split())
