import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateCatalogue } from "../../web/geography.js";
import { makeInterpreter } from "../../web/interpret.js";
import { loadBundle } from "../../web/scoring.js";
import { validateProfileExtraction } from "../../web/profile-extraction.js";
import { descriptionQuery, confirmedDescription } from "../../web/description-query.js";

const root = new URL("../../web/models/", import.meta.url);
const bundle = await loadBundle(name => readFile(new URL(name, root), "utf8"));
const catalogue = JSON.parse(await readFile(new URL("geography.json", root), "utf8"));

test('Greater Manchester resolves to a county containing all ten borough scopes',()=>{
  const reader=makeInterpreter(bundle,undefined,catalogue);
  const area=reader.readArea('greater manchester');
  assert.ok(area);
  const county=catalogue.places.find(p=>p.id===area.code);
  assert.equal(county.type,'county');
  const boroughs=catalogue.places.filter(p=>/^E080000(?:0[1-9]|10)$/.test(p.id));
  assert.equal(boroughs.length,10);
  assert.deepEqual(county.districts,[...new Set(boroughs.flatMap(p=>p.districts))].sort());
  assert.ok(county.districts.length>reader.areaCandidates('Manchester').map(a=>catalogue.places.find(p=>p.id===a.code).districts.length).reduce((a,b)=>Math.max(a,b),0));
});

test('the reported description keeps Greater Manchester, mid-price food and cheap rent; only other requirements need answering',async()=>{
  const text='i want to open a thai restaurant in greater manchester that serves mid price range food. i want as cheap rent as possible';
  const extraction=validateProfileExtraction({region:'Greater Manchester',cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null,rent_band:'low',requirements:null},text,bundle.vocabulary,catalogue,{complete:true});
  const query=await descriptionQuery(text,extraction,bundle,catalogue);
  assert.deepEqual(query.needs.map(n=>n.field),['other']);
  assert.equal(query.profile.price_band,'$$');
  assert.equal(query.rentBand,'low');
  assert.match(query.area.label,/Greater Manchester/);
  query.completion.other=true;
  const confirmed=confirmedDescription(query,bundle,catalogue);
  assert.ok(confirmed.searchArea.length>0);
  const county=catalogue.places.find(p=>p.id===query.area.code);
  assert.ok(confirmed.searchArea.length<county.districts.length);
});

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
