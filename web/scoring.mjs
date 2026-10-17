export function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  const [headers, ...records] = rows;
  return records.filter((record) => record.some(Boolean)).map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

function numeric(value, transform) {
  const raw = value === '' || value === null || value === undefined ? transform.median : Number(value);
  if (![raw, transform.mean, transform.std, transform.median].every(Number.isFinite) || transform.std <= 0 || raw < 0 && transform.log1p) {
    throw new Error('Invalid numeric input or transform');
  }
  const transformed = transform.log1p ? Math.log1p(raw) : raw;
  return (transformed - transform.mean) / transform.std;
}

function forward(inputs, model) {
  return model.layers.reduce((values, layer, layerIndex) => {
    const activation = model.activations[layerIndex];
    if (layer.weights.length !== layer.biases.length) throw new Error('Invalid model layer shape');
    return layer.weights.map((weights, outputIndex) => {
      if (weights.length !== values.length) throw new Error('Invalid model layer shape');
      const sum = weights.reduce((total, weight, inputIndex) => total + weight * values[inputIndex], layer.biases[outputIndex]);
      if (!Number.isFinite(sum)) throw new Error('Invalid model weight or input');
      if (activation === 'relu') return Math.max(0, sum);
      if (activation === 'sigmoid') return 1 / (1 + Math.exp(-sum));
      throw new Error(`Unknown activation: ${activation}`);
    });
  }, inputs)[0];
}

export function scoreDistricts(bundle, profile) {
  const { model, vocabulary, districts, supply } = bundle;
  if (model.version !== 1 || vocabulary.version !== 1) throw new Error('Unsupported bundle version');
  if (!Array.isArray(districts) || !Array.isArray(supply) || !Array.isArray(model.layers)) {
    throw new Error('Invalid bundle tables or model');
  }
  if (districts.some(({ postcode_district }) => !postcode_district)) throw new Error('Invalid district code');
  if (supply.some(({ postcode_district, cuisine_group, restaurants }) =>
    !postcode_district || !cuisine_group || !Number.isFinite(Number(restaurants)) || Number(restaurants) < 0)) {
    throw new Error('Invalid supply table');
  }

  const cuisineGroup = vocabulary.cuisines.find(({ cuisine }) => cuisine === profile.cuisine)?.cuisine_group;
  const supplyByPair = new Map(supply.map((row) => [`${row.postcode_district}\0${row.cuisine_group}`, Number(row.restaurants)]));
  const restaurantInputs = model.features.restaurant_inputs.flatMap((name) => {
    const transform = model.transforms[name];
    const value = name === 'cuisine_group' ? cuisineGroup : profile[name];
    if (transform.kind === 'one_hot') return transform.values.map((candidate) => Number(value === candidate));
    if (transform.kind === 'flag') return [Number(value === true || value === 1)];
    throw new Error(`Unknown restaurant input: ${name}`);
  });

  return districts.map((district) => {
    const districtInputs = model.features.district_inputs.map((name) => {
      const value = name === 'same_cuisine_supply'
        ? (supplyByPair.get(`${district.postcode_district}\0${cuisineGroup}`) ?? 0)
        : district[name];
      return numeric(value, model.transforms[name]);
    });
    const score = forward([...restaurantInputs, ...districtInputs], model);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid model score');
    return {
      postcode_district: district.postcode_district,
      score,
    };
  });
}

export function rankDistricts(scores, threshold) {
  return scores.filter(({ score }) => score >= threshold).sort((left, right) =>
    right.score - left.score || left.postcode_district.localeCompare(right.postcode_district));
}
