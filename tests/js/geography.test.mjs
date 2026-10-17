import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateCatalogue } from "../../web/geography.js";
import { makeInterpreter } from "../../web/interpret.js";
import { loadBundle } from "../../web/scoring.js";

const root = new URL("../../web/models/", import.meta.url);
const bundle = await loadBundle(name => readFile(new URL(name, root), "utf8"));
const catalogue = JSON.parse(await readFile(new URL("geography.json", root), "utf8"));

test("the shipped catalogue matches the exact scoring centroids and rejects incompatible or private fields", async () => {
  assert.equal(await validateCatalogue(catalogue, bundle.districts), catalogue);
  const moved = bundle.districts.map(d => ({ ...d }));
  moved[0].centroid_lat = "50";
  await assert.rejects(validateCatalogue(catalogue, moved), /does not match/);
  for (const mutate of [c => { c.places[0].restaurant_name = "private"; },
    c => { c.places[0].districts.push("INVENTED"); }, c => { c.version = 99; }]) {
    const invalid = structuredClone(catalogue);
    mutate(invalid);
    await assert.rejects(validateCatalogue(invalid, bundle.districts));
  }
});

test("confirmed cities, boroughs and regions use centroid membership and never widen an empty boundary", () => {
  const reader = makeInterpreter(bundle, undefined, catalogue);
  for (const name of ["City of London", "Camden", "Greater London"]) {
    const area = reader.readArea(name) ?? reader.areaCandidates(name).find(a => a.label.includes("borough"));
    assert.ok(area, name);
    const codes = reader.districtsInScope(area, "any");
    assert.ok(codes.size > 0);
  }
  const city = reader.districtsInScope(reader.readArea("City of London"), "any");
  // 9 of the City's 17 districts are omitted as commercial cores without footfall (#165).
  assert.equal(city.size, 8);
  assert.equal(city.has("EC4M"), true);
  assert.equal(city.has("EC3M"), false);
  assert.equal(city.has("SE1"), false);
  const empty = catalogue.places.find(p => p.districts.length === 0);
  assert.equal(reader.districtsInScope({ kind: "place", code: empty.id }, "any").size, 0);
});
