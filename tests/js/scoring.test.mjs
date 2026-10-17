// Seam 2 of the MVP spec (#64): bundle + profile -> district scores and ranked list.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { BUNDLE_VERSION, loadBundle, rankDistricts, scoreDistricts } from "../../web/scoring.js";

const ROOT = new URL("../../", import.meta.url);

function readFrom(dir) {
  return (name) => readFile(new URL(`${dir}/${name}`, ROOT), "utf8");
}

// A one-layer sigmoid model whose logit is `weights . inputs`, so a test reads
// an input straight back as logit(score). Inputs: cuisine_group one-hot
// [African, Thai], then `districtInputs`, all untransformed.
function tinyBundle({
  weights,
  population = "100",
  centroidLat = "51.5",
  supplyCount = "2",
  radiusKm = "1.2",
  version = BUNDLE_VERSION,
  includeFineCuisine = false,
  districtInputs = ["population", "same_cuisine_supply"],
  contextColumns = {},
  // AB1 as one closed square ring; version 4 bundles carry it, older ones do not.
  outlines = { version, quantum: 1e-4, arcs: [[0, 515000, 10, 0, 0, 10, -10, 0, 0, -10]], districts: { AB1: [[0]] } },
}) {
  const numeric = { kind: "numeric", log1p: false, mean: 0, std: 1, median: 0 };
  // `radiusKm: null` leaves the radius_km column out.
  const columns = { ...contextColumns, ...(radiusKm === null ? {} : { radius_km: radiusKm }) };
  const files = {
    "districts.csv": `postcode_district,centroid_lat,centroid_lon,total_restaurants,population,deprivation_index${Object.keys(columns).map((name) => `,${name}`).join("")}\nAB1,${centroidLat},-0.1,3,${population},10${Object.values(columns).map((value) => `,${value}`).join("")}\n`,
    "district_cuisine_supply.csv": `postcode_district,cuisine_group,restaurants\nAB1,Thai,${supplyCount}\n`,
    "vocabulary.json": JSON.stringify({
      version,
      cuisines: [
        { cuisine: "Eritrean", cuisine_group: "African", label: "Eritrean (scored as African)" },
        { cuisine: "Thai", cuisine_group: "Thai", label: "Thai" },
      ],
      traits: [],
    }),
    "model.json": JSON.stringify({
      version,
      features: { restaurant_inputs: includeFineCuisine ? ["cuisine_group", "cuisine"] : ["cuisine_group"], district_inputs: districtInputs },
      transforms: {
        cuisine_group: { kind: "one_hot", values: ["African", "Thai"] },
        ...(includeFineCuisine ? { cuisine: { kind: "one_hot", values: ["Eritrean", "Thai"] } } : {}),
        ...Object.fromEntries(districtInputs.map((name) => [name, numeric])),
        population: { ...numeric, median: 7 },
      },
      layers: [{ weights: [weights], biases: [0] }],
      activations: ["sigmoid"],
    }),
    "district_outlines.json": JSON.stringify(outlines),
  };
  return loadBundle(async (name) => {
    if (version < 4 && name === "district_outlines.json") throw new Error("an older bundle has no outlines file");
    return files[name];
  });
}

test("a version 4 bundle carries each district's outline as closed [lat, lng] rings", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 0, 0] });
  const [ring] = bundle.outlines.get("AB1");
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(Math.abs(ring[0][0] - 51.5) < 1e-9 && Math.abs(ring[1][1] - 0.001) < 1e-9);
});

test("an older bundle loads without outlines, so every district is a circle", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 0, 0], version: 3 });
  assert.equal(bundle.outlines.size, 0);
});

test("an outline for a district not in districts.csv is rejected while loading", async () => {
  const outlines = { version: BUNDLE_VERSION, quantum: 1e-4, arcs: [[0, 0, 10, 0, 0, 10, -10, -10]], districts: { ZZ9: [[0]] } };
  await assert.rejects(tinyBundle({ weights: [0, 0, 0, 0], outlines }), /ZZ9/);
});

test("a bundle version the site does not know raises", async () => {
  await assert.rejects(tinyBundle({ weights: [0, 0, 0, 0], version: BUNDLE_VERSION + 1 }), /version/);
});

test("the current site also loads the published version 2 bundle", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 0, 0], version: 2 });
  assert.equal(scoreDistricts(bundle, { cuisine: "Thai" }).length, 1);
});

test("fine cuisine changes the input even when its group is unchanged", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 1, 0, 0, 0], includeFineCuisine: true });
  assert.ok(logit(bundle, "Eritrean") > logit(bundle, "Thai"));
});

test("invalid coordinates and supply counts are rejected while loading", async () => {
  await assert.rejects(tinyBundle({ weights: [0, 0, 0, 0], centroidLat: "missing" }), /coordinate/i);
  await assert.rejects(tinyBundle({ weights: [0, 0, 0, 0], supplyCount: "missing" }), /supply/i);
});

