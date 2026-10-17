"""Estimated postcode-district outlines from ONSPD postcode points.

No open boundary exists for postcode districts (ADR 0004), so each live
residential postcode gets the land closer to it than to any other (its Voronoi
cell), and a district is the union of its postcodes' cells. Land farther than
``GUARD_KM`` from every postcode belongs to no district, which stops cells
running out to sea, over the Welsh and Scottish borders or across empty moors.

Business (large-user) postcodes are left out: Royal Mail places many at a
delivery office kilometres from the district they serve. A district with no
residential postcode of its own gets no outline; the site draws it as a circle.

The output is TopoJSON-like. A boundary shared by two districts is one "arc",
stored once, so simplifying it moves both sides together and no gap opens.
Each district lists its rings as arc indices; ``~i`` means arc ``i`` reversed.
An arc is flat integers ``[x0, y0, dx1, dy1, ...]`` in units of ``QUANTUM_DEG``
of longitude and latitude, each pair after the first a step from the last.
"""

import math
from collections import Counter, defaultdict

import numpy as np
from scipy.spatial import Voronoi, cKDTree

GUARD_KM = 1.5
SIMPLIFY_KM = 0.02  # finer than the map shows at street-level zoom
QUANTUM_DEG = 1e-4  # about 7 m of longitude and 11 m of latitude in England
RESIDENTIAL = "0"  # ONSPD usrtypind: 0 small user, 1 large user
# A flat projection good to a few percent across England: the outlines are estimates anyway.
_LAT0 = 52.5
_KX = math.cos(math.radians(_LAT0)) * math.pi / 180 * 6371.0088
_KY = math.pi / 180 * 6371.0088
_NOBODY = -1


def district_outlines(postcodes: list[dict], codes: set[str]) -> dict:
    """Outlines of the districts in ``codes``, from every postcode row in ``postcodes``.

    Districts outside ``codes`` still claim their land, so a neighbour's outline
    stops at their edge; they are just not written out.
    """
    names, owner, xy = _owned_points(postcodes)
    if not len(xy):
        return {"quantum": QUANTUM_DEG, "arcs": [], "districts": {}}
    guards = _guard_points(xy)
    points = np.vstack([xy, guards])
    owner = np.concatenate([owner, np.full(len(guards), _NOBODY)])
    vor = Voronoi(points)
    i, j = np.asarray(vor.ridge_points).T
    verts = np.asarray(vor.ridge_vertices)
    boundary = owner[i] != owner[j]
    i, j, verts = i[boundary], j[boundary], verts[boundary]
    if (verts == -1).any():
        raise ValueError("a district cell is unbounded; the guard frame is too small")
    # Orient each boundary edge with point i's district on its left: i lies left of
    # any direction that turns (j - i) a quarter turn anticlockwise.
    a, b = verts.T
    turn = np.column_stack([points[i, 1] - points[j, 1], points[j, 0] - points[i, 0]])
    forward = np.einsum("ij,ij->i", vor.vertices[b] - vor.vertices[a], turn) >= 0
    arcs, sides = _arcs(np.where(forward, a, b), np.where(forward, b, a), owner[i], owner[j])

    out_arcs, renumber, districts = [], {}, {}
    for d, code in enumerate(names):
        if code not in codes:
            continue
        rings = []
        for ring in _rings(arcs, sides, d):
            refs = []
            for k in ring:
                arc = k if k >= 0 else ~k
                if arc not in renumber:
                    renumber[arc] = len(out_arcs)
                    out_arcs.append(_encode(_simplify(vor.vertices[arcs[arc]])))
                refs.append(renumber[arc] if k >= 0 else ~renumber[arc])
            if len(_ring_points(refs, out_arcs)) >= 3:
                rings.append(refs)
        if rings:
            districts[code] = rings
    return {"quantum": QUANTUM_DEG, "arcs": out_arcs, "districts": districts}


def _owned_points(postcodes: list[dict]):
    """District names, and each distinct residential point's district index and position.

    Postcodes of two districts can share a point; the district with more there owns it.
    """
    at = defaultdict(Counter)
    for p in postcodes:
        lat, lon = _float(p["lat"]), _float(p["long"])
        if p["doterm"] or p["usrtypind"] != RESIDENTIAL or lat is None or lon is None or lat > 90:
            continue
        at[(lat, lon)][p["district"]] += 1
    names = sorted({code for counts in at.values() for code in counts})
    index = {code: k for k, code in enumerate(names)}
    owner = np.array([index[min(c, key=lambda code: (-c[code], code))] for c in at.values()], dtype=int)
    xy = np.array([(lon * _KX, lat * _KY) for lat, lon in at], dtype=float).reshape(-1, 2)
    return names, owner, xy


def _float(value):
    try:
        return float(value)
    except ValueError:
        return None


