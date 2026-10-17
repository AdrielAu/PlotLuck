// District results: score colours, threshold and an accessible shortlist.
import { loadBundle, rankDistricts, scoreDistricts } from "./scoring.js";

const $ = (id) => document.getElementById(id);

function showError(error) {
  $("loading").hidden = true;
  $("results").hidden = true;
  $("cuisine").disabled = true;
  $("threshold").disabled = true;
  $("error-detail").textContent = `${error.message}. Check your connection and try loading again. If this continues, the site's model files may need updating.`;
  $("error").hidden = false;
}

$("retry").addEventListener("click", () => window.location.reload());

async function readModelFile(name) {
  const response = await fetch(`models/${name}`);
  if (!response.ok) throw new Error(`could not load models/${name} (HTTP ${response.status})`);
  return response.text();
}

async function main() {
  const bundle = await loadBundle(readModelFile);
  const defaults = Object.fromEntries(bundle.vocabulary.traits.map((t) => [t.name, t.default]));

  for (const c of bundle.vocabulary.cuisines) $("cuisine").add(new Option(c.label, c.cuisine));

  $("results").hidden = false;
  const map = L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const circles = new Map(
    bundle.districts.map((d) => [
      d.postcode_district,
      L.circleMarker([Number(d.centroid_lat), Number(d.centroid_lon)], { radius: 8, color: "#284c29", weight: 1, fillOpacity: 0.85 }),
    ]),
  );
  map.fitBounds(L.featureGroup([...circles.values()]).getBounds(), { padding: [20, 20] });

  // Scores change only with the profile; the slider just filters them.
  let scores = [];
  let threshold = 0;
  let thresholdMoved = false;
  function rescore() {
    scores = scoreDistricts(bundle, { ...defaults, cuisine: $("cuisine").value });
    for (const { postcode_district, score } of scores) {
      const pale = [224, 237, 215], dark = [40, 76, 41];
      const fill = pale.map((channel, i) => Math.round(channel + (dark[i] - channel) * score));
      const popup = document.createElement("p");
      popup.textContent = `${postcode_district}: ${score.toFixed(4)}`;
      circles.get(postcode_district)
        .setStyle({ fillColor: `rgb(${fill.join(",")})` })
        .bindPopup(popup);
    }
    if (!thresholdMoved) {
      const ranked = rankDistricts(scores, 0);
      threshold = ranked[Math.max(0, Math.ceil(ranked.length * 0.1) - 1)]?.score ?? 0;
      // Keep the exact initial cutoff even when the range control rounds its
      // thumb to a 0.01 step. A narrow score spread still gets a useful shortlist.
      $("threshold").value = String(threshold);
    }
    applyThreshold();
  }

  function applyThreshold() {
    $("threshold-value").value = threshold.toFixed(4);
    $("threshold").setAttribute("aria-valuetext", `${threshold.toFixed(4)} review-based success score`);
    const ranked = rankDistricts(scores, threshold);
    const shown = new Set(ranked.map((d) => d.postcode_district));
    for (const [code, circle] of circles) {
      if (shown.has(code)) circle.addTo(map);
      else circle.remove();
    }
    $("count").textContent = `${ranked.length} of ${scores.length} districts at or above the threshold`;
    $("empty").hidden = ranked.length > 0;
    $("ranked").replaceChildren(
      ...ranked.map(({ postcode_district, score }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `${postcode_district}, score ${score.toFixed(4)}. Show on map.`);
        const code = document.createElement("span");
        code.className = "district-code";
        code.textContent = postcode_district;
        const value = document.createElement("span");
        value.className = "district-score";
        value.textContent = score.toFixed(4);
        button.append(code, value);
        button.addEventListener("click", () => {
          map.panTo(circles.get(postcode_district).getLatLng(), { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
          circles.get(postcode_district).openPopup();
        });
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
  }

  $("cuisine").addEventListener("change", () => {
    try { rescore(); } catch (error) { showError(error); }
  });
  $("threshold").addEventListener("input", () => {
    thresholdMoved = true;
    threshold = Number($("threshold").value);
    applyThreshold();
  });
  rescore();
  $("loading").hidden = true;
  $("cuisine").disabled = false;
  $("threshold").disabled = false;
}

main().catch(showError);
