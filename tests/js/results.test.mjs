// Seam 1 of the results-screen spec (#127): search-area scores + score threshold -> what the results screen shows.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { circleLabel, defaultThreshold, inSearchArea, readAnswers, resultsAt, thresholdRange } from "../../web/results.js";

// Districts D01..Dnn scoring the given values in that order.
const districts = (...values) => values.map((score, i) => ({ postcode_district: `D${String(i + 1).padStart(2, "0")}`, score }));

// The bundle fields the hand-off reads: the vocabulary and the district codes.
const bundle = {
  vocabulary: {
    cuisines: [{ cuisine: "Thai", cuisine_group: "Thai", label: "Thai" }],
    traits: [
      { name: "price_band", kind: "single_choice", values: ["unknown", "$", "$$"], default: "unknown" },
      { name: "vegan_options", kind: "on_off", default: false },
    ],
  },
  districts: [{ postcode_district: "M1" }, { postcode_district: "M14" }, { postcode_district: "SE1" }],
};
const thai = { cuisine: "Thai", price_band: "$$", vegan_options: true };

test("an empty or absent search area means all England", () => {
  for (const searchArea of [[], undefined]) {
    assert.deepEqual(readAnswers(bundle, { profile: thai, searchArea }), { profile: thai, searchArea: ["M1", "M14", "SE1"] });
  }
});

test("the same answers in a different order give the same query", () => {
  const reordered = { vegan_options: true, cuisine: "Thai", price_band: "$$" };
  assert.equal(JSON.stringify(readAnswers(bundle, { profile: reordered })), JSON.stringify(readAnswers(bundle, { profile: thai })));
});

test("a search area keeps only the postcode districts Plotluck knows", () => {
  assert.deepEqual(readAnswers(bundle, { profile: thai, searchArea: ["SE1", "M1", "ZZ9"] }).searchArea, ["M1", "SE1"]);
});

test("answers that cannot be read give no query", () => {
  for (const answers of [
    undefined,
    { profile: thai, searchArea: ["ZZ9"] },
    { profile: thai, searchArea: "M1" },
    { profile: { ...thai, cuisine: "Klingon" } },
    { profile: { ...thai, price_band: "$$$$" } },
    { profile: { ...thai, vegan_options: "yes" } },
    { profile: { cuisine: "Thai", price_band: "$$" } },
    { profile: { ...thai, stars: 5 } },
  ]) {
    assert.equal(readAnswers(bundle, answers), null, JSON.stringify(answers));
  }
});

test("keeping the search area's districts leaves their NN1 scores unchanged", () => {
  const scores = [
    { postcode_district: "M1", score: 0.61 },
    { postcode_district: "M14", score: 0.62 },
    { postcode_district: "SE1", score: 0.9 },
  ];
  const query = readAnswers(bundle, { profile: thai, searchArea: ["M14", "M1"] });
  assert.deepEqual(inSearchArea(scores, query), scores.slice(0, 2));
});

test("the default score threshold is the 10th-best score in the search area", () => {
  const scores = districts(0.3, 0.9, 0.1, 0.8, 0.5, 0.7, 0.2, 0.65, 0.4, 0.6, 0.55, 0.35);
  // Best first: 0.9 0.8 0.7 0.65 0.6 0.55 0.5 0.4 0.35 0.3 | 0.2 0.1
  assert.equal(defaultThreshold(scores), 0.3);
});

test("a search area of 10 or fewer districts starts at its lowest score", () => {
  assert.equal(defaultThreshold(districts(0.5, 0.9, 0.1, 0.8, 0.45, 0.7, 0.2, 0.65, 0.4, 0.6)), 0.1);
  assert.equal(defaultThreshold(districts(0.5, 0.2, 0.7)), 0.2);
  assert.equal(defaultThreshold(districts(0.42)), 0.42);
});

