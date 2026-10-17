from collections import Counter

import pytest

from plotluck import label

# A fixed policy so known answers can be worked by hand.
POLICY = {"R0": 0.5, "D0": 0.6, "n_ref": 99}


def restaurant(rating="4.0", total=20, counts=(10, 5, 3, 1, 1)):
    """A restaurant row with the ADR 0004 review columns."""
    return {
        "avg_rating": rating,
        "total_reviews": total,
        **{f"count_{c}": n for c, n in zip(label.CATEGORIES, counts)},
    }


def test_label_matches_a_worked_example():
    # R = 0.75, D = 15.3 / 20 = 0.765, R_s = 0.625, D_s = 0.6825,
    # V = ln 21 / ln 100 = 0.661110; 0.5 R_s + 0.3 D_s + 0.2 V = 0.649472.
    assert label.labels([restaurant()], POLICY) == [pytest.approx(0.649472, abs=1e-6)]


@pytest.mark.parametrize("counts", [(10, "", 3, 1, 1), (0, 0, 0, 0, 0), ("",) * 5])
def test_distribution_term_falls_back_to_d0_without_a_full_set_of_counts(counts):
    # D_s = D0 = 0.6, so 0.5 * 0.625 + 0.3 * 0.6 + 0.2 * 0.661110 = 0.624722.
    assert label.labels([restaurant(counts=counts)], POLICY) == [pytest.approx(0.624722, abs=1e-6)]


@pytest.mark.parametrize(
    "row, reason",
    [
        (restaurant(rating=""), "rating_missing"),
        (restaurant(rating="5.5"), "rating_out_of_range"),
        (restaurant(rating="0.0"), "rating_out_of_range"),
        (restaurant(total=""), "n_total_missing"),
        (restaurant(total="nan"), "n_total_missing"),  # pandas writes a blank as nan
        (restaurant(total=0, counts=(0,) * 5), "n_total_zero"),
        (restaurant(rating="1.0", counts=(0, 0, 0, 0, 20)), None),  # edges of the range are fine
        (restaurant(rating="5.0", total=1, counts=("",) * 5), None),  # one review is enough
    ],
)
def test_only_a_bad_rating_or_no_reviews_excludes_a_row(row, reason):
    assert label.exclusion(row) == reason
    assert (label.labels([row], POLICY)[0] is None) == (reason is not None)


FIT_ROWS = [
    restaurant(rating="5.0", total=10, counts=(10, 0, 0, 0, 0)),  # R = 1, D = 1
    restaurant(rating="3.0", total=30, counts=(0, 0, 30, 0, 0)),  # R = 0.5, D = 0.4
    restaurant(rating="1.0", total=100, counts=("",) * 5),  # R = 0, no D
    restaurant(rating="", total=50, counts=(0, 0, 0, 0, 50)),  # excluded: D = 0 must not count
]


def test_policy_is_fitted_on_the_eligible_rows_passed_in():
    # n_ref is numpy's linear 95th percentile: 30 + 0.9 * 70 = 93 and 10 + 0.95 * 20 = 29.
    assert label.fit_policy(FIT_ROWS) == pytest.approx({"R0": 0.5, "D0": 0.7, "n_ref": 93.0})
    assert label.fit_policy(FIT_ROWS[:2]) == pytest.approx({"R0": 0.75, "D0": 0.7, "n_ref": 29.0})


def test_policy_needs_eligible_rows_with_counts():
    with pytest.raises(ValueError, match="eligible"):
        label.fit_policy(FIT_ROWS[3:])
    with pytest.raises(ValueError, match="counts"):
        label.fit_policy(FIT_ROWS[2:3])


def source(total, counts):
    """A Tripadvisor source row's review columns, as the CSV spells them."""
    return {"avg_rating": "4.0", "total_reviews_count": total, **dict(zip(label.CATEGORIES, counts))}


@pytest.mark.parametrize(
    "total, counts, n_total, fix",
    [
        ("30.0", ("10.0", "5.0", "3.0", "1.0", "1.0"), 30, None),  # counts are a lower bound
        ("15.0", ("10.0", "5.0", "3.0", "1.0", "1.0"), 20, "total_below_counts"),
        ("", ("10.0", "5.0", "3.0", "1.0", "1.0"), 20, "total_missing"),
        ("30.0", ("10.0", "", "3.0", "1.0", "1.0"), 30, "counts_partly_missing"),
        ("30.0", ("",) * 5, 30, "counts_missing_or_zero"),
        ("30.0", ("0.0",) * 5, 30, "counts_missing_or_zero"),
        ("", ("",) * 5, "", "counts_missing_or_zero"),  # no n_total either; excluded later
    ],
)
def test_review_fields_repair_n_total_and_count_each_fix(total, counts, n_total, fix):
    fixes = Counter()

    fields = label.review_fields(source(total, counts), fixes)

    assert fields["avg_rating"] == "4.0"
    assert fields["total_reviews"] == n_total
    assert fields["count_excellent"] == (10 if counts[0] == "10.0" else 0 if counts[0] else "")
    assert fixes == (Counter({fix: 1}) if fix else Counter())
