// Score a restaurant profile in every district with the bundle's NN1 weights.
// Pure: no DOM or Leaflet, so it runs in Node tests and in the browser.

// Must match BUNDLE_VERSION in src/plotluck/build.py.
export const BUNDLE_VERSION = 1;

// Load the bundle through `read(name) -> Promise<text>` (fetch in the page, fs in tests).
export async function loadBundle(read) {
  const [districts, supply, vocabulary, model] = await Promise.all([
    read("districts.csv").then(parseCsv),
    read("district_cuisine_supply.csv").then(parseCsv),
    read("vocabulary.json").then(JSON.parse),
    read("model.json").then(JSON.parse),
  ]);
  for (const [name, file] of [["vocabulary.json", vocabulary], ["model.json", model]]) {
    if (file.version !== BUNDLE_VERSION) {
      throw new Error(`${name} is bundle version ${file.version}; this site reads version ${BUNDLE_VERSION}`);
    }
  }
  return {
    districts,
    supply: new Map(supply.map((r) => [supplyKey(r.postcode_district, r.cuisine_group), Number(r.restaurants)])),
    groups: new Map(vocabulary.cuisines.map((c) => [c.cuisine, c.cuisine_group])),
    vocabulary,
    model,
  };
}

// [{postcode_district, score}] for every district, in the bundle's district order.
export function scoreDistricts(bundle, profile) {
  const { model } = bundle;
  const group = bundle.groups.get(profile.cuisine);
  const head = restaurantInputs(model, { ...profile, cuisine_group: group });
  return bundle.districts.map((d) => {
    const tail = model.features.district_inputs.map((name) => {
      // Every district input is a districts.csv column, except supply of the profile's own group.
      const raw = name === "same_cuisine_supply" ? (bundle.supply.get(supplyKey(d.postcode_district, group)) ?? 0) : d[name];
      if (raw === undefined) throw new Error(`model.json input ${name} is not a districts.csv column`);
      return numericInput(model.transforms[name], raw);
    });
    return { postcode_district: d.postcode_district, score: forward(model, [...head, ...tail]) };
  });
}

// Districts with score >= threshold, best first, ties broken by district code.
export function rankDistricts(scores, threshold) {
  return scores
    .filter((d) => d.score >= threshold)
    .sort((a, b) => b.score - a.score || (a.postcode_district < b.postcode_district ? -1 : 1));
}

function restaurantInputs(model, profile) {
  return model.features.restaurant_inputs.flatMap((name) => {
    const t = model.transforms[name];
    // A value outside the vocabulary (an unseen cuisine) encodes as all zeros.
    return t.kind === "one_hot" ? t.values.map((v) => Number(profile[name] === v)) : [Number(Boolean(profile[name]))];
  });
}

function numericInput(t, value) {
  let x = value === "" || value == null ? t.median : Number(value);
  if (t.log1p) x = Math.log1p(x);
  return (x - t.mean) / t.std;
}

const ACTIVATIONS = {
  relu: (z) => Math.max(z, 0),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
};

function forward(model, x) {
  model.layers.forEach((layer, i) => {
    const activation = ACTIVATIONS[model.activations[i]];
    if (!activation) throw new Error(`model.json activation ${model.activations[i]} is not supported`);
    x = layer.weights.map((row, j) => activation(row.reduce((sum, w, k) => sum + w * x[k], layer.biases[j])));
  });
  return x[0];
}

function supplyKey(district, group) {
  return `${district}\t${group}`;
}

// shortcut: no quoted fields; bundle CSVs hold codes, numbers and group names only.
// Upgrade if a cuisine group name ever needs a comma.
function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/).map((line) => line.split(","));
  return lines.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]])));
}
