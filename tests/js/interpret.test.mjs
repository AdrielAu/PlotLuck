// The questions screen's interpret seam (#135): six answers to a draft the scorer accepts.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { AREA_HELP, describe, makeInterpreter } from "../../web/interpret.js";
import { validateInterpretation } from "../../web/interpreter.js";
import { loadBundle, scoreDistricts } from "../../web/scoring.js";

const sample = new URL("../../data/sample/", import.meta.url);
const bundle = await loadBundle((name) => readFile(new URL(name, sample), "utf8"));
const { interpret, check, districtsInScope } = makeInterpreter(bundle);

const blank = { location: "", food: "", place: "", prices: "", rent: "", other: "" };

test("named areas use catalogue membership and ambiguous London requires a choice", async () => {
  const catalogue = { places: [
    { id: "city", name: "City of London", aliases: ["London"], type: "city", context: "England", districts: ["EC4R"] },
    { id: "region", name: "Greater London", aliases: ["London"], type: "region", context: "England", districts: ["EC4R", "SE1"] },
  ] };
  const reader = makeInterpreter(bundle, undefined, catalogue);
  const draft = await reader.interpret({ ...blank, location: "London", food: "Thai" });
  assert.equal(reader.check("location", "London"), null);
  assert.equal(draft.area, null);
  assert.equal(draft.marks.area, "unresolved");
  assert.deepEqual(reader.areaCandidates("London").map(a => a.label), ["City of London (city, England)", "Greater London (region, England)"]);
  const area = reader.areaCandidates("London")[0];
  assert.deepEqual([...reader.districtsInScope(area, "any")], ["EC4R"]);
  assert.deepEqual([...reader.districtsInScope({ ...area, code: "invented" }, "any")], []);
  assert.equal(reader.readArea("Greater London").code, "region");
  assert.equal(reader.readArea("London or Leeds"), null);
  assert.equal(reader.readArea("London except Westminster"), null);
  assert.equal(reader.readArea("Cardiff"), null);
  assert.equal(reader.readArea("Greater Londno"), null);
  assert.equal(reader.areaCandidates("Greater Londno")[0].code, "region");
  assert.equal(reader.readArea("!!!"), null);
  assert.equal(reader.readArea("").kind, "england");
});

