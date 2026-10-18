// Driver summaries: the swap-one-factor test against a typical district.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { driverExplainer, MIN_AREA_DISTRICTS, NOTABLE, STRONG, summaryLines } from "../../web/drivers.js";
import { rankDistricts, scoreDistricts } from "../../web/scoring.js";

const INPUTS = ["total_restaurants", "commercial_rent_index", "matched_community_share", "average_age"];

// A one-layer sigmoid on the raw district inputs: logit = weights . inputs.
// Five districts, best first: A1 2.5, B1 1.3, C1 0.5 (the median), D1 -0.5, E1 -1.
function bundle(weights = [1, -1, 1, 1], group = "Indian") {
  const numeric = { kind: "numeric", log1p: false, mean: 0, std: 1, median: 0 };
  const rows = { A1: [2, 0, 0.5, 0], B1: [1, 0, 0, 0.3], C1: [0.5, 0, 0, 0], D1: [0.5, 1, 0, 0], E1: [0, 1, 0, 0] };
  return {
    model: {
      features: { restaurant_inputs: [], district_inputs: INPUTS },
      transforms: Object.fromEntries(INPUTS.map((name) => [name, numeric])),
      layers: [{ weights: [weights], biases: [0] }],
      activations: ["sigmoid"],
    },
    districts: Object.entries(rows).map(([code, [restaurants, rent, community, age]]) => ({
      postcode_district: code, total_restaurants: restaurants, commercial_rent_index: rent,
      ethnicity_indian_share: community, ethnicity_pakistani_share: 0, ethnicity_bangladeshi_share: 0, average_age: age,
    })),
    supply: new Map(),
    groups: new Map([["Indian", group]]),
    communities: new Map([["Indian", ["indian", "pakistani", "bangladeshi"]]]),
  };
}

const profile = { cuisine: "Indian" };

function explainer(b = bundle(), codes = null) {
  const scores = scoreDistricts(b, profile).filter((d) => !codes || codes.includes(d.postcode_district));
  const ranked = rankDistricts(scores, -Infinity);
  return { ranked, explain: driverExplainer(b, profile, ranked) };
}

const texts = (summary) => summary.drivers.map((d) => `${d.helps ? "↑" : "↓"} ${d.text}`);

test("the typical district is the median-ranked one, and it has no drivers", () => {
  const { ranked, explain } = explainer();
  assert.equal(ranked[2].postcode_district, "C1");
  assert.deepEqual(explain(3), { basis: "area", drivers: [], ahead: "Ahead of #4 (D1) mainly on: much lower rent." });
});

test("drivers are named strongest first, worded by size and direction", () => {
  const { explain } = explainer();
  // A1 against C1: restaurants 2 vs 0.5 moves the score 0.19; the community 0.5 vs 0 moves it 0.043.
  assert.deepEqual(texts(explain(1)), ["↑ Far more restaurants nearby", "↑ Much larger Indian, Pakistani and Bangladeshi community"]);
  // B1: restaurants 1 vs 0.5 (0.096); average age, part of the population mix, 0.3 vs 0 (0.055).
  assert.deepEqual(texts(explain(2)), ["↑ Far more restaurants nearby", "↑ Local population mix suits it well"]);
  // D1: rent 1 vs 0 with a negative weight holds it back by 0.24.
  assert.deepEqual(texts(explain(4)), ["↓ Much higher rent"]);
  assert.ok(NOTABLE < STRONG);
});

test("the matched community is named only when it raises the rank", () => {
  const { explain } = explainer(bundle([1, -1, -1, 1]));
  assert.ok(texts(explain(1)).every((t) => !/community/.test(t)), texts(explain(1)).join("; "));
});

test("an effect under the notable cutoff is left out", () => {
  // A tiny community weight: A1's 0.5 share moves its score far less than NOTABLE.
  const { explain } = explainer(bundle([1, -1, 0.001, 1]));
  assert.deepEqual(texts(explain(1)), ["↑ Far more restaurants nearby"]);
});

test("the ahead line names what most separates a district from the next, and the last has none", () => {
  const { explain } = explainer();
  assert.equal(explain(1).ahead, "Ahead of #2 (B1) mainly on: far more restaurants nearby.");
  assert.equal(explain(5).ahead, null);
});

test("a small search area compares with England's typical district", () => {
  const { ranked, explain } = explainer(bundle(), ["A1", "B1", "C1"]);
  assert.ok(ranked.length < MIN_AREA_DISTRICTS);
  // C1 is England's median-ranked district here, so it has nothing to explain.
  assert.deepEqual(explain(3).drivers, []);
  assert.equal(explain(3).basis, "england");
});

test("summary lines name the comparison, the drivers and the ahead line, or say the district is typical", () => {
  const { explain } = explainer();
  assert.deepEqual(summaryLines(explain(4)), [
    "Compared with a typical district in this area:", "↓ Much higher rent", "Ahead of #5 (E1) mainly on: far more restaurants nearby.",
  ]);
  assert.deepEqual(summaryLines(explain(3)), [
    "Close to a typical district in this area on every factor.", "Ahead of #4 (D1) mainly on: much lower rent.",
  ]);
  assert.deepEqual(summaryLines({ basis: "england", drivers: [], ahead: null }), ["Close to a typical district in England on every factor."]);
});

test("same-cuisine supply names the cuisine group, or similar restaurants for Other", () => {
  const supplied = bundle([0, 0, 0, 0], "Other");
  supplied.model.features.district_inputs = ["same_cuisine_supply"];
  supplied.model.transforms = { same_cuisine_supply: { kind: "numeric", log1p: false, mean: 0, std: 1, median: 0 } };
  supplied.model.layers = [{ weights: [[1]], biases: [0] }];
  supplied.supply = new Map([["A1\tOther", 3]]);
  const { explain } = explainer(supplied);
  assert.deepEqual(texts(explain(1)), ["↑ Far more similar restaurants already here"]);
});
