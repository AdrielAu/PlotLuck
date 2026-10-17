import pytest

from plotluck import geometry


def metres_north(m):
    return (51.5 + m / 1000 / geometry.EARTH_RADIUS_KM * 57.29577951308232, -0.1)


def test_cluster_points_chains_points_within_the_radius():
    points = [metres_north(0), metres_north(40), metres_north(80), metres_north(500)]
    labels = geometry.cluster_points(points, 50)
    assert labels[0] == labels[1] == labels[2] != labels[3]


def test_cluster_points_handles_no_and_one_point():
    assert geometry.cluster_points([], 50) == []
    assert len(geometry.cluster_points([(51.5, 0.0)], 50)) == 1


def test_haversine_km_is_great_circle_distance():
    km = geometry.haversine_km([(51.0, 0.0), (51.0, 0.0)], [(52.0, 0.0), (51.0, 0.0)])
    assert km == pytest.approx([111.19, 0.0], abs=0.01)
