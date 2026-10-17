import { parseCsv, rankDistricts, scoreDistricts } from './scoring.mjs';

const cuisineSelect = document.querySelector('#cuisine');
const thresholdInput = document.querySelector('#threshold');
const thresholdValue = document.querySelector('#threshold-value');
const results = document.querySelector('#results');
const resultCount = document.querySelector('#result-count');
const error = document.querySelector('#error');

async function load(name) {
  const response = await fetch(`./models/${name}`);
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
  return name.endsWith('.json') ? response.json() : parseCsv(await response.text());
}

try {
  const [model, vocabulary, districts, supply] = await Promise.all([
    load('model.json'), load('vocabulary.json'), load('districts.csv'), load('district_cuisine_supply.csv'),
  ]);
  const bundle = { model, vocabulary, districts, supply };
  for (const { cuisine, label } of vocabulary.cuisines) {
    const option = document.createElement('option');
    option.value = cuisine;
    option.textContent = label;
    cuisineSelect.append(option);
  }
  const map = L.map('map').setView([51.501, -0.095], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  const circles = L.layerGroup().addTo(map);
  let scores = [];

  function draw() {
    const threshold = Number(thresholdInput.value);
    thresholdValue.value = threshold.toFixed(2);
    const ranked = rankDistricts(scores, threshold);
    const byDistrict = new Map(districts.map((district) => [district.postcode_district, district]));
    circles.clearLayers();
    results.replaceChildren();
    resultCount.textContent = `${ranked.length} shown`;
    for (const { postcode_district: code, score } of ranked) {
      const district = byDistrict.get(code);
      const circle = L.circleMarker([Number(district.centroid_lat), Number(district.centroid_lon)], {
        radius: 8, color: '#375c48', fillColor: '#658c6e', fillOpacity: 0.76, weight: 1,
      });
      const popup = document.createElement('span');
      popup.textContent = `${code}: ${score.toFixed(3)}`;
      circle.bindPopup(popup).addTo(circles);
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = code;
      const value = document.createElement('span');
      value.textContent = score.toFixed(3);
      item.append(name, value);
      results.append(item);
    }
  }

  function rescore() {
    const defaults = Object.fromEntries(vocabulary.traits.map(({ name, default: value }) => [name, value]));
    scores = scoreDistricts(bundle, { cuisine: cuisineSelect.value, ...defaults });
    draw();
  }

  cuisineSelect.addEventListener('change', rescore);
  thresholdInput.addEventListener('input', draw);
  rescore();
} catch (cause) {
  error.hidden = false;
  error.textContent = `The district scores could not be loaded. ${cause.message}`;
}
