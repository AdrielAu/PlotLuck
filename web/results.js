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

// The shortlist sizes a user can pick, and the first one shown. Infinity shows every district.
export const SHORTLIST_SIZES = [10, 25, 50, Infinity];
export const DEFAULT_SHORTLIST = 25;

// ColorBrewer RdYlBu ends and middle: blue, pale yellow, red, readable with common colour blindness.
const SCALE = [[69, 117, 180], [255, 255, 191], [215, 48, 39]];

// The scale's colour at `t` from 0 (blue) to 1 (red).
function colourAt(t) {
  const [from, to] = t < 0.5 ? [SCALE[0], SCALE[1]] : [SCALE[1], SCALE[2]];
  const u = t < 0.5 ? t * 2 : t * 2 - 1;
  return `rgb(${from.map((channel, i) => Math.round(channel + (to[i] - channel) * u)).join(",")})`;
}

// The search area's `size` best districts. `ranked` is the whole area best first, each with
// its rank from 1; `shown` is its first `size`, each coloured by rank from red (#1) to blue
// (the last shown). Scores order the districts but are never displayed (glossary: MVP).
export function shortlist(scores, size) {
  const ranked = rankDistricts(scores, -Infinity).map((d, i) => ({ rank: i + 1, ...d }));
  const shown = ranked.slice(0, size).map((d, i, all) => ({
    ...d,
    colour: colourAt(all.length === 1 ? 1 : 1 - i / (all.length - 1)),
  }));
  const countLine = `${shown.length} of ${scores.length} ${scores.length === 1 ? "district" : "districts"} in your search area`;
  return { ranked, shown, countLine };
}

// A shown district's heading on the map, such as "#3 of 120 · M14".
export function circleLabel({ rank, postcode_district }, total) {
  return `#${rank} of ${total} · ${postcode_district}`;
}
