// Decode district_outlines.json (written by src/plotluck/outlines.py) into closed [lat, lng] rings.
// Pure: no DOM or Leaflet, so it runs in Node tests and in the browser.

// Map of district code -> rings, each a closed list of [lat, lng]. `codes` is the
// set of districts in districts.csv; an outline for any other district is rejected.
export function decodeOutlines(file, codes) {
  const { quantum, arcs, districts } = file ?? {};
  if (!(quantum > 0) || !Array.isArray(arcs) || typeof districts !== "object" || districts === null) {
    throw new Error("district_outlines.json has an invalid shape");
  }
  const points = arcs.map((arc) => {
    if (!Array.isArray(arc) || arc.length < 4 || arc.length % 2 || !arc.every(Number.isInteger)) {
      throw new Error("district_outlines.json has an invalid arc");
    }
    const out = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < arc.length; i += 2) {
      x += arc[i];
      y += arc[i + 1];
      out.push([y * quantum, x * quantum]);
    }
    return out;
  });
  const outlines = new Map();
  for (const [code, rings] of Object.entries(districts)) {
    if (!codes.has(code) || !Array.isArray(rings) || !rings.length) {
      throw new Error(`district_outlines.json has an unexpected district ${code}`);
    }
    outlines.set(code, rings.map((refs) => ring(refs, points, code)));
  }
  return outlines;
}

// One ring from arc refs; `~i` is arc i reversed. Consecutive arcs share an end point.
function ring(refs, points, code) {
  if (!Array.isArray(refs) || !refs.length) throw new Error(`district_outlines.json has an empty ring for ${code}`);
  const out = [];
  for (const ref of refs) {
    const arc = Number.isInteger(ref) ? points[ref >= 0 ? ref : ~ref] : undefined;
    if (!arc) throw new Error(`district_outlines.json has an invalid arc reference for ${code}`);
    const line = ref >= 0 ? arc : arc.toReversed();
    if (out.length && !same(out.at(-1), line[0])) throw new Error(`district_outlines.json has a broken ring for ${code}`);
    out.push(...(out.length ? line.slice(1) : line));
  }
  if (!same(out[0], out.at(-1))) throw new Error(`district_outlines.json has an unclosed ring for ${code}`);
  return out;
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
