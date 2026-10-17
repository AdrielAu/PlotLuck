"""Distances between (lat, lon) points, shared by the build and the data audit.

One distance model throughout: great-circle distance on a sphere of
``EARTH_RADIUS_KM``. Clustering uses the equivalent straight-line chord
through the sphere, which a k-d tree can search.
"""

import math

import numpy as np
from scipy.spatial import cKDTree

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a, b) -> np.ndarray:
    """Great-circle distance in km between paired (lat, lon) points of ``a`` and ``b``."""
    lat1, lon1 = np.radians(np.asarray(a, dtype=float).reshape(-1, 2)).T
    lat2, lon2 = np.radians(np.asarray(b, dtype=float).reshape(-1, 2)).T
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(h))


def unit_xyz(points) -> np.ndarray:
    """(lat, lon) degrees -> points on the unit sphere."""
    lat, lon = np.radians(np.asarray(points, dtype=float).reshape(-1, 2)).T
    return np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))


def chord(km: float) -> float:
    """Unit-sphere straight-line length of a great-circle distance of ``km``."""
    return 2 * math.sin(km / (2 * EARTH_RADIUS_KM))


def cluster_points(points, radius_m: float) -> list[int]:
    """Cluster id per point; points within ``radius_m`` metres of each other, chained, share one id."""
    parent = list(range(len(points)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    if len(points) > 1:
        for i, j in cKDTree(unit_xyz(points)).query_pairs(chord(radius_m / 1000)):
            parent[find(i)] = find(j)
    return [find(i) for i in range(len(points))]
