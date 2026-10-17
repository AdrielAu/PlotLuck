import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadBundle, scoreDistricts } from '../../web/scoring.js';
import { validateProfileExtraction } from '../../web/profile-extraction.js';
import { descriptionQuery, confirmedDescription } from '../../web/description-query.js';

const bundle = await loadBundle(n => readFile(new URL(`../../data/sample/${n}`, import.meta.url), 'utf8'));
const place = { id: 'leeds', name: 'Leeds', aliases: [], type: 'city', context: 'England', lat: 53.8, lon: -1.55, districts: ['SE1'] };
const catalogue = { places: [place, { ...place, id: 'city', name: 'City of London', aliases: ['London'] }, { ...place, id: 'greater', name: 'Greater London', aliases: ['London'] }] };
const full = text => `${text} Mid-range menu prices; any rent; no other requirements.`;
const extraction = (text, changes = {}) => validateProfileExtraction({ region: null, cuisine: 'Thai', venue_type: 'Restaurant', price_band: '$$', rent: null, requirements:'no other requirements', ...changes }, text, bundle.vocabulary, catalogue, {complete:true});

test('a clear description becomes a scoring query without routine questions; explicit dietary traits survive', async () => {
  const text = full('A Thai restaurant with vegan options.');
  const q = await descriptionQuery(text, extraction(text), bundle, catalogue);
  assert.deepEqual(q.needs, []);
  assert.equal(q.profile.vegan_options, true);
  assert.equal(q.fields.price_band.provenance, 'inferred');
  const confirmed = confirmedDescription(q, bundle, catalogue);
  assert.equal(confirmed.searchArea.length, bundle.districts.length);
  assert.equal(confirmed.searchAreaName, 'England');
});

test('ambiguous London and conflicting cuisines need only the relevant clarifications', async () => {
  const text = full('A Thai or Italian restaurant in London.');
  const q = await descriptionQuery(text, extraction(text, { region: 'London' }), bundle, catalogue);
  assert.deepEqual(q.needs.map(n => n.field), ['area', 'cuisine']);
  assert.equal(q.profile.cuisine, null);
  assert.throws(() => confirmedDescription(q, bundle, catalogue), /What food/);
  q.profile.cuisine = 'Thai';q.completion.cuisine = true;q.completion.area = true;q.area = { kind: 'place', code: 'city', label: 'City of London' };
  assert.deepEqual(confirmedDescription(q, bundle, catalogue).searchArea, ['SE1']);
});

test('omitted explicit locations and unsupported exclusions cannot silently search England', async () => {
  for (const text of [full('A Thai restaurant in Cardiff.'), full('A Thai restaurant in Leeds except the centre.')]) {
    const q = await descriptionQuery(text, extraction(text), bundle, catalogue);
    assert.ok(q.needs.some(n => n.field === 'area'));
    assert.equal(q.area, null);
    assert.throws(() => confirmedDescription(q, bundle, catalogue), /Where would you like/);
  }
});

test('a model cannot discard a second named location', async () => {
  const text = full('A Thai restaurant in Leeds or London.');
  const q = await descriptionQuery(text, extraction(text, { region:'Leeds' }), bundle, catalogue);
  assert.equal(q.area, null);
  assert.ok(q.needs.some(n => n.field === 'area'));
});

test('near searches use a default radius, preserve miles, and reject invalid or empty scopes', async () => {
  const text = full('A Thai restaurant within 3 miles of Leeds.');
  const q = await descriptionQuery(text, extraction(text, { region: 'Leeds' }), bundle, catalogue);
  assert.deepEqual(q.needs, []);
  assert.equal(q.radius, 3 * 1.609344);
  assert.throws(() => confirmedDescription(q, bundle, catalogue), /No district centres/);
  q.radius = -1;
  assert.throws(() => confirmedDescription(q, bundle, catalogue), /positive radius/);
  const near = full('A Thai restaurant near Leeds.');
  const d = await descriptionQuery(near, extraction(near, { region: 'Leeds' }), bundle, catalogue);
  assert.equal(d.radius, 5);
});

test('numeric rent requires a band choice and never overwrites district context', async () => {
  const text = 'A Thai restaurant, rent \u00a32,000 per month. Mid-range menu prices; no other requirements.';
  const q = await descriptionQuery(text, extraction(text, { rent: { amount: 2000, period: 'month', currency: 'GBP' } }), bundle, catalogue);
  assert.equal(q.rentBudget.annualGBP, 24000);
  assert.deepEqual(q.needs.map(n => n.field), ['rent']);
  assert.throws(() => confirmedDescription(q, bundle, catalogue), /How much rent/);
  q.rentBand = 'any';q.completion.rent = true;
  assert.equal(confirmedDescription(q, bundle, catalogue).searchArea.length, bundle.districts.length);
  assert.equal(Object.hasOwn(q.profile, 'commercial_rent_index'), false);
});

test('explicit relative rent words filter districts without a numeric budget', async () => {
  for (const phrase of ['low rent', 'rent low']) {
    const text = full(`A Thai restaurant with ${phrase}.`);
    const q = await descriptionQuery(text, extraction(text), bundle, catalogue);
    assert.equal(q.rentBand, 'low');
    assert.deepEqual(q.needs, []);
    assert.ok(confirmedDescription(q, bundle, catalogue).searchArea.length < bundle.districts.length);
  }
});

test('a price rejected by NN2 validation blocks scoring until explicitly clarified', async () => {
  const text = full('A Thai restaurant with uncertain prices.');
  const partial=extraction(text,{price_band:'$'});
  const q=await descriptionQuery(text,partial,bundle,catalogue);
  assert.deepEqual(q.needs.map(n=>n.field),['price']);
  assert.throws(()=>confirmedDescription(q,bundle,catalogue),/menu prices/);
  q.profile.price_band='$$';q.priceNeedsReview=false;q.completion.price=true;
  assert.equal(confirmedDescription(q,bundle,catalogue).profile.price_band,'$$');
});

test('districts the build withheld are absent from every search area and rent band', async () => {
  // EC4R and SE1P are tiny-population commercial cores and EC3M has no restaurants, so the sample bundle omits them.
  // The bundle carries accepted estimates as ordinary values (see test_build.py), so SE17 stands for either kind.
  const withheld = ['EC4R', 'SE1P', 'EC3M'];
  const borough = { ...place, id: 'borough', name: 'Borough', districts: ['SE1', 'SE17', ...withheld] };
  const text = full('A Thai restaurant in Borough.');
  // Sample rent tertiles put SE1 in the low band and SE17 in the mid band; no Borough district is high.
  const expected = { low: ['SE1'], mid: ['SE17'], high: null, any: ['SE1', 'SE17'] };
  for (const [rentBand, districts] of Object.entries(expected)) {
    const q = await descriptionQuery(text, extraction(text, { region: 'Borough' }), bundle, { places: [borough] });
    q.rentBand = rentBand;
    if (districts === null) {
      assert.throws(() => confirmedDescription(q, bundle, { places: [borough] }), /No district centres/);
      continue;
    }
    const confirmed = confirmedDescription(q, bundle, { places: [borough] });
    assert.deepEqual(confirmed.searchArea.sort(), districts, rentBand);
    const scored = scoreDistricts(bundle, confirmed.profile);
    for (const code of withheld) assert.equal(scored.some(s => s.postcode_district === code), false, code);
  }
});
