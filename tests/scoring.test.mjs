import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseCsv, rankDistricts, scoreDistricts } from '../web/scoring.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

async function bundle() {
  const files = ['model.json', 'vocabulary.json', 'districts.csv', 'district_cuisine_supply.csv'];
  const contents = await Promise.all(files.map((name) => readFile(path.join(here, '..', 'web', 'models', name), 'utf8')));
  return {
    model: JSON.parse(contents[0]),
    vocabulary: JSON.parse(contents[1]),
    districts: parseCsv(contents[2]),
    supply: parseCsv(contents[3]),
  };
}

test('deployed sample bundle matches independently exported reference scores', async () => {
  const data = await bundle();
  const fixture = JSON.parse(await readFile(path.join(here, '..', 'data', 'sample', 'reference_scores.json'), 'utf8'));
  for (const { profile, scores: expected } of fixture.cases) {
    const actual = new Map(scoreDistricts(data, profile).map(({ postcode_district, score }) => [postcode_district, score]));
    assert.equal(actual.size, data.districts.length);
    for (const [district, score] of Object.entries(expected)) {
      assert.ok(Math.abs(actual.get(district) - score) <= fixture.tolerance, `${district}: ${actual.get(district)} != ${score}`);
    }
  }
});

test('unseen cuisine, absent supply, and missing numeric input are scored', async () => {
  const data = await bundle();
  const profile = { cuisine: 'Unseen', venue_type: 'Restaurant', price_band: 'unknown' };
  const scores = scoreDistricts(data, profile);
  const withExplicitDefaults = {
    ...data,
    districts: data.districts.map((district) => district.postcode_district === 'EC3P'
      ? { ...district, population: String(data.model.transforms.population.median) } : district),
    supply: [...data.supply, { postcode_district: 'EC3P', cuisine_group: 'Unseen', restaurants: '0' }],
  };
  const expected = scoreDistricts(withExplicitDefaults, profile);
  assert.deepEqual(scores, expected);
  const withUnmappedCuisine = {
    ...data,
    vocabulary: {
      ...data.vocabulary,
      cuisines: [...data.vocabulary.cuisines, { cuisine: 'Out-of-model', cuisine_group: 'Out-of-model' }],
    },
  };
  assert.deepEqual(scores, scoreDistricts(withUnmappedCuisine, { ...profile, cuisine: 'Out-of-model' }));
  assert.equal(scores.length, data.districts.length);
  assert.ok(scores.every(({ score }) => Number.isFinite(score) && score >= 0 && score <= 1));
});

test('invalid numeric data or model shape raises instead of showing NaN', async () => {
  const data = await bundle();
  const profile = { cuisine: 'British' };
  const brokenDistricts = data.districts.map((district) => district.postcode_district === 'SE1'
    ? { ...district, population: 'unknown' } : district);
  assert.throws(() => scoreDistricts({ ...data, districts: brokenDistricts }, profile), /invalid|finite/i);
  const brokenModel = { ...data.model, layers: [{ ...data.model.layers[0], weights: [[1]] }, ...data.model.layers.slice(1)] };
  assert.throws(() => scoreDistricts({ ...data, model: brokenModel }, profile), /invalid|finite/i);
});

test('ranking includes the threshold and breaks ties by district code', () => {
  const scores = [
    { postcode_district: 'B1', score: 0.7 },
    { postcode_district: 'A1', score: 0.7 },
    { postcode_district: 'C1', score: 0.4 },
  ];
  assert.deepEqual(rankDistricts(scores, 0.7).map((item) => item.postcode_district), ['A1', 'B1']);
  assert.deepEqual(rankDistricts(scores, 1), []);
});

test('wrong bundle version raises before scoring', async () => {
  const data = await bundle();
  assert.throws(() => scoreDistricts({ ...data, model: { ...data.model, version: 2 } }, { cuisine: 'British' }), /version/i);
  assert.throws(() => scoreDistricts({ ...data, vocabulary: { ...data.vocabulary, version: 2 } }, { cuisine: 'British' }), /version/i);
});

test('CSV parser preserves quoted commas', () => {
  assert.deepEqual(parseCsv('name,value\n"A, B",2\n'), [{ name: 'A, B', value: '2' }]);
});
