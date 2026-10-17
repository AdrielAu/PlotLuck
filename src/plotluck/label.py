"""The review-based success label: ADR 0002 as amended by issue #47.

``Label = 0.50·R_s + 0.30·D_s + 0.20·V`` on restaurant rows with the ADR 0004
review columns (``avg_rating``, ``total_reviews`` = n_total, ``count_*``).
"""

import math
import statistics
from collections import Counter

import numpy as np

PRIOR_REVIEWS = 20
# Category utility for the distribution term D, in source column order.
UTILITY = {"excellent": 1.0, "very_good": 0.8, "average": 0.4, "poor": 0.1, "terrible": 0.0}
CATEGORIES = tuple(UTILITY)
# Audit-only thresholds: the counts cover default-language reviews, so allow a full star of drift.
ANOMALY_STARS = 1.0
ANOMALY_MIN_COUNTS = 10
ANOMALIES = ("rating_disagrees_with_counts", "rating_off_half_step")


def review_fields(row: dict, fixes: Counter) -> dict:
    """ADR 0004 review columns from a Tripadvisor source row.

    n_total = max(total, n_default), over whichever of the two is present
    (issue #47). A negative count is treated as missing. Each repair on a row
    that gets a label is counted in ``fixes`` by reason.
    """
    counts = [n if n is not None and n >= 0 else None for n in map(_int, (row[c] for c in CATEGORIES))]
    total = _int(row["total_reviews_count"])
    n_default = _n_default(counts)
    repairs = []
    if n_default is None:
        repairs.append("counts_missing_or_zero" if counts.count(None) == len(counts) else "counts_partly_missing")
    elif n_default == 0:
        repairs.append("counts_missing_or_zero")
    if n_default is not None and (total is None or total < n_default):
        repairs.append("total_missing" if total is None else "total_below_counts")
        total = n_default
    fields = {
        "avg_rating": row["avg_rating"],
        "total_reviews": "" if total is None else total,
        **{f"count_{c}": "" if n is None else n for c, n in zip(CATEGORIES, counts)},
    }
    if not exclusion(fields):
        fixes.update(repairs)
    return fields


def exclusion(r: dict) -> str | None:
    """Why a restaurant gets no label, or None when it is eligible."""
    rating = _number(r["avg_rating"])
    n_total = _number(r["total_reviews"])
    if rating is None:
        return "rating_missing"
    if not 1 <= rating <= 5:
        return "rating_out_of_range"
    if n_total is None:
        return "n_total_missing"
    if n_total <= 0:
        return "n_total_zero"
    return None


def anomalies(r: dict) -> list[str]:
    """Audit flags for a labelled row whose review source looks suspect; never changes its label.

    ``rating_disagrees_with_counts``: the rating is more than ``ANOMALY_STARS``
    from the star mean of at least ``ANOMALY_MIN_COUNTS`` default-language
    reviews. ``rating_off_half_step``: Tripadvisor shows ratings in half stars.
    """
    if exclusion(r):
        return []
    flags = []
    rating = _number(r["avg_rating"])
    counts = [_number(r[f"count_{c}"]) for c in CATEGORIES]
    n_default = _n_default(counts)
    if n_default and n_default >= ANOMALY_MIN_COUNTS:
        star_mean = sum(n * stars for n, stars in zip(counts, (5, 4, 3, 2, 1))) / n_default
        if abs(rating - star_mean) > ANOMALY_STARS:
            flags.append("rating_disagrees_with_counts")
    if abs(rating * 2 - round(rating * 2)) > 1e-9:
        flags.append("rating_off_half_step")
    return flags


def fit_policy(restaurants: list[dict]) -> dict:
    """R0, D0 and n_ref fitted on the eligible rows among ``restaurants``.

    Fit on the training rows only (a CV fold's training side, or every row
    for the shipped model). D0 averages D over rows with a full set of counts.
    The fitted values derive from ratings, so they never enter the bundle.
    """
    eligible = [r for r in restaurants if not exclusion(r)]
    if not eligible:
        raise ValueError("no eligible rows to fit the label policy on")
    distributions = [d[0] for d in map(_distribution, eligible) if d is not None]
    if not distributions:
        raise ValueError("no eligible rows with category counts to fit D0 on")
    return {
        "R0": statistics.fmean(_rating(r) for r in eligible),
        "D0": statistics.fmean(distributions),
        "n_ref": float(np.percentile([_number(r["total_reviews"]) for r in eligible], 95)),
    }


def labels(restaurants: list[dict], policy: dict) -> list[float | None]:
    """The label of each restaurant under a fitted ``policy`` (R0, D0, n_ref).

    None for a restaurant that ``exclusion`` rules out.
    """
    out = []
    for r in restaurants:
        if exclusion(r):
            out.append(None)
            continue
        n_total = _number(r["total_reviews"])
        d = _distribution(r)
        r_s = _smooth(_rating(r), n_total, policy["R0"])
        # Issue #47: without a full, non-zero set of counts, D_s = D0.
        d_s = policy["D0"] if d is None else _smooth(d[0], d[1], policy["D0"])
        v = min(math.log1p(n_total) / math.log1p(policy["n_ref"]), 1.0)
        out.append(0.50 * r_s + 0.30 * d_s + 0.20 * v)
    return out


def _rating(r: dict) -> float:
    """R: the 1-5 rating on 0-1."""
    return (_number(r["avg_rating"]) - 1) / 4


def _distribution(r: dict) -> tuple[float, float] | None:
    """(D, n_default), or None when ``_n_default`` gives no counts to use."""
    counts = [_number(r[f"count_{c}"]) for c in CATEGORIES]
    n_default = _n_default(counts)
    if not n_default:
        return None
    return sum(n * u for n, u in zip(counts, UTILITY.values())) / n_default, n_default


def _n_default(counts: list[float | None]) -> float | None:
    """Sum of the category counts; None unless all are present and non-negative.

    A None or 0 result means D_s = D0 (issue #47).
    """
    if any(n is None or n < 0 for n in counts):
        return None
    return sum(counts)


def _smooth(value: float, n: float, prior: float) -> float:
    return (n * value + PRIOR_REVIEWS * prior) / (n + PRIOR_REVIEWS)


def _number(value) -> float | None:
    """A CSV cell or number as a float; None when blank, nan or not a number."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _int(value) -> int | None:
    number = _number(value)
    return None if number is None else int(number)  # source counts look like "347.0"
