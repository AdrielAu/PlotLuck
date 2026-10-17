// What the results screen shows for a confirmed query. Pure: no DOM or Leaflet, so it runs in Node tests.
import { rankDistricts } from "./scoring.js";

// The confirmed query from the questions screen's answers, `{ profile, searchArea }`,
// or null when they cannot be read. `searchArea` lists postcode district codes;
// empty or absent means all England. Codes the bundle does not know are dropped.
export function readAnswers(bundle, answers) {
  const { profile, searchArea = [] } = answers ?? {};
  const { cuisines, traits } = bundle.vocabulary;
  if (!profile || !cuisines.some((c) => c.cuisine === profile.cuisine)) return null;
  if (Object.keys(profile).length !== traits.length + 1) return null;
  const traitsValid = traits.every((t) =>
    t.kind === "on_off" ? typeof profile[t.name] === "boolean" : t.values.includes(profile[t.name]));
  if (!traitsValid || !Array.isArray(searchArea)) return null;
  const wanted = new Set(searchArea);
  const codes = bundle.districts.map((d) => d.postcode_district).filter((code) => !wanted.size || wanted.has(code));
  if (!codes.length) return null;
  // Vocabulary order, so equal answers give an equal query whatever order they came in.
  return { profile: { cuisine: profile.cuisine, ...Object.fromEntries(traits.map((t) => [t.name, profile[t.name]])) }, searchArea: codes };
}

// The NN1 scores of the query's search area, unchanged.
export function inSearchArea(scores, query) {
  const wanted = new Set(query.searchArea);
  return scores.filter((d) => wanted.has(d.postcode_district));
}

// The 10th-best score in the search area, so the user first sees the top 10 districts.
export function defaultThreshold(scores) {
  const ranked = rankDistricts(scores, -Infinity);
  return ranked[Math.min(9, ranked.length - 1)].score;
}

// The score threshold slider's ends: the lowest score shows every district, and
// the top sits just past the best score so the slider can show none.
export function thresholdRange(scores) {
  const values = scores.map((d) => d.score);
  // Keep the range's low endpoint below every score despite browser rounding.
  const min = Math.min(...values) - 0.000001;
  const best = Math.max(...values);
  return { min, max: best + Math.max((best - min) / 50, 0.0001) };
}

// ColorBrewer RdYlBu ends and middle: blue, pale yellow, red, readable with common colour blindness.
const SCALE = [[69, 117, 180], [255, 255, 191], [215, 48, 39]];

// The scale's colour at `t` from 0 (blue) to 1 (red).
function colourAt(t) {
  const [from, to] = t < 0.5 ? [SCALE[0], SCALE[1]] : [SCALE[1], SCALE[2]];
  const u = t < 0.5 ? t * 2 : t * 2 - 1;
  return `rgb(${from.map((channel, i) => Math.round(channel + (to[i] - channel) * u)).join(",")})`;
}

// The fewest decimals from 2 to 4 at which the scores are pairwise distinct, else 4.
function decimalsFor(values) {
  return [2, 3].find((d) => new Set(values.map((v) => v.toFixed(d))).size === values.length) ?? 4;
}

// The search area's districts at or above `threshold`, best first, each with its rank from 1
// and its colour stretched across the shown scores. `legend` gives the lowest and highest
// shown scores (null when none is shown); `decimals` is how many to print every score with.
export function resultsAt(scores, threshold) {
  const ranked = rankDistricts(scores, threshold);
  const values = ranked.map((d) => d.score);
  const legend = ranked.length ? { low: Math.min(...values), high: Math.max(...values) } : null;
  const shown = ranked.map((d, i) => ({
    rank: i + 1,
    ...d,
    colour: colourAt(legend.high === legend.low ? 1 : (d.score - legend.low) / (legend.high - legend.low)),
  }));
  const countLine = `${shown.length} of ${scores.length} ${scores.length === 1 ? "district" : "districts"} in your search area`;
  return { shown, countLine, legend, decimals: decimalsFor(values) };
}
