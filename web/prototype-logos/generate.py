"""Draws the Plotluck logo variants on pixel grids and writes them as crisp-edged SVGs."""
import sys
from pathlib import Path

C = {
    "c": "#f7f6f3", "d": "#e4e2d6", "g": "#bacfa9", "r": "#c27a4a",
    "G": "#284c29", "F": "#4a7a4a", "w": "#f7f6f3", "k": "#2f3437", "s": "#9aa0a1",
    "o": "#c4602f", "R": "#c8372d", "h": "#5e9a3a", "y": "#f6c84a",
}


def grid(n):
    return [[None] * n for _ in range(n)]


def put(g, x, y, c):
    if 0 <= y < len(g) and 0 <= x < len(g):
        g[y][x] = c


def row(g, y, x0, x1, c):
    for x in range(x0, x1 + 1):
        put(g, x, y, c)


FOOD = "oyRhoyho"


def band(g, d0, d1, s0, s1, colour):
    """Fills cells whose x - y lies in [d0, d1] and x + y in [s0, s1]: a block tilted 45 degrees.

    Along the pin, x - y grows toward the pot's mouth (up-right); x + y runs across the pot.
    """
    n = len(g)
    for y in range(n):
        for x in range(n):
            if d0 <= x - y <= d1 and s0 <= x + y <= s1:
                put(g, x, y, colour if colour != "food" else FOOD[(x + 2 * y) % len(FOOD)])


def pot(g, d, s, w, handles=True):
    """A pot tipped 45 degrees up-right: base at x - y = d, axis at x + y = s, body w across."""
    lo, hi = s - w // 2, s + w // 2
    band(g, d, d + 7, lo, hi, "G")
    band(g, d, d, lo, lo + 1, None); band(g, d, d, hi - 1, hi, None)  # round the base corners
    band(g, d + 2, d + 6, lo + 2, lo + 2, "F")
    if handles:
        band(g, d + 5, d + 6, lo - 2, lo - 1, "G"); band(g, d + 5, d + 6, hi + 1, hi + 2, "G")
    band(g, d + 8, d + 9, lo - 1, hi + 1, "g")
    band(g, d + 8, d + 9, lo - 2, lo - 2, "G"); band(g, d + 8, d + 9, hi + 2, hi + 2, "G")
    band(g, d + 10, d + 11, lo, hi, "food")
    band(g, d + 12, d + 13, lo + 2, hi - 2, "food")


def spill(g, cells):
    for i, (x, y) in enumerate(cells):
        put(g, x, y, FOOD[i % len(FOOD)])


def steam(g, cells):
    for x, y in cells:
        put(g, x, y, "s")


def needle(g, x0, y0, length):
    """A two-pixel stair running diagonally down-left from (x0, y0)."""
    for i in range(length):
        put(g, x0 - i, y0 + i, "k"); put(g, x0 + 1 - i, y0 + i, "k")


def outline(g, fills):
    """Turns every filled cell in `fills` that touches an empty cell into outline green."""
    n = len(g)
    edge = [(x, y) for y in range(n) for x in range(n) if g[y][x] is not None and g[y][x] in fills and any(
        not (0 <= x + dx < n and 0 <= y + dy < n) or g[y + dy][x + dx] is None
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        g[y][x] = "G"


def folded():
    g = grid(24)

    def top(x):
        panel, local = divmod(x, 8)
        step = round(local * 3 / 7)
        return 17 - step if panel % 2 == 0 else 14 + step

    for x in range(24):
        t, shade = top(x), x // 8 == 1
        for y in range(t, t + 7):
            put(g, x, y, "d" if shade else "c")
        put(g, x, t + 3, "r")
        if 2 <= x <= 5 or 18 <= x <= 21:
            put(g, x, t + 1, "g"); put(g, x, t + 2, "g")
        if 9 <= x <= 11 or 14 <= x <= 15:
            put(g, x, t + 5, "g")
        if 3 <= x <= 6:
            put(g, x, t + 5, "g")
    outline(g, "cdgr")
    for x in (8, 16):
        for y in range(top(x), top(x) + 7):
            put(g, x, y, "G")
    needle(g, 13, 10, 7)
    pot(g, 3, 23, 9)
    spill(g, [(22, 7), (23, 8), (23, 9), (22, 10), (22, 11), (22, 12), (21, 13), (23, 13)])
    steam(g, [(15, 3), (14, 2), (15, 1), (14, 0), (18, 1), (17, 0)])
    return g


def mark():
    g = grid(16)
    needle(g, 8, 7, 7)
    pot(g, 2, 15, 7, handles=False)
    spill(g, [(15, 6), (15, 7), (14, 8)])
    steam(g, [(10, 1), (9, 0), (12, 0)])
    return g


def svg(g):
    n, rects = len(g), []
    for y, cells in enumerate(g):
        x = 0
        while x < n:  # merge horizontal runs of one colour into one rect
            c, end = cells[x], x
            while end + 1 < n and cells[end + 1] == c:
                end += 1
            if c:
                rects.append(f'<rect x="{x}" y="{y}" width="{end - x + 1}" height="1" fill="{C[c]}"/>')
            x = end + 1
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">{"".join(rects)}</svg>\n'


out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for name, g in {"logo": folded(), "logo-mark": mark()}.items():
    (out / f"{name}.svg").write_text(svg(g), encoding="utf-8", newline="\n")
