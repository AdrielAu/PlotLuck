// Restaurant pickers, then district results: score colours, threshold and an accessible shortlist.
import { defaultProfile, matchCuisines } from "./pickers.js";
import { loadBundle, rankDistricts, scoreDistricts } from "./scoring.js";

const $ = (id) => document.getElementById(id);

// Display wording for vocabulary names and values. Anything not listed shows its
// own name, so a trait added to the vocabulary still gets a picker.
const TRAIT_LABELS = {
  venue_type: "Venue type",
  price_band: "Price band",
  chain: "Part of a chain",
  vegetarian_friendly: "Vegetarian friendly",
  vegan_options: "Vegan options",
  gluten_free: "Gluten free",
};
const VALUE_LABELS = { $: "$ Cheap eats", $$: "$$ Mid-range", $$$: "$$$ Fine dining", unknown: "Not decided" };
const traitLabel = (name) => TRAIT_LABELS[name] ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

function showError(error) {
  $("loading").hidden = true;
  $("pick-prompt").hidden = true;
  $("results").hidden = true;
  $("profile-controls").disabled = true;
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

function choiceInput(type, name, value, text, checked) {
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = String(value);
  input.checked = checked;
  const label = document.createElement("label");
  label.append(input, text);
  return label;
}

function groupOf(legendText, options) {
  const group = document.createElement("fieldset");
  group.className = "trait-group";
  const legend = document.createElement("legend");
  legend.textContent = legendText;
  const box = document.createElement("div");
  box.className = "trait-options";
  box.append(...options);
  group.append(legend, box);
  return group;
}

// One radio group per single-choice trait, then one group of all on/off flags.
function buildTraitPickers(traits) {
  const groups = [];
  const flags = [];
  for (const t of traits) {
    if (t.kind === "single_choice") {
      groups.push(groupOf(traitLabel(t.name), t.values.map((v) => choiceInput("radio", t.name, v, VALUE_LABELS[v] ?? v, v === t.default))));
    } else if (t.kind === "on_off") {
      flags.push(choiceInput("checkbox", t.name, true, traitLabel(t.name), t.default === true));
    } else {
      throw new Error(`vocabulary.json trait ${t.name} has an unknown kind ${t.kind}`);
    }
  }
  if (flags.length) groups.push(groupOf("Also offers", flags));
  $("trait-pickers").replaceChildren(...groups);
}

// ARIA 1.2 combobox with a listbox popup. `onPick(cuisine)` runs when a cuisine is chosen.
function setUpCuisinePicker(cuisines, onPick) {
  const input = $("cuisine");
  const list = $("cuisine-options");
  const status = $("cuisine-status");
  let matches = [];
  let active = -1;
  let picked = null;

  function setActive(index) {
    active = index;
    for (const [i, li] of [...list.children].entries()) li.setAttribute("aria-selected", String(i === active));
    if (active < 0) {
      input.removeAttribute("aria-activedescendant");
    } else {
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    }
  }

  function open() {
    matches = matchCuisines(cuisines, input.value === picked?.label ? "" : input.value);
    list.replaceChildren(
      ...matches.map((c, i) => {
        const li = document.createElement("li");
        li.id = `cuisine-option-${i}`;
        li.setAttribute("role", "option");
        li.textContent = c.label;
        // mousedown keeps focus in the input; click then picks.
        li.addEventListener("mousedown", (event) => event.preventDefault());
        li.addEventListener("click", () => pick(c));
        return li;
      }),
    );
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    status.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? "cuisine matches" : "cuisines match"}`
      : `No cuisine matches “${input.value.trim()}”. Try fewer letters.`;
    status.classList.toggle("shown", matches.length === 0);
    setActive(-1);
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    status.classList.remove("shown");
  }

  // Leaving without picking restores the last pick, so the field never shows unscored text.
  function restore() {
    close();
    input.value = picked?.label ?? "";
  }

  function pick(cuisine) {
    picked = cuisine;
    input.value = cuisine.label;
    close();
    onPick(cuisine.cuisine);
  }

  input.addEventListener("input", open);
  input.addEventListener("focus", () => { if (list.hidden) open(); });
  input.addEventListener("click", () => { if (list.hidden) open(); });
  input.addEventListener("blur", restore);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) return open();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + matches.length) % matches.length);
    } else if (event.key === "Enter" && !list.hidden && (active >= 0 || matches.length === 1)) {
      // A single match ("viet") is picked by Enter without arrowing to it.
      event.preventDefault();
      pick(matches[Math.max(active, 0)]);
    } else if (event.key === "Escape") {
      restore();
    }
  });
}

async function main() {
  const bundle = await loadBundle(readModelFile);
  buildTraitPickers(bundle.vocabulary.traits);
  const traitKinds = new Map(bundle.vocabulary.traits.map((t) => [t.name, t.kind]));
  let profile = null;
  let rescore = null;

  // The map is built on the first pick, once its container is visible.
  function showResults() {
    $("pick-prompt").hidden = true;
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

    $("threshold").addEventListener("input", () => {
      thresholdMoved = true;
      threshold = Number($("threshold").value);
      applyThreshold();
    });
    $("threshold").disabled = false;

    return () => {
      scores = scoreDistricts(bundle, profile);
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
    };
  }

  function update() {
    try {
      rescore ??= showResults();
      rescore();
    } catch (error) {
      showError(error);
    }
  }

  setUpCuisinePicker(bundle.vocabulary.cuisines, (cuisine) => {
    // The first pick starts from the vocabulary defaults; later picks keep the chosen traits.
    profile = profile ? { ...profile, cuisine } : defaultProfile(bundle.vocabulary, cuisine);
    update();
  });
  $("trait-pickers").addEventListener("change", (event) => {
    const { name, value, checked } = event.target;
    if (!traitKinds.has(name)) return;
    // Traits set before a cuisine is picked still count once one is.
    profile ??= defaultProfile(bundle.vocabulary, undefined);
    profile[name] = traitKinds.get(name) === "on_off" ? checked : value;
    if (profile.cuisine !== undefined) update();
  });

  $("loading").hidden = true;
  $("pick-prompt").hidden = false;
  $("profile-controls").disabled = false;
}

main().catch(showError);
