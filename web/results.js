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

// The search area's districts at or above `threshold`, best first, each with its rank from 1.
export function resultsAt(scores, threshold) {
  const shown = rankDistricts(scores, threshold).map((d, i) => ({ rank: i + 1, ...d }));
  const countLine = `${shown.length} of ${scores.length} ${scores.length === 1 ? "district" : "districts"} in your search area`;
  return { shown, countLine };
}
