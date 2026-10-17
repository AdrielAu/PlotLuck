// Bare tracer page: cuisine dropdown, district circles, threshold slider, ranked list.
import { loadBundle, rankDistricts, scoreDistricts } from "./scoring.js";

const $ = (id) => document.getElementById(id);

async function readModelFile(name) {
  const response = await fetch(`models/${name}`);
  if (!response.ok) throw new Error(`could not load models/${name} (HTTP ${response.status})`);
  return response.text();
}

async function main() {
  const bundle = await loadBundle(readModelFile);
  const defaults = Object.fromEntries(bundle.vocabulary.traits.map((t) => [t.name, t.default]));

  for (const c of bundle.vocabulary.cuisines) $("cuisine").add(new Option(c.label, c.cuisine));

  const map = L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const circles = new Map(
    bundle.districts.map((d) => [
      d.postcode_district,
      L.circleMarker([Number(d.centroid_lat), Number(d.centroid_lon)], { radius: 8 }),
    ]),
  );
  map.fitBounds(L.featureGroup([...circles.values()]).getBounds(), { padding: [20, 20] });

  // Scores change only with the profile; the slider just filters them.
  let scores = [];
  function rescore() {
    scores = scoreDistricts(bundle, { ...defaults, cuisine: $("cuisine").value });
    for (const { postcode_district, score } of scores) {
      circles.get(postcode_district).bindPopup(`${postcode_district}: ${score.toFixed(2)}`);
    }
    filter();
  }

  function filter() {
    const threshold = Number($("threshold").value);
    $("threshold-value").value = threshold.toFixed(2);
    const ranked = rankDistricts(scores, threshold);
    const shown = new Set(ranked.map((d) => d.postcode_district));
    for (const [code, circle] of circles) {
      if (shown.has(code)) circle.addTo(map);
      else circle.remove();
    }
    $("count").textContent = ranked.length
      ? `${ranked.length} of ${scores.length} districts`
      : "No district reaches this threshold. Lower it to see more.";
    $("ranked").replaceChildren(
      ...ranked.map(({ postcode_district, score }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${postcode_district}: ${score.toFixed(2)}`;
        button.addEventListener("click", () => {
          map.panTo(circles.get(postcode_district).getLatLng());
          circles.get(postcode_district).openPopup();
        });
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
  }

  $("cuisine").addEventListener("change", rescore);
  $("threshold").addEventListener("input", filter);
  rescore();
}

main().catch((error) => {
  $("error").textContent = `Plotluck could not start: ${error.message}`;
  $("error").hidden = false;
});
