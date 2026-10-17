// district_outlines.json decoding: shared arcs back into closed [lat, lng] rings.
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeOutlines } from "../../web/outlines.js";

// Two unit squares side by side share their middle edge, arc 0, stored once (x right, y up):
// arc 0 runs (10,0)->(10,10); arc 1 is the rest of A; arc 2 the rest of B.
const file = {
  quantum: 0.5,
  arcs: [
    [10, 0, 0, 10],
    [10, 10, -10, 0, 0, -10, 10, 0],
    [10, 0, 10, 0, 0, 10, -10, 0],
  ],
  districts: { A1: [[0, 1]], B1: [[2, ~0]] },
};

test("neighbours share one stored edge, walked opposite ways", () => {
  const outlines = decodeOutlines(file, new Set(["A1", "B1"]));
  assert.deepEqual(outlines.get("A1"), [[[0, 5], [5, 5], [5, 0], [0, 0], [0, 5]]]);
  assert.deepEqual(outlines.get("B1"), [[[0, 5], [0, 10], [5, 10], [5, 5], [0, 5]]]);
});

test("a ring whose arcs do not meet is rejected", () => {
  const broken = { ...file, districts: { A1: [[0, 2]] } };
  assert.throws(() => decodeOutlines(broken, new Set(["A1"])), /broken ring for A1/);
});

test("a ring that does not close is rejected", () => {
  const open = { ...file, districts: { A1: [[0]] } };
  assert.throws(() => decodeOutlines(open, new Set(["A1"])), /unclosed ring for A1/);
});

test("arc references out of range and non-integer coordinates are rejected", () => {
  assert.throws(() => decodeOutlines({ ...file, districts: { A1: [[0, 7]] } }, new Set(["A1"])), /arc reference/);
  assert.throws(() => decodeOutlines({ ...file, arcs: [[0, 0, 0.5, 1]] }, new Set(["A1"])), /invalid arc/);
});