test("a district without a positive circle radius is rejected while loading", async () => {
  for (const radiusKm of [null, "", "0", "-1", "wide", "Infinity"]) {
    await assert.rejects(tinyBundle({ weights: [0, 0, 0, 0], radiusKm }), /radius_km/, `radius_km ${radiusKm}`);
  }
  const bundle = await tinyBundle({ weights: [0, 0, 0, 0], radiusKm: "0.3" });
  assert.equal(bundle.districts[0].radius_km, "0.3");
});

test("invalid numeric inputs and model shapes raise instead of returning NaN", async () => {
  const badNumeric = await tinyBundle({ weights: [0, 0, 1, 0], population: "missing" });
  assert.throws(() => scoreDistricts(badNumeric, { cuisine: "Thai" }), /numeric|population/i);
  const badShape = await tinyBundle({ weights: [0, 0, 0] });
  assert.throws(() => scoreDistricts(badShape, { cuisine: "Thai" }), /layer|shape/i);
});

function logit(bundle, cuisine) {
  const [{ score }] = scoreDistricts(bundle, { cuisine });
  return Math.log(score / (1 - score));
}

test("an unseen cuisine encodes as an all-zero one-hot", async () => {
  const bundle = await tinyBundle({ weights: [1, 1, 0, 0] });
  assert.ok(Math.abs(logit(bundle, "Klingon") - 0) < 1e-9);
  assert.ok(Math.abs(logit(bundle, "Eritrean") - 1) < 1e-9);
});

test("a district with no supply row for the cuisine group counts as 0", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 0, 1] });
  assert.ok(Math.abs(logit(bundle, "Eritrean") - 0) < 1e-9);
  assert.ok(Math.abs(logit(bundle, "Thai") - 2) < 1e-9);
});

test("a missing district numeric gets the training median", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 1, 0], population: "" });
  assert.ok(Math.abs(logit(bundle, "Thai") - 7) < 1e-9);
});

test("any declared district input is read from its districts.csv column", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 1], districtInputs: ["deprivation_index"] });
  assert.ok(Math.abs(logit(bundle, "Thai") - 10) < 1e-9);
});

test("demographics and tourism features reach the forward pass in declared order", async () => {
  const contextColumns = {
    average_age: 42,
    ethnicity_asian_share: 0.2, ethnicity_black_share: 0.1, ethnicity_mixed_share: 0.1,
    ethnicity_white_share: 0.5, ethnicity_other_share: 0.1,
    sex_female_share: 0.6, sex_male_share: 0.4, attractions_count: 3, hotels_count: 7,
  };
  for (const [name, expected] of Object.entries(contextColumns)) {
    const bundle = await tinyBundle({ contextColumns, districtInputs: [name], weights: [0, 0, 0.01] });
    assert.ok(Math.abs(logit(bundle, "Thai") - expected * 0.01) < 1e-9, name);
  }
});

test("a district input the bundle has no column for raises instead of scoring", async () => {
  const bundle = await tinyBundle({ weights: [0, 0, 1], districtInputs: ["commercial_rent_index"] });
  assert.throws(() => scoreDistricts(bundle, { cuisine: "Thai" }), /commercial_rent_index/);
});

// JS cannot call plotluck.data_dir(), so the sample folder is named here.
// web/models is the bundle the site deploys: with weights trained on LinuxONE,
// this is the x86 parity check before the model freeze (#77).
for (const dir of ["data/sample", "web/models"]) {
  test(`scores match the Python reference fixture in ${dir}`, async () => {
    const read = readFrom(dir);
    const bundle = await loadBundle(read);
    const reference = JSON.parse(await read("reference_scores.json"));
    for (const { profile, scores } of reference.cases) {
      const got = Object.fromEntries(
        scoreDistricts(bundle, profile).map((d) => [d.postcode_district, d.score]),
      );
      assert.deepEqual(Object.keys(got).sort(), Object.keys(scores).sort());
      for (const [code, expected] of Object.entries(scores)) {
        assert.ok(
          Math.abs(got[code] - expected) <= reference.tolerance,
          `${profile.cuisine} in ${code}: ${got[code]} vs ${expected}`,
        );
      }
    }
  });
}

test("ranking keeps scores at or above the threshold, best first, ties by district code", () => {
  const scores = [
    { postcode_district: "SE1", score: 0.4 },
    { postcode_district: "EC3R", score: 0.7 },
    { postcode_district: "WC2R", score: 0.5 },
    { postcode_district: "EC3M", score: 0.5 },
    { postcode_district: "SE11", score: 0.49 },
  ];
  assert.deepEqual(
    rankDistricts(scores, 0.5).map((d) => d.postcode_district),
    ["EC3R", "EC3M", "WC2R"],
  );
  assert.deepEqual(rankDistricts(scores, 0.71), []);
});