def _guard_points(xy: np.ndarray) -> np.ndarray:
    """Grid points farther than ``GUARD_KM`` from every postcode, framing them all."""
    lo, hi = xy.min(axis=0) - 3 * GUARD_KM, xy.max(axis=0) + 3 * GUARD_KM
    gx, gy = np.meshgrid(np.arange(lo[0], hi[0] + GUARD_KM, GUARD_KM), np.arange(lo[1], hi[1] + GUARD_KM, GUARD_KM))
    grid = np.column_stack([gx.ravel(), gy.ravel()])
    far, _ = cKDTree(xy).query(grid)
    return grid[far > GUARD_KM]


def _arcs(start, end, left, right):
    """Chain boundary edges into arcs: runs between vertices where three or more edges meet.

    Returns each arc's vertex ids and its (left, right) districts. Along a run,
    every edge separates the same two districts, so one pair describes the arc.
    """
    degree = Counter(start.tolist()) + Counter(end.tolist())
    touching = defaultdict(list)
    for e, (s, t) in enumerate(zip(start.tolist(), end.tolist())):
        touching[s].append(e)
        touching[t].append(e)
    used = np.zeros(len(start), dtype=bool)
    arcs, sides = [], []

    def walk(e, v):
        """Follow edges from vertex ``v`` along ``e`` until a junction or back to ``v``."""
        line, first = [v], e
        while True:
            used[e] = True
            v = int(end[e]) if start[e] == line[-1] else int(start[e])
            line.append(v)
            if degree[v] != 2 or v == line[0]:
                break
            e = next(f for f in touching[v] if not used[f])
        forward = start[first] == line[0]
        arcs.append(np.array(line))
        sides.append((int(left[first]), int(right[first])) if forward else (int(right[first]), int(left[first])))

    for v, edges in touching.items():
        if degree[v] != 2:
            for e in edges:
                if not used[e]:
                    walk(e, v)
    for e in range(len(start)):  # closed loops: an island inside one other district
        if not used[e]:
            walk(e, int(start[e]))
    return arcs, sides


def _rings(arcs, sides, d: int) -> list[list[int]]:
    """District ``d``'s closed rings as arc refs, each turned so ``d`` is on its left."""
    from_vertex = defaultdict(list)
    for k, (left, right) in enumerate(sides):
        if left == d:
            from_vertex[int(arcs[k][0])].append(k)
        if right == d:
            from_vertex[int(arcs[k][-1])].append(~k)
    tail = lambda ref: int(arcs[ref][-1]) if ref >= 0 else int(arcs[~ref][0])
    rings = []
    for v in list(from_vertex):
        while from_vertex[v]:
            ring, first = [from_vertex[v].pop()], v
            while tail(ring[-1]) != first:
                ring.append(from_vertex[tail(ring[-1])].pop())
            rings.append(ring)
    return rings


def _simplify(xy: np.ndarray) -> np.ndarray:
    """Douglas-Peucker to ``SIMPLIFY_KM``, keeping both ends; a closed arc keeps a triangle."""
    keep = np.zeros(len(xy), dtype=bool)
    keep[[0, -1]] = True
    spans = [(0, len(xy) - 1)]
    if len(xy) > 3 and np.array_equal(xy[0], xy[-1]):
        third = len(xy) // 3
        keep[[third, 2 * third]] = True
        spans = [(0, third), (third, 2 * third), (2 * third, len(xy) - 1)]
    while spans:
        i, j = spans.pop()
        if j <= i + 1:
            continue
        chord, rest = xy[j] - xy[i], xy[i + 1:j] - xy[i]
        length = math.hypot(*chord)
        off = np.abs(chord[0] * rest[:, 1] - chord[1] * rest[:, 0]) / length if length else np.hypot(*rest.T)
        k = int(np.argmax(off))
        if off[k] > SIMPLIFY_KM:
            keep[i + 1 + k] = True
            spans += [(i, i + 1 + k), (i + 1 + k, j)]
    return xy[keep]


def _encode(xy: np.ndarray) -> list[int]:
    q = np.column_stack([np.round(xy[:, 0] / _KX / QUANTUM_DEG), np.round(xy[:, 1] / _KY / QUANTUM_DEG)]).astype(int)
    q = q[np.r_[True, (np.diff(q, axis=0) != 0).any(axis=1)]]
    if len(q) == 1:  # a short arc whose ends round to one point still joins its neighbours
        q = np.vstack([q, q])
    return np.vstack([q[:1], np.diff(q, axis=0)]).ravel().tolist()


def decode_arc(arc: list[int]) -> np.ndarray:
    """An arc's points as (x, y) integers in ``QUANTUM_DEG`` units."""
    return np.cumsum(np.asarray(arc, dtype=int).reshape(-1, 2), axis=0)


def _ring_points(refs: list[int], arcs: list[list[int]]) -> set[tuple[int, int]]:
    return {tuple(p) for k in refs for p in decode_arc(arcs[k if k >= 0 else ~k]).tolist()}
