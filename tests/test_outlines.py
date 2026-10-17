import numpy as np
import pytest

from plotluck import outlines

STEP = 0.002  # degrees between neighbouring synthetic postcodes, about 140 m east-west


def block(district, lat0, lon0, rows, cols, **fields):
    """A rows x cols grid of live residential postcodes with its south-west corner at (lat0, lon0)."""
    return [
        {"district": district, "lat": str(lat0 + r * STEP), "long": str(lon0 + c * STEP),
         "doterm": "", "usrtypind": "0", **fields}
        for r in range(rows) for c in range(cols)
    ]


def rings(result, code):
    """District ``code``'s rings as (lon, lat) arrays."""
    out = []
    for refs in result["districts"][code]:
        parts = []
        for k in refs:
            arc = outlines.decode_arc(result["arcs"][k if k >= 0 else ~k]) * result["quantum"]
            parts.append(arc if k >= 0 else arc[::-1])
        out.append(np.vstack([parts[0], *(p[1:] for p in parts[1:])]))
    return out


def area(ring):
    x, y = ring.T
    return 0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1))


def test_neighbouring_districts_meet_halfway_without_overlap():
    postcodes = block("AA1", 51.5, 0.0, 10, 10) + block("BB1", 51.5, 10 * STEP, 10, 10)

    result = outlines.district_outlines(postcodes, {"AA1", "BB1"})

    (a,), (b,) = rings(result, "AA1"), rings(result, "BB1")
    assert np.array_equal(a[0], a[-1]) and np.array_equal(b[0], b[-1])  # closed
    assert area(a) > 0 and area(b) > 0  # anticlockwise: the district is on the left
    # The shared edge runs halfway between the last AA1 column and the first BB1 column.
    assert a[:, 0].max() == pytest.approx(9.5 * STEP, abs=2 * result["quantum"])
    assert b[:, 0].min() == pytest.approx(9.5 * STEP, abs=2 * result["quantum"])
    shared = {k if k >= 0 else ~k for k in result["districts"]["AA1"][0]} & {
        k if k >= 0 else ~k for k in result["districts"]["BB1"][0]}
    assert shared  # one stored boundary serves both sides


def test_land_far_from_every_postcode_belongs_to_no_district():
    result = outlines.district_outlines(block("AA1", 51.5, 0.0, 5, 5), {"AA1"})

    (ring,) = rings(result, "AA1")
    km_per_degree_lat = 111.2
    reach_km = (ring[:, 1].max() - (51.5 + 4 * STEP)) * km_per_degree_lat
    assert 0 < reach_km <= outlines.GUARD_KM


def test_business_and_terminated_postcodes_draw_nothing():
    postcodes = (
        block("AA1", 51.5, 0.0, 10, 10)
        # AA1 business and terminated postcodes far east must not pull its outline there.
        + block("AA1", 51.5, 0.3, 3, 3, usrtypind="1")
        + block("AA1", 51.5, 0.5, 3, 3, doterm="201001")
        + block("BD97", 51.5, 0.1, 2, 2, usrtypind="1")  # a business-only district
    )

    result = outlines.district_outlines(postcodes, {"AA1", "BD97"})

    assert list(result["districts"]) == ["AA1"]
    (ring,) = rings(result, "AA1")
    assert ring[:, 0].max() < 0.1


def test_a_district_inside_another_is_a_hole_in_it():
    outer = [p for p in block("AA1", 51.5, 0.0, 15, 15)
             if not (5 <= round((float(p["lat"]) - 51.5) / STEP) < 10 and 5 <= round(float(p["long"]) / STEP) < 10)]
    postcodes = outer + block("BB1", 51.5 + 5 * STEP, 5 * STEP, 5, 5)

    result = outlines.district_outlines(postcodes, {"AA1", "BB1"})

    outside, hole = sorted(rings(result, "AA1"), key=area, reverse=True)
    (inner,) = rings(result, "BB1")
    assert area(outside) > 0 > area(hole)  # the hole runs clockwise
    assert area(hole) == pytest.approx(-area(inner))


def test_districts_left_out_still_claim_their_land():
    postcodes = block("AA1", 51.5, 0.0, 10, 10) + block("BB1", 51.5, 10 * STEP, 10, 10)

    result = outlines.district_outlines(postcodes, {"AA1"})

    assert list(result["districts"]) == ["AA1"]
    (a,) = rings(result, "AA1")
    assert a[:, 0].max() == pytest.approx(9.5 * STEP, abs=2 * result["quantum"])


def test_postcodes_sharing_a_point_go_to_the_district_with_more_there():
    shared = {"lat": "51.51", "long": "0.01", "doterm": "", "usrtypind": "0"}
    postcodes = block("AA1", 51.5, 0.0, 10, 10) + [
        {"district": "ZZ1", **shared}, {"district": "AA1", **shared}, {"district": "AA1", **shared},
    ]

    result = outlines.district_outlines(postcodes, {"AA1", "ZZ1"})

    assert list(result["districts"]) == ["AA1"]
