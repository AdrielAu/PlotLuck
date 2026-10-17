"""Draws the Plotluck logo variants on pixel grids and writes them as crisp-edged SVGs."""
import sys
from pathlib import Path

C = {
    "c": "#f7f6f3", "d": "#e4e2d6", "g": "#bacfa9", "r": "#c27a4a",
    "G": "#284c29", "F": "#346538", "w": "#f7f6f3", "k": "#2f3437", "s": "#9aa0a1",
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


def pot(g, cx, y0):
    """A small pot of curry, centred on column cx, its heap of food at row y0, steam above."""
    for x, c in ((cx - 1, "h"), (cx, "o"), (cx + 1, "y")):
        put(g, x, y0, c)
    put(g, cx - 4, y0 + 1, "G")
    for x, c in zip(range(cx - 3, cx + 4), "oyoRoho"):
        put(g, x, y0 + 1, c)
    put(g, cx + 4, y0 + 1, "G")
    row(g, y0 + 2, cx - 5, cx + 5, "G")
    row(g, y0 + 3, cx - 4, cx + 4, "G"); put(g, cx - 2, y0 + 3, "F")
    row(g, y0 + 4, cx - 4, cx + 4, "G"); put(g, cx - 2, y0 + 4, "F")
    row(g, y0 + 5, cx - 3, cx + 3, "G")
    row(g, y0 + 6, cx - 2, cx + 2, "G")
    for x, y in ((cx - 2, y0 - 1), (cx - 3, y0 - 2), (cx - 2, y0 - 3), (cx + 2, y0 - 1), (cx + 1, y0 - 2), (cx + 2, y0 - 3)):
        put(g, x, y, "s")


def pin(g, length):
    """The pot-headed pin, its needle running diagonally down-right from under the pot."""
    for i in range(length):
        put(g, 5 + i, 10 + i, "k"); put(g, 6 + i, 10 + i, "k")
    pot(g, 5, 3)


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
    pin(g, 9)
    return g


def mark():
    g = grid(16)
    pin(g, 6)
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
