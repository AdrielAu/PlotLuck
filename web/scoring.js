// Score a restaurant profile in every district with the bundle's NN1 weights.
// Pure: no DOM or Leaflet, so it runs in Node tests and in the browser.

// Must match BUNDLE_VERSION in src/plotluck/build.py.
export const BUNDLE_VERSION = 2;

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
  for (const d of districts) {
    if (!d.postcode_district || !Number.isFinite(Number(d.centroid_lat)) ||
        !Number.isFinite(Number(d.centroid_lon)) || d.centroid_lat === "" || d.centroid_lon === "") {
      throw new Error("districts.csv has an invalid district code or coordinate");
    }
    // The results map draws each district as a circle of this radius.
    if (!d.radius_km || !(Number(d.radius_km) > 0)) {
      throw new Error("districts.csv has a missing or invalid radius_km");
    }
  }
  for (const r of supply) {
    if (!r.postcode_district || !r.cuisine_group || r.restaurants === "" ||
        !Number.isFinite(Number(r.restaurants)) || Number(r.restaurants) < 0) {
      throw new Error("district_cuisine_supply.csv has an invalid supply row");
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
    const score = forward(model, [...head, ...tail]);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error("model.json produced an invalid score");
    return { postcode_district: d.postcode_district, score };
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
  if (!t || ![t.mean, t.std, t.median].every(Number.isFinite) || t.std <= 0) {
    throw new Error("model.json has an invalid numeric transform");
  }
  let x = value === "" || value == null ? t.median : Number(value);
  if (!Number.isFinite(x) || (t.log1p && x < 0)) throw new Error("districts.csv has an invalid numeric input");
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
    if (layer.weights.length !== layer.biases.length || layer.weights.some((row) => row.length !== x.length)) {
      throw new Error("model.json has an invalid layer shape");
    }
    x = layer.weights.map((row, j) => {
      const sum = row.reduce((total, weight, k) => total + weight * x[k], layer.biases[j]);
      if (!Number.isFinite(sum)) throw new Error("model.json has an invalid layer weight or bias");
      return activation(sum);
    });
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