test("clear answers become an explicit draft that the scorer accepts", async () => {
  const draft = await interpret({
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

test("required answers stop on empty or unreadable text; areas accept England, districts and postcode areas", async () => {
  assert.equal(check("location", "  "), null);
  assert.equal(check("location", "Leeds"), AREA_HELP);
  for (const text of ["anywhere", "England", "anywhere in England", "SE1", "se 1", "SE"]) assert.equal(check("location", text), null, text);
  for (const text of ["the", "all", "in the"]) assert.equal(check("location", text), AREA_HELP, text);
  assert.equal(check("food", ""), "You must answer this question.");
  assert.equal(check("food", "Atlantis food"), "You must answer this question.");
  assert.equal(check("food", "viet"), null);
  assert.equal(check("place", ""), null);
  assert.deepEqual((await interpret({ ...blank, location: "England", food: "Thai" })).area, { kind: "england", code: "", label: "England" });
  assert.deepEqual((await interpret({ ...blank, location: "se", food: "Thai" })).area, { kind: "postcode_area", code: "SE", label: "SE postcode area" });
});

test("empty optional answers take the vocabulary defaults", async () => {
  const draft = await interpret({ ...blank, location: "anywhere", food: "Thai" });
  assert.deepEqual(draft.profile, { cuisine: "Thai", venue_type: "Restaurant", price_band: "unknown", chain: false, vegetarian_friendly: false, vegan_options: false, gluten_free: false });
  assert.equal(draft.rentBand, "any");
  for (const name of ["venue_type", "price_band", "rent_band", "chain", "vegan_options"]) assert.equal(draft.marks[name], "default", name);
  assert.deepEqual(draft.unused, []);
});

test("cue words are inferred, negated traits are off, and unreadable details are listed as unused", async () => {
  const draft = await interpret({
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

test("an unreadable optional answer keeps the default and is listed as unused", async () => {
  const draft = await interpret({ ...blank, location: "SE1", food: "Thai", place: "dark kitchen", rent: "not too expensive" });
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

test("without rent values the rent answer is not asked and every district stays in", async () => {
  const noRent = makeInterpreter({ ...bundle, districts: bundle.districts.map((d) => ({ ...d, commercial_rent_index: "" })) });
  assert.equal(noRent.hasRent, false);
  const draft = await noRent.interpret({ ...blank, location: "anywhere", food: "Thai", rent: "low" });
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

// NN2 behind the seam: a canned model reply through the real validator, as the worker returns it.
function withModel(reply) {
  const calls = [];
  const nn2 = {
    ready: () => true,
    read: async (description) => {
      calls.push(description);
      return validateInterpretation(reply, description, bundle.vocabulary);
    },
  };
  return { calls, interpreter: makeInterpreter(bundle, nn2) };
}

const leeds = {
  location: "SE1", food: "neapolitan pizza", place: "casual restaurant", prices: "mid-range", rent: "not too expensive", other: "lots of vegan dishes, live music",
};
const field = (value, provenance, evidence) => ({ value, provenance, evidence });

test("with NN2 ready, one call reads the joined answers and its marks and unused details reach the draft", async () => {
  const { calls, interpreter } = withModel({
    fields: {
      cuisine: field("Italian", "inferred", "neapolitan pizza"),
      venue_type: field("Restaurant", "explicit", "restaurant"),
      price_band: field("$$", "explicit", "mid-range"),
      vegan_options: field(true, "explicit", "vegan dishes"),
      rent_band: field("mid", "inferred", "not too expensive"),
    },
    location: { text: "SE1", near: false, distance: null, unit: null },
    unused: ["live music"],
    clarifications: [],
  });
  const draft = await interpreter.interpret(leeds);
  assert.deepEqual(calls, [describe(leeds)]);
  assert.deepEqual(draft, {
    profile: { cuisine: "Italian", venue_type: "Restaurant", price_band: "$$", chain: false, vegetarian_friendly: false, vegan_options: true, gluten_free: false },
    marks: {
      area: "explicit", cuisine: "inferred", venue_type: "explicit", price_band: "explicit", rent_band: "inferred",
      chain: "default", vegetarian_friendly: "default", vegan_options: "explicit", gluten_free: "default",
    },
    area: { kind: "district", code: "SE1", label: "SE1" },
    rentBand: "mid",
    unused: ["live music"],
  });
  assert.equal(scoreDistricts(bundle, draft.profile).length, 13);
});

test("the review recovers explicit dietary traits omitted by NN2 for user confirmation", async () => {
  const answers = { ...blank, location: "SE1", food: "Thai", other: "vegan options, live music" };
  const { interpreter } = withModel({
    fields: {
      cuisine: field("Thai", "explicit", "Thai"),
      rent_band: field("any", "default", null),
    },
    location: { text: "SE1", near: false, distance: null, unit: null },
    unused: ["vegan options", "live music"],
    clarifications: [],
  });
  const positive = await interpreter.interpret(answers);
  assert.equal(positive.profile.vegan_options, true);
  assert.equal(positive.marks.vegan_options, "explicit");
  assert.deepEqual(positive.unused, ["live music"]);
  const negativeAnswers = { ...answers, other: "no vegan options" };
  const negative = withModel({
    fields: { cuisine: field("Thai", "explicit", "Thai"), rent_band: field("any", "default", null) },
    location: { text: "SE1", near: false, distance: null, unit: null },
    unused: [], clarifications: [],
  });
  const negated = await negative.interpreter.interpret(negativeAnswers);
  assert.equal(negated.profile.vegan_options, false);
  assert.equal(negated.marks.vegan_options, "explicit");
});

test("an NN2 cuisine that needs a choice reaches the review unresolved", async () => {
  const { interpreter } = withModel({
    fields: { cuisine: field(null, "default", null) },
    location: { text: null, near: false, distance: null, unit: null },
    unused: [],
    clarifications: ["Thai or Italian?"],
  });
  const draft = await interpreter.interpret({ ...blank, location: "anywhere", food: "Thai or Italian" });
  assert.equal(draft.profile.cuisine, undefined);
  assert.equal(draft.marks.cuisine, "unresolved");
  assert.deepEqual(draft.area, { kind: "england", code: "", label: "England" });
});

test("an invalid NN2 reply, a failed call or an unloaded model falls back to the built-in reader", async () => {
  const fallback = await makeInterpreter(bundle).interpret(leeds);
  const invalid = withModel({ fields: { cuisine: field("Neapolitan", "explicit", "neapolitan") }, location: { text: null, near: false, distance: null, unit: null }, unused: [], clarifications: [] });
  assert.deepEqual(await invalid.interpreter.interpret(leeds), fallback);
  assert.equal(invalid.calls.length, 1);
  const failing = makeInterpreter(bundle, { ready: () => true, read: async () => { throw new Error("cancelled"); } });
  assert.deepEqual(await failing.interpret(leeds), fallback);
  const unloaded = makeInterpreter(bundle, { ready: () => false, read: () => assert.fail("not loaded") });
  assert.deepEqual(await unloaded.interpret(leeds), fallback);
});

test("without rent values an NN2 rent band is ignored", async () => {
  const noRent = { ...bundle, districts: bundle.districts.map((d) => ({ ...d, commercial_rent_index: "" })) };
  const reply = {
    fields: { cuisine: field("Thai", "explicit", "Thai"), rent_band: field("low", "explicit", "low") },
    location: { text: null, near: false, distance: null, unit: null }, unused: [], clarifications: [],
  };
  const nn2 = { ready: () => true, read: async (description) => validateInterpretation(reply, description, bundle.vocabulary) };
  const draft = await makeInterpreter(noRent, nn2).interpret({ ...blank, location: "anywhere", food: "Thai", rent: "low" });
  assert.equal(draft.rentBand, "any");
  assert.equal(draft.marks.rent_band, "default");
});

test("with NN2 ready, any food answer moves on for NN2 to read, but the area must still read locally", () => {
  const { interpreter } = withModel({});
  assert.equal(interpreter.check("food", "neapolitan pizza"), null);
  assert.equal(interpreter.check("food", " "), "You must answer this question.");
  assert.equal(interpreter.check("location", "Leeds"), AREA_HELP);
  assert.equal(check("food", "neapolitan pizza"), "You must answer this question.");
});
