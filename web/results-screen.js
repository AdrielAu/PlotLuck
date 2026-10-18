// The results screen: a Leaflet map, the shortlist size and the ranked list for one confirmed query.
// Districts show their rank and driver summary, never their score.
import { driverExplainer, summaryLines } from "./drivers.js";
import { scoreDistricts } from "./scoring.js";
import { circleLabel, DEFAULT_SHORTLIST, inSearchArea, readAnswers, shortlist } from "./results.js";

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
  const radii = new Map(bundle.districts.map((d) => [d.postcode_district, Number(d.radius_km) * 1000]));
  let map = null;
  // Each district's shape: its estimated outline, or a circle when it has none
  // (a business-only or retired district, or a bundle from before outlines).
  let shapes = null;
  // The query on screen. A re-confirmed identical query keeps a chosen shortlist size; a new one resets it.
  let onScreen = null;
  // The shown districts' tooltip content by code, worked out when a tooltip first opens.
  let tooltips = new Map();
  // The shown districts' list buttons by code, and the district highlighted on both map and list.
  let rows = new Map();
  let highlighted = null;
  let ring = null;

  // A district's outline or circle, styled by `style`.
  function shapeOf(code, style) {
    const rings = bundle.outlines.get(code);
    return rings ? L.polygon(rings, style) : L.circle(centroids.get(code), { radius: radii.get(code), ...style });
  }

  // The box a district's shape fills; it works before the shape is on the map.
  function boundsOf(code) {
    return bundle.outlines.has(code) ? shapes.get(code).getBounds() : L.latLng(centroids.get(code)).toBounds(radii.get(code) * 2);
  }

  // Highlight one district's shape and list row, or none (`null`). The ring is a separate
  // layer on top, so the shapes keep their best-rank-on-top order.
  function highlight(code) {
    // A tooltip a row click opened stays up until closed here.
    if (highlighted !== code) shapes.get(highlighted)?.closeTooltip();
    rows.get(highlighted)?.classList.remove("is-highlighted");
    ring?.remove();
    highlighted = code;
    if (!code) return;
    ring = shapeOf(code, { color: "#2f3437", weight: 3, fill: false, interactive: false }).addTo(map);
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
    // Circles are sized in metres, not pixels, so they keep their ground size at every zoom.
    shapes = new Map(
      bundle.districts.map((d) => {
        const code = d.postcode_district;
        const shape = shapeOf(code, { color: "#2f3437", weight: 1, fillOpacity: 0.5 })
          .bindTooltip("", { direction: "top" })
          .on("mouseover", () => highlight(code))
          .on("mouseout", () => highlight(null));
        return [code, shape];
      }),
    );
  }

  // A district's driver summary lines, worked out once per query on first use.
  function linesOf(rank) {
    return summaryLines(onScreen.explain(rank));
  }

  // The tooltip for a shown district: its rank heading, then its driver summary.
  function tooltipOf(district, total) {
    const code = district.postcode_district;
    if (!tooltips.has(code)) {
      const box = document.createElement("div");
      box.className = "driver-summary";
      const heading = document.createElement("strong");
      heading.textContent = circleLabel(district, total);
      box.append(heading, ...linesOf(district.rank).map((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        return p;
      }));
      tooltips.set(code, box);
    }
    return tooltips.get(code);
  }

  function render() {
    const { scores, size } = onScreen;
    for (const input of document.querySelectorAll('input[name="shortlist-size"]')) input.checked = Number(input.value) === size;
    const { shown, countLine } = shortlist(scores, size);
    const total = scores.length;
    const shownByCode = new Map(shown.map((d) => [d.postcode_district, d]));
    for (const [code, shape] of shapes) {
      if (!shownByCode.has(code)) shape.remove();
    }
    // Worst rank first, so each better-ranked shape is drawn over those before it.
    for (const district of shown.toReversed()) {
      shapes.get(district.postcode_district)
        .setStyle({ fillColor: district.colour })
        // A function, so a summary is only worked out when its tooltip opens.
        .setTooltipContent(() => tooltipOf(district, total))
        .addTo(map)
        .bringToFront();
    }
    const last = shown.length;
    $("legend").hidden = last < 2;
    $("legend-low").textContent = `#${last}`;
    $("legend").setAttribute("aria-label", `Rank colours: red is rank 1, blue is rank ${last}`);
    $("count").textContent = countLine;
    rows = new Map();
    $("ranked").replaceChildren(
      ...shown.map((district) => {
        const { rank, postcode_district } = district;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Rank ${rank}: ${postcode_district}. Show on map.`);
        const parts = [["district-rank", String(rank)], ["district-code", postcode_district]];
        button.append(...parts.map(([className, text]) => {
          const span = document.createElement("span");
          span.className = className;
          span.textContent = text;
          return span;
        }));
        // Read out after the label; filled on focus, so summaries are worked out only when needed.
        const description = document.createElement("span");
        description.className = "visually-hidden";
        description.id = `drivers-${postcode_district}`;
        button.append(description);
        button.setAttribute("aria-describedby", description.id);
        button.addEventListener("focus", () => {
          description.textContent = linesOf(rank).join(" ");
          highlight(postcode_district);
          shapes.get(postcode_district).openTooltip();
        });
        button.addEventListener("click", () => {
          // Zoom in until the district fills about a third of the view (a small one is under a
          // pixel at England's zoom), never out, and no closer than street level. Centre on the
          // postcodes' centroid, which lies inside the district even when its outline is a ring.
          const fit = map.getBoundsZoom(boundsOf(postcode_district).pad(1));
          map.flyTo(centroids.get(postcode_district), Math.max(map.getZoom(), Math.min(fit, 13)), { animate: !reducedMotion(), duration: 1 });
          highlight(postcode_district);
          shapes.get(postcode_district).openTooltip();
        });
        rows.set(postcode_district, button);
        const item = document.createElement("li");
        item.append(button);
        return item;
      }),
    );
    // Keep a highlight across shortlist changes while its district is still shown.
    highlight(shownByCode.has(highlighted) ? highlighted : null);
  }

  $("shortlist-size").addEventListener("change", (event) => {
    onScreen.size = Number(event.target.value);
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
      // Scores and ranks change only with the query; the shortlist size just trims them.
      const scores = inSearchArea(scoreDistricts(bundle, query.profile), query);
      const { ranked } = shortlist(scores, Infinity);
      onScreen = { key, scores, size: DEFAULT_SHORTLIST, explain: driverExplainer(bundle, query.profile, ranked) };
      tooltips = new Map();
    }
    // Before framing, so the map bar has its legend and final height.
    render();
    if (isNewQuery) {
      // Glide to the whole search area's shapes, not just the shown ones, so shapes a
      // larger shortlist reveals land inside the view; clear of the map bar.
      const bounds = L.latLngBounds([]);
      for (const code of query.searchArea) bounds.extend(boundsOf(code));
      const framing = { paddingTopLeft: [32, 32], paddingBottomRight: [32, document.querySelector(".map-bar").offsetHeight + 24], maxZoom: 13 };
      if (reducedMotion()) map.fitBounds(bounds, { ...framing, animate: false });
      else map.flyToBounds(bounds, { ...framing, duration: 1.5 });
    }
    $("results-heading").focus();
    return true;
  };
}
