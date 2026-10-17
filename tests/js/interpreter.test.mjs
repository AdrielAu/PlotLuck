import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateInterpretation, buildPrompt } from '../../web/interpreter.js';
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
