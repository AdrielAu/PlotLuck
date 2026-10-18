// Seam 1 of the results-screen spec (#127): search-area scores + shortlist size -> what the results screen shows.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { circleLabel, DEFAULT_SHORTLIST, inSearchArea, readAnswers, SHORTLIST_SIZES, shortlist } from "../../web/results.js";

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

test("the shortlist starts at the top 25, and All shows every district", () => {
  assert.equal(DEFAULT_SHORTLIST, 25);
  assert.deepEqual(SHORTLIST_SIZES, [10, 25, 50, Infinity]);
  const scores = districts(...Array.from({ length: 30 }, (_, i) => i / 100));
  assert.equal(shortlist(scores, DEFAULT_SHORTLIST).shown.length, 25);
  assert.equal(shortlist(scores, Infinity).shown.length, 30);
  assert.equal(shortlist(districts(0.4, 0.5), 10).shown.length, 2);
});

test("the count line says how many of the search area's districts are shown", () => {
  const scores = districts(...Array.from({ length: 13 }, (_, i) => i / 100));
  assert.equal(shortlist(scores, 10).countLine, "10 of 13 districts in your search area");
  assert.equal(shortlist(districts(0.5), 10).countLine, "1 of 1 district in your search area");
});

test("districts are ranked from 1, best first, ties by district code; ranks cover the whole area", () => {
  const scores = [
    { postcode_district: "SE1", score: 0.4 },
    { postcode_district: "EC3R", score: 0.7 },
    { postcode_district: "WC2R", score: 0.5 },
    { postcode_district: "EC3M", score: 0.5 },
  ];
  const { ranked, shown } = shortlist(scores, 3);
  assert.deepEqual(shown, [
    { rank: 1, postcode_district: "EC3R", score: 0.7, colour: RED },
    { rank: 2, postcode_district: "EC3M", score: 0.5, colour: YELLOW },
    { rank: 3, postcode_district: "WC2R", score: 0.5, colour: BLUE },
  ]);
  assert.deepEqual(ranked.map((d) => [d.rank, d.postcode_district]).at(-1), [4, "SE1"]);
});

const BLUE = "rgb(69,117,180)", YELLOW = "rgb(255,255,191)", RED = "rgb(215,48,39)";

test("colours run by rank from red (#1) to blue (the last shown), whatever the score gaps", () => {
  const colours = (scores, size) => shortlist(scores, size).shown.map((d) => d.colour);
  assert.deepEqual(colours(districts(0.2, 0.9, 0.21), Infinity), [RED, YELLOW, BLUE]);
  assert.deepEqual(colours(districts(0.2, 0.9, 0.21), 2), [RED, BLUE]);
  assert.deepEqual(colours(districts(0.5), 10), [RED]);
});

test("a hovered district reads its rank out of the search area and its code, never its score", () => {
  assert.equal(circleLabel({ rank: 3, postcode_district: "M14", score: 0.6213 }, 120), "#3 of 120 · M14");
});
