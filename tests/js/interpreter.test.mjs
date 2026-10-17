import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateInterpretation, buildPrompt, interpretationSchema } from '../../web/interpreter.js';
const vocabulary = JSON.parse(await readFile(new URL('../../web/models/vocabulary.json', import.meta.url)));
const contract = JSON.parse(await readFile(new URL('../fixtures/nn2-contract.json', import.meta.url)));
const description = 'Thai restaurant in London with vegan options';
function reply() {
  const fields = Object.fromEntries(vocabulary.traits.map(t => [t.name, { value: t.default, provenance: 'default', evidence: null }]));
  fields.cuisine = { value: 'Thai', provenance: 'explicit', evidence: 'Thai' };
  fields.vegan_options = { value: true, provenance: 'explicit', evidence: 'vegan options' };
  return { fields, location: { text: 'London', near: false, distance: null, unit: null }, unused: [], clarifications: [] };
}
test('validated draft derives supported NN1 inputs and preserves location text', () => {
  const result = validateInterpretation(JSON.stringify(reply()), description, vocabulary);
  assert.equal(result.profile.cuisine, 'Thai');
  assert.equal(result.profile.vegan_options, true);
  assert.equal(result.location.text, 'London');
  assert.equal(buildPrompt(description, vocabulary)[1].content, description);
  assert.equal(buildPrompt(description, vocabulary)[0].content, contract.system);
  assert.deepEqual(interpretationSchema(vocabulary), contract.schema);
});
test('invalid enum values, fabricated evidence and location IDs never become scoring inputs', () => {
  for (const change of [r => { r.fields.cuisine.value = 'Invented'; },
    r => { r.fields.chain.value = 'false'; }, r => { r.fields.vegan_options.evidence = 'not in description'; },
    r => { r.location.id = 'invented'; }, r => { r.fields.chain.value = true; }]) {
    const r = reply(); change(r);
    assert.throws(() => validateInterpretation(r, description, vocabulary));
  }
  assert.throws(() => validateInterpretation('{', description, vocabulary));
  assert.throws(() => buildPrompt('a'.repeat(1001), vocabulary));
});
test('an unresolved cuisine is reviewable only with a clarification', () => {
  const r = reply(); r.fields.cuisine = { value: null, provenance: 'default', evidence: null };
  assert.throws(() => validateInterpretation(r, description, vocabulary));
  r.clarifications = ['Choose a supported cuisine.'];
  assert.equal(validateInterpretation(r, description, vocabulary).profile.cuisine, null);
});
test('cue-only sparse fields receive deterministic vocabulary defaults without invented provenance', () => {
  const r = reply();
  r.fields = { cuisine: r.fields.cuisine, vegan_options: r.fields.vegan_options };
  const draft = validateInterpretation(r, description, vocabulary);
  assert.deepEqual(draft.fields.price_band, { value: 'unknown', provenance: 'default', evidence: null });
  assert.equal(draft.profile.vegan_options, true);
  delete r.fields.cuisine;
  assert.throws(() => validateInterpretation(r, description, vocabulary));
});
test('the rent band is a validated filter: never an NN1 input, any by default, invalid values rejected', () => {
  const rentDescription = 'Food: Thai\nRent: as cheap as possible';
  const r = reply();
  r.fields.cuisine.evidence = 'Thai';
  r.fields.vegan_options = { value: true, provenance: 'inferred', evidence: 'Thai' };
  r.location = { text: null, near: false, distance: null, unit: null };
  const sparse = validateInterpretation(r, rentDescription, vocabulary);
  assert.equal(sparse.rentBand, 'any');
  assert.equal(sparse.fields.rent_band.provenance, 'default');
  assert.equal('rent_band' in sparse.profile, false);
  r.fields.rent_band = { value: 'low', provenance: 'inferred', evidence: 'as cheap as possible' };
  assert.equal(validateInterpretation(r, rentDescription, vocabulary).rentBand, 'low');
  for (const value of ['cheap', 'Low', null, true]) {
    r.fields.rent_band.value = value;
    assert.throws(() => validateInterpretation(r, rentDescription, vocabulary), String(value));
  }
  assert.deepEqual(interpretationSchema(vocabulary).properties.fields.properties.rent_band.properties.value.enum, ['low', 'mid', 'high', 'any']);
  assert.match(buildPrompt(rentDescription, vocabulary)[0].content, /rent_band/);
});
test('in labelled answers, rent band evidence must come from the Rent line', () => {
  const answers = 'Food: Thai\nRent: whatever works\nOther: cheap and cheerful';
  const r = reply();
  r.fields.vegan_options = { value: true, provenance: 'inferred', evidence: 'Thai' };
  r.location = { text: null, near: false, distance: null, unit: null };
  r.fields.rent_band = { value: 'low', provenance: 'inferred', evidence: 'cheap' };
  assert.throws(() => validateInterpretation(r, answers, vocabulary), /rent/i);
  r.fields.rent_band = { value: 'any', provenance: 'explicit', evidence: 'whatever works' };
  assert.equal(validateInterpretation(r, answers, vocabulary).rentBand, 'any');
});