test("districts tied at the 10th-best score are all shown, and the count line says how many are hidden", () => {
  const scores = districts(0.9, 0.8, 0.7, 0.65, 0.6, 0.55, 0.5, 0.4, 0.35, 0.3, 0.3, 0.2, 0.1);
  const { shown, countLine } = resultsAt(scores, defaultThreshold(scores));
  assert.deepEqual(shown.map((d) => d.postcode_district).slice(-2), ["D10", "D11"]);
  assert.equal(countLine, "11 of 13 districts in your search area");
  assert.equal(resultsAt(districts(0.5), 0.5).countLine, "1 of 1 district in your search area");
  assert.equal(resultsAt(districts(0.5, 0.4), 0.9).countLine, "0 of 2 districts in your search area");
});

test("the slider runs from showing every district to showing none", () => {
  for (const scores of [districts(0.62, 0.7, 0.64), districts(0.42), districts(0.5, 0.5)]) {
    const { min, max } = thresholdRange(scores);
    assert.equal(resultsAt(scores, min).shown.length, scores.length);
    assert.equal(resultsAt(scores, max).shown.length, 0);
  }
});

test("shown districts clear the threshold inclusively, best first, ranked from 1 with ties by district code", () => {
  const scores = [
    { postcode_district: "SE1", score: 0.4 },
    { postcode_district: "EC3R", score: 0.7 },
    { postcode_district: "WC2R", score: 0.5 },
    { postcode_district: "EC3M", score: 0.5 },
  ];
  assert.deepEqual(resultsAt(scores, 0.5).shown, [
    { rank: 1, postcode_district: "EC3R", score: 0.7, colour: RED },
    { rank: 2, postcode_district: "EC3M", score: 0.5, colour: BLUE },
    { rank: 3, postcode_district: "WC2R", score: 0.5, colour: BLUE },
  ]);
});

const BLUE = "rgb(69,117,180)", YELLOW = "rgb(255,255,191)", RED = "rgb(215,48,39)";
const colours = (scores, threshold) => resultsAt(scores, threshold).shown.map((d) => d.colour);

test("the highest shown district is red, the lowest blue and the middle pale yellow", () => {
  assert.deepEqual(colours(districts(0.2, 0.6, 0.4), 0), [RED, YELLOW, BLUE]);
  // Stretched across the shown districts only: raising the threshold makes 0.4 the new blue.
  assert.deepEqual(colours(districts(0.2, 0.6, 0.4), 0.4), [RED, BLUE]);
});

test("a single shown district, or all shown scores equal, is red", () => {
  assert.deepEqual(colours(districts(0.5, 0.3), 0.4), [RED]);
  assert.deepEqual(colours(districts(0.5, 0.5), 0), [RED, RED]);
});

test("the legend ends are the lowest and highest shown scores and follow the threshold", () => {
  const scores = districts(0.2, 0.6, 0.4);
  assert.deepEqual(resultsAt(scores, 0).legend, { low: 0.2, high: 0.6 });
  assert.deepEqual(resultsAt(scores, 0.3).legend, { low: 0.4, high: 0.6 });
  assert.equal(resultsAt(scores, 0.9).legend, null);
});

test("scores use the fewest decimals from 2 to 4 that tell the shown scores apart, else 4", () => {
  const decimals = (...values) => resultsAt(districts(...values), 0).decimals;
  assert.equal(decimals(0.61, 0.62), 2);
  assert.equal(decimals(0.611, 0.612), 3);
  assert.equal(decimals(0.6111, 0.6112), 4);
  assert.equal(decimals(0.61111, 0.61112), 4);
  assert.equal(decimals(0.5, 0.5), 4);
  assert.equal(decimals(0.5), 2);
  // Only shown scores count: hiding 0.611 leaves 0.612 and 0.9, apart at 2 decimals.
  assert.equal(resultsAt(districts(0.611, 0.612, 0.9), 0.612).decimals, 2);
});

test("a hovered circle reads rank, code and score at the shown decimals", () => {
  assert.equal(circleLabel({ rank: 3, postcode_district: "M14", score: 0.6213 }, 2), "#3 · M14 · 0.62");
  assert.equal(circleLabel({ rank: 12, postcode_district: "SE1", score: 0.75 }, 4), "#12 · SE1 · 0.7500");
});
