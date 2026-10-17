// The results screen: a Leaflet map, the score threshold and the ranked list for one confirmed query.
import { scoreDistricts } from "./scoring.js";
import { circleLabel, defaultThreshold, inSearchArea, readAnswers, resultsAt, thresholdRange } from "./results.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The map's first view, before it glides to the search area.
const ENGLAND = [[49.9, -5.8], [55.8, 1.8]];

// Show one of the page's three screens and hide the others.
export function showScreen(id) {
  for (const screen of ["questions-screen", "results-screen", "answers-error"]) $(screen).hidden = screen !== id;
}

// Hand-off from the questions screen. Returns `openResults({ profile, searchArea, searchAreaName })`:
// `profile` is a cuisine plus every shipped trait in the vocabulary's values,
// `searchArea` lists postcode district codes (empty or absent means all England),
// and the optional `searchAreaName` names it in the heading.
// Unreadable answers show "We couldn't read your answers" instead of a map, and
// `openResults` returns false. `describeProfile(profile, searchAreaName)` gives
// `{ heading, summary }` text; `onChangeAnswers()`
// runs after the questions screen is shown again, with its state untouched.
// Answers stay in this tab's memory: nothing goes in the address, history or storage.
export function setUpResultsScreen(bundle, { describeProfile, onChangeAnswers }) {
  const centroids = new Map(bundle.districts.map((d) => [d.postcode_district, [Number(d.centroid_lat), Number(d.centroid_lon)]]));
  let map = null;
  let circles = null;
  // The query on screen. A re-confirmed identical query keeps a moved threshold; a new one resets it.
  let onScreen = null;
  // The shown districts' list buttons by code, and the district highlighted on both map and list.
  let rows = new Map();
  let highlighted = null;
  let ring = null;

  // Highlight one district's circle and list row, or none (`null`). The ring is a separate
  // layer on top, so the circles keep their best-rank-on-top order.
  function highlight(code) {
    // A tooltip a row click opened stays up until closed here.
    if (highlighted !== code) circles.get(highlighted)?.closeTooltip();
    rows.get(highlighted)?.classList.remove("is-highlighted");
    ring.remove();
    highlighted = code;
    if (!code) return;
    const circle = circles.get(code);
    ring.setLatLng(circle.getLatLng()).setRadius(circle.getRadius()).addTo(map);
    const row = rows.get(code);
    row?.classList.add("is-highlighted");
    row?.scrollIntoView({ block: "nearest" });
  }

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
    // Quarter-step zoom so a search area is framed closely: with whole steps, an area just too
    // big for one zoom gets the next one out, showing twice the width (Greater London).
    map = L.map("map", { zoomSnap: 0.25 }).fitBounds(ENGLAND);
    // Opening or closing the pickers panel resizes the map; Leaflet must re-measure it, or
    // its centre (where a row click glides to) and tiles are off.
    new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Sized in metres, not pixels, so each circle keeps roughly covering its district at every zoom.
    circles = new Map(
      bundle.districts.map((d) => {
        const code = d.postcode_district;
        const circle = L.circle(centroids.get(code), { radius: Number(d.radius_km) * 1000, color: "#2f3437", weight: 1, fillOpacity: 0.5 })
          .bindTooltip("", { direction: "top" })
          .on("mouseover", () => highlight(code))
          .on("mouseout", () => highlight(null));
        return [code, circle];
      }),
    );
    ring = L.circle(ENGLAND[0], { color: "#2f3437", weight: 3, fill: false, interactive: false });
  }

  function render() {
    const { scores, threshold } = onScreen;
    $("threshold-value").value = threshold.toFixed(4);
    $("threshold").setAttribute("aria-valuetext", `${threshold.toFixed(4)} review-based success score`);
    const { shown, countLine, legend, decimals } = resultsAt(scores, threshold);
    const shownByCode = new Map(shown.map((d) => [d.postcode_district, d]));
    for (const [code, circle] of circles) {
      if (!shownByCode.has(code)) circle.remove();
    }
    // Worst rank first, so each better-ranked circle is drawn over those before it.
    for (const district of shown.toReversed()) {
      circles.get(district.postcode_district)
        .setStyle({ fillColor: district.colour })
        .setTooltipContent(circleLabel(district, decimals))
        .addTo(map)
        .bringToFront();
    }
    $("legend").hidden = !legend;
    if (legend) {
      const [low, high] = [legend.low.toFixed(decimals), legend.high.toFixed(decimals)];
      $("legend-low").textContent = low;
      $("legend-high").textContent = high;
      $("legend").setAttribute("aria-label", `Score colours: blue is the lowest shown score, ${low}; red is the highest, ${high}`);
    }
    $("count").textContent = countLine;
    $("empty").hidden = shown.length > 0;
    rows = new Map();
    $("ranked").replaceChildren(
      ...shown.map(({ rank, postcode_district, score }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Rank ${rank}: ${postcode_district}, score ${score.toFixed(decimals)}. Show on map.`);
        const parts = [["district-rank", String(rank)], ["district-code", postcode_district], ["district-score", score.toFixed(decimals)]];
        button.append(...parts.map(([className, text]) => {
          const span = document.createElement("span");
          span.className = className;
          span.textContent = text;
          return span;
        }));
        button.addEventListener("click", () => {
          const circle = circles.get(postcode_district);
          // Zoom in until the district fills about a third of the view (a small one is under a
          // pixel at England's zoom), never out, and no closer than street level.
          const fit = map.getBoundsZoom(circle.getLatLng().toBounds(circle.getRadius() * 6));
          map.flyTo(circle.getLatLng(), Math.max(map.getZoom(), Math.min(fit, 13)), { animate: !reducedMotion(), duration: 1 });
          highlight(postcode_district);
          circle.openTooltip();
        });
        rows.set(postcode_district, button);
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
    // Keep a highlight across slider moves while its district is still shown.
    highlight(shownByCode.has(highlighted) ? highlighted : null);
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
    // Heading text first: when it wraps, the map below gets shorter, and framing needs its final size.
    const { heading, summary } = describeProfile(query.profile, answers.searchAreaName ?? (answers.searchArea?.length ? "your search area" : "England"));
    $("results-heading").textContent = heading;
    $("confirmed-profile").textContent = summary;
    ensureMap();
    const key = JSON.stringify(query);
    const isNewQuery = onScreen?.key !== key;
    if (isNewQuery) {
      // Scores change only with the query; the slider just filters them.
      const scores = inSearchArea(scoreDistricts(bundle, query.profile), query);
      onScreen = { key, scores, threshold: defaultThreshold(scores) };
      const { min, max } = thresholdRange(scores);
      Object.assign($("threshold"), { min: String(min), max: String(max) });
      $("threshold").value = String(onScreen.threshold);
    }
    // Before framing, so the threshold bar has its legend and final height.
    render();
    if (isNewQuery) {
      // Glide to the whole search area's circles, not just the shown ones, so circles the
      // slider reveals land inside the view; clear of the threshold bar.
      const bounds = L.latLngBounds([]);
      for (const code of query.searchArea) bounds.extend(circles.get(code).getLatLng().toBounds(circles.get(code).getRadius() * 2));
      const framing = { paddingTopLeft: [32, 32], paddingBottomRight: [32, document.querySelector(".map-bar").offsetHeight + 24], maxZoom: 13 };
      if (reducedMotion()) map.fitBounds(bounds, { ...framing, animate: false });
      else map.flyToBounds(bounds, { ...framing, duration: 1.5 });
    }
    $("results-heading").focus();
    return true;
  };
}
