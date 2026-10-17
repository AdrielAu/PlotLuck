// The results screen: a Leaflet map, the score threshold and the ranked list for one confirmed query.
import { scoreDistricts } from "./scoring.js";
import { defaultThreshold, inSearchArea, readAnswers, resultsAt, thresholdRange } from "./results.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Show one of the page's three screens and hide the others.
export function showScreen(id) {
  for (const screen of ["questions-screen", "results-screen", "answers-error"]) $(screen).hidden = screen !== id;
}

// Hand-off from the questions screen. Returns `openResults({ profile, searchArea })`:
// `profile` is a cuisine plus every shipped trait in the vocabulary's values, and
// `searchArea` lists postcode district codes (empty or absent means all England).
// Unreadable answers show "We couldn't read your answers" instead of a map, and
// `openResults` returns false. `describeProfile(profile, searchAreaName)` gives
// `{ heading, summary }` text; `onChangeAnswers()`
// runs after the questions screen is shown again, with its state untouched.
// Answers stay in this tab's memory: nothing goes in the address, history or storage.
export function setUpResultsScreen(bundle, { describeProfile, onChangeAnswers }) {
  const centroids = new Map(bundle.districts.map((d) => [d.postcode_district, [Number(d.centroid_lat), Number(d.centroid_lon)]]));  let map = null;
  let circles = null;
  // The query on screen. A re-confirmed identical query keeps a moved threshold; a new one resets it.
  let onScreen = null;

  function backToQuestions() {
    showScreen("questions-screen");
    onChangeAnswers();
  }
  $("change-answers").addEventListener("click", backToQuestions);
  $("answers-error-back").addEventListener("click", backToQuestions);

  // The map is built on first use, once its container is visible.
  function ensureMap() {
    if (map) {
      map.invalidateSize();
      return;
    }
    map = L.map("map");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Sized in metres, not pixels, so each circle keeps roughly covering its district at every zoom.
    circles = new Map(
      bundle.districts.map((d) => [
        d.postcode_district,
        L.circle(centroids.get(d.postcode_district), { radius: Number(d.radius_km) * 1000, color: "#284c29", weight: 1, fillOpacity: 0.5 }),
      ]),
    );
  }

  function render() {
    const { scores, threshold } = onScreen;
    $("threshold-value").value = threshold.toFixed(4);
    $("threshold").setAttribute("aria-valuetext", `${threshold.toFixed(4)} review-based success score`);
    const { shown, countLine } = resultsAt(scores, threshold);
    const shownCodes = new Set(shown.map((d) => d.postcode_district));
    for (const [code, circle] of circles) {
      if (!shownCodes.has(code)) circle.remove();
    }
    // Worst rank first, so each better-ranked circle is drawn over those before it.
    for (const { postcode_district } of shown.toReversed()) circles.get(postcode_district).addTo(map).bringToFront();
    $("count").textContent = countLine;
    $("empty").hidden = shown.length > 0;
    $("ranked").replaceChildren(
      ...shown.map(({ rank, postcode_district, score }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Rank ${rank}: ${postcode_district}, score ${score.toFixed(4)}. Show on map.`);
        const parts = [["district-rank", String(rank)], ["district-code", postcode_district], ["district-score", score.toFixed(4)]];
        button.append(...parts.map(([className, text]) => {
          const span = document.createElement("span");
          span.className = className;
          span.textContent = text;
          return span;
        }));
        button.addEventListener("click", () => {
          map.panTo(circles.get(postcode_district).getLatLng(), { animate: !reducedMotion() });
          circles.get(postcode_district).openPopup();
        });
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
  }

  $("threshold").addEventListener("input", () => {
    onScreen.threshold = Number($("threshold").value);
    render();
  });

  return function openResults(answers) {
    const query = readAnswers(bundle, answers);
    if (!query) {
      showScreen("answers-error");
      $("answers-error-heading").focus();
      return false;
    }
    showScreen("results-screen");
    ensureMap();
    const key = JSON.stringify(query);
    if (onScreen?.key !== key) {
      // Scores change only with the query; the slider just filters them.
      const scores = inSearchArea(scoreDistricts(bundle, query.profile), query);
      onScreen = { key, scores, threshold: defaultThreshold(scores) };
      for (const { postcode_district, score } of scores) {
        const pale = [224, 237, 215], dark = [40, 76, 41];
        const fill = pale.map((channel, i) => Math.round(channel + (dark[i] - channel) * score));
        const popup = document.createElement("p");
        popup.textContent = `${postcode_district}: ${score.toFixed(4)}`;
        circles.get(postcode_district).setStyle({ fillColor: `rgb(${fill.join(",")})` }).bindPopup(popup);
      }
      const { min, max } = thresholdRange(scores);
      Object.assign($("threshold"), { min: String(min), max: String(max) });
      $("threshold").value = String(onScreen.threshold);
      // Frame the whole search area, not just the shown districts, clear of the threshold bar.
      map.fitBounds(L.latLngBounds(query.searchArea.map((code) => centroids.get(code))), {
        paddingTopLeft: [32, 32],
        paddingBottomRight: [32, document.querySelector(".map-bar").offsetHeight + 24],
        maxZoom: 13,
      });
    }
    const { heading, summary } = describeProfile(query.profile, answers.searchArea?.length ? "your search area" : "England");
    $("results-heading").textContent = heading;
    $("confirmed-profile").textContent = summary;
    render();
    $("results-heading").focus();
    return true;
  };
}
