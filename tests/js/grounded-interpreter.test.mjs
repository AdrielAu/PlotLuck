import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { groundInterpretation, placeCandidates, retryAdvice } from '../../web/grounded-interpreter.js';
import { areaDistricts, rentBandDistricts } from '../../web/description-controls.js';
const vocabulary = JSON.parse(await readFile(new URL('../../web/models/vocabulary.json', import.meta.url)));
const catalogue = JSON.parse(await readFile(new URL('../../web/models/geography.json', import.meta.url)));
const description = 'A Thai restaurant within 3 km of London with vegan options.';
const reply = () => ({ cuisine: 'Thai', cuisine_evidence: 'Thai', cuisine_provenance: 'explicit',
  traits: [{name: 'vegan_options', value: true, evidence: 'vegan options', provenance: 'explicit'}],
  location: {text: 'London', near: true, distance: 3, unit: 'km'}, unused: [], clarifications: [] });

test('local lookup supplies typed geometry candidates without silently choosing London', () => {
  const result = groundInterpretation(JSON.stringify(reply()), description, vocabulary, catalogue);
  assert.equal(result.draft.profile.vegan_options, true);
  assert.equal(result.draft.location.distance, 3);
  assert.ok(result.candidates.length >= 2);
  assert.ok(result.candidates.some(p => p.name === 'Greater London'));
  assert.ok(result.candidates.some(p => p.name === 'City of London'));
  assert.ok(result.candidates.every(p => catalogue.places.some(actual => actual.id === p.id)));
  assert.equal(placeCandidates('Atlantis', catalogue).length, 0);
});

test('grounding rejects invented evidence, generated geometry and duplicate trait values', () => {
  for (const change of [r => {r.cuisine_evidence = 'Thailand';}, r => {r.location.lat = 51;},
    r => {r.traits.push({...r.traits[0]});}, r => {r.traits[0].value = 'true';}]) {
    const r = reply(); change(r);
    assert.throws(() => groundInterpretation(r, description, vocabulary, catalogue));
  }
});

test('three failed attempts guide manual completion and retain the user choices', () => {
  assert.equal(retryAdvice(2, ['cuisine', 'vegan_options']).canRetry, true);
  const result = retryAdvice(3, ['cuisine', 'vegan_options']);
  assert.equal(result.canRetry, false);
  assert.match(result.message, /choose.*cuisine/i);
  assert.match(result.message, /vegan options/i);
  assert.throws(() => retryAdvice(-1, []));
});

test('confirmed areas filter district centres and unresolved areas block comparison', () => {
  const districts = [{postcode_district:'CENTRE',centroid_lat:'51',centroid_lon:'0'},
    {postcode_district:'OUTSIDE',centroid_lat:'52',centroid_lon:'0'}];
  const place = {lat:51,lon:0,districts:['OUTSIDE']};
  assert.deepEqual([...areaDistricts({place,radius:3},districts)],['CENTRE']);
  assert.deepEqual([...areaDistricts({place,radius:null},districts)],['OUTSIDE']);
  assert.equal(areaDistricts({place:null,radius:null},districts),null);
  assert.throws(()=>areaDistricts(null,districts));
  assert.throws(()=>areaDistricts({place,radius:0},districts));
});

test('confirmed rent bands use the MVP district thirds and keep missing rents only for any',()=>{
  const districts=[...Array.from({length:6},(_,i)=>({postcode_district:`D${i+1}`,commercial_rent_index:String((i+1)*100)})),
    {postcode_district:'MISSING',commercial_rent_index:''}];
  assert.deepEqual([...rentBandDistricts(districts,'low')],['D1','D2']);
  assert.deepEqual([...rentBandDistricts(districts,'mid')],['D3','D4']);
  assert.deepEqual([...rentBandDistricts(districts,'high')],['D5','D6']);
  assert.equal(rentBandDistricts(districts,'any'),null);
  assert.throws(()=>rentBandDistricts(districts,''));
});
