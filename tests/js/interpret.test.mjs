// The questions screen's interpret seam (#135): six answers to a draft the scorer accepts.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { describe, makeInterpreter } from "../../web/interpret.js";
import { loadBundle, scoreDistricts } from "../../web/scoring.js";

const sample = new URL("../../data/sample/", import.meta.url);
const bundle = await loadBundle((name) => readFile(new URL(name, sample), "utf8"));
const { interpret, check, districtsInScope } = makeInterpreter(bundle);

const blank = { location: "", food: "", place: "", prices: "", rent: "", other: "" };

test("clear answers become an explicit draft that the scorer accepts", () => {
  const draft = interpret({
    location: "se1", food: "thai", place: "Café", prices: "Budget ($)", rent: "Low", other: "Vegan options, gluten free",
  });
  assert.deepEqual(draft, {
    profile: { cuisine: "Thai", venue_type: "Café", price_band: "$", chain: false, vegetarian_friendly: false, vegan_options: true, gluten_free: true },
    marks: {
      area: "explicit", cuisine: "explicit", venue_type: "explicit", price_band: "explicit", rent_band: "explicit",
      chain: "default", vegetarian_friendly: "default", vegan_options: "explicit", gluten_free: "explicit",
    },
    area: { kind: "district", code: "SE1", label: "SE1" },
    rentBand: "low",
    unused: [],
  });
  assert.equal(scoreDistricts(bundle, draft.profile).length, 13);
});

test("required answers stop on empty or unreadable text; areas accept England, districts and postcode areas", () => {
  assert.equal(check("location", "  "), "You must answer this question.");
  assert.equal(check("location", "Leeds"), "Place names arrive soon. For now, enter a postcode like LS1, or 'anywhere'.");
  for (const text of ["anywhere", "England", "anywhere in England", "SE1", "se 1", "SE"]) assert.equal(check("location", text), null, text);
  for (const text of ["the", "all", "in the"]) assert.equal(check("location", text), "Place names arrive soon. For now, enter a postcode like LS1, or 'anywhere'.", text);
  assert.equal(check("food", ""), "You must answer this question.");
  assert.equal(check("food", "Atlantis food"), "You must answer this question.");
  assert.equal(check("food", "viet"), null);
  assert.equal(check("place", ""), null);
  assert.deepEqual(interpret({ ...blank, location: "England", food: "Thai" }).area, { kind: "england", code: "", label: "England" });
  assert.deepEqual(interpret({ ...blank, location: "se", food: "Thai" }).area, { kind: "postcode_area", code: "SE", label: "SE postcode area" });
});

test("empty optional answers take the vocabulary defaults", () => {
  const draft = interpret({ ...blank, location: "anywhere", food: "Thai" });
  assert.deepEqual(draft.profile, { cuisine: "Thai", venue_type: "Restaurant", price_band: "unknown", chain: false, vegetarian_friendly: false, vegan_options: false, gluten_free: false });
  assert.equal(draft.rentBand, "any");
  for (const name of ["venue_type", "price_band", "rent_band", "chain", "vegan_options"]) assert.equal(draft.marks[name], "default", name);
  assert.deepEqual(draft.unused, []);
});

test("cue words are inferred, negated traits are off, and unreadable details are listed as unused", () => {
  const draft = interpret({
    location: "SE1", food: "authentic Italian pizza", place: "a cosy coffee shop", prices: "not expensive, quite cheap",
    rent: "don't mind", other: "vegetarian and vegan, not part of a chain, lots of parking",
  });
  assert.equal(draft.profile.cuisine, "Italian");
  assert.equal(draft.profile.venue_type, "Café");
  assert.equal(draft.marks.venue_type, "inferred");
  assert.equal(draft.profile.price_band, "$");
  assert.equal(draft.marks.price_band, "inferred");
  assert.equal(draft.rentBand, "any");
  assert.equal(draft.marks.rent_band, "inferred");
  assert.equal(draft.profile.vegetarian_friendly, true);
  assert.equal(draft.profile.vegan_options, true);
  assert.equal(draft.profile.chain, false);
  assert.equal(draft.marks.chain, "explicit");
  assert.equal(draft.marks.gluten_free, "default");
  assert.deepEqual(draft.unused, ["Food: authentic Italian pizza", "Other: lots of parking"]);
});

test("an unreadable optional answer keeps the default and is listed as unused", () => {
  const draft = interpret({ ...blank, location: "SE1", food: "Thai", place: "dark kitchen", rent: "not too expensive" });
  assert.equal(draft.profile.venue_type, "Restaurant");
  assert.equal(draft.marks.venue_type, "default");
  assert.equal(draft.rentBand, "any");
  assert.deepEqual(draft.unused, ["Kind of place: dark kitchen", "Rent: not too expensive"]);
});

test("rent bands are thirds of the districts by commercial rent, and filter the search area", () => {
  const england = { kind: "england", code: "", label: "England" };
  assert.deepEqual([...districtsInScope(england, "low")], ["EC4R", "EC4V", "SE1", "SE11", "SE1P"]);
  assert.deepEqual([...districtsInScope(england, "mid")], ["EC3M", "EC3P", "EC3R", "EC4P"]);
  assert.deepEqual([...districtsInScope(england, "high")], ["EC3N", "SE16", "SE17", "WC2R"]);
  assert.equal(districtsInScope(england, "any").size, 13);
  assert.deepEqual([...districtsInScope({ kind: "postcode_area", code: "SE", label: "SE postcode area" }, "low")], ["SE1", "SE11", "SE1P"]);
  assert.deepEqual([...districtsInScope({ kind: "district", code: "SE1", label: "SE1" }, "high")], []);
});

test("without rent values the rent answer is not asked and every district stays in", () => {
  const noRent = makeInterpreter({ ...bundle, districts: bundle.districts.map((d) => ({ ...d, commercial_rent_index: "" })) });
  assert.equal(noRent.hasRent, false);
  const draft = noRent.interpret({ ...blank, location: "anywhere", food: "Thai", rent: "low" });
  assert.equal(draft.rentBand, "any");
  assert.equal(draft.marks.rent_band, "default");
  assert.equal(noRent.districtsInScope(draft.area, draft.rentBand).size, 13);
  assert.equal(makeInterpreter(bundle).hasRent, true);
});

test("the description joins the six answers under their labels", () => {
  assert.equal(
    describe({ location: "SE1", food: "Thai", place: "", prices: "cheap", rent: "any", other: "vegan" }),
    "Location: SE1\nFood: Thai\nKind of place: \nMenu prices: cheap\nRent: any\nOther: vegan",
  );
});
