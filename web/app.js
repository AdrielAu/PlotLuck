// Questions, then district results: score colours, threshold and an accessible shortlist.
import { setUpCombobox } from "./combobox.js";
import { makeInterpreter, RENT_BANDS, RENT_LABELS } from "./interpret.js";
import { defaultProfile, matchCuisines, traitLabel, valueLabel } from "./pickers.js";
import { setUpQuestions } from "./questions.js";
import { loadBundle, rankDistricts, scoreDistricts } from "./scoring.js";

const $ = (id) => document.getElementById(id);

// The kitchen is decorative: without Three.js or WebGL the page keeps its flat background.
const kitchen = import("./kitchen.js").then((m) => m.startKitchen($("kitchen"))).catch(() => {
  $("kitchen").dataset.kitchen = "off";
  return null;
});

function showError(error) {
  $("loading").hidden = true;
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
      groups.push(groupOf(traitLabel(t.name), t.values.map((v) => choiceInput("radio", t.name, v, valueLabel(v), v === t.default))));
    } else if (t.kind === "on_off") {
      flags.push(choiceInput("checkbox", t.name, true, traitLabel(t.name), t.default === true));
    } else {
      throw new Error(`vocabulary.json trait ${t.name} has an unknown kind ${t.kind}`);
    }
  }
  if (flags.length) groups.push(groupOf("Also offers", flags));
  $("trait-pickers").replaceChildren(...groups);
}

// The cuisine combobox. `onPick(cuisine)` runs with the chosen cuisine, or undefined for unmatched text.
function setUpCuisinePicker(cuisines, onPick) {
  const input = $("cuisine");
  let picked = null;

  function choose(cuisine) {
    picked = cuisine;
    input.value = cuisine?.label ?? "";
    onPick(cuisine?.cuisine);
  }

  setUpCombobox({
    input,
    list: $("cuisine-options"),
    status: $("cuisine-status"),
    search: (text) => matchCuisines(cuisines, text === picked?.label ? "" : text),
    count: (n, text) => (n ? `${n} ${n === 1 ? "cuisine matches" : "cuisines match"}` : `No cuisine matches “${text}”. Try fewer letters.`),
    onPick: choose,
  });
  input.addEventListener("input", () => onPick(input.value === picked?.label ? picked.cuisine : undefined));
  // Escape restores the last selection; unmatched text otherwise stays visible for correction.
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") choose(picked); });
  return { set: (cuisine) => choose(cuisines.find((c) => c.cuisine === cuisine) ?? null) };
}

function showScreen(name) {
  $("questions-screen").hidden = name !== "questions";
  $("results-screen").hidden = name !== "results";
  $("kitchen").hidden = name !== "questions";
  kitchen.then((k) => k?.update());
  window.scrollTo(0, 0);
}

async function main() {
  const bundle = await loadBundle(readModelFile);
  const interpreter = makeInterpreter(bundle);
  buildTraitPickers(bundle.vocabulary.traits);
  if (interpreter.hasRent) {
    $("rent-picker").replaceChildren(groupOf("Rent band", RENT_BANDS.map((b) => choiceInput("radio", "rent_band", b, RENT_LABELS[b], b === "any"))));
  }
  const traitKinds = new Map(bundle.vocabulary.traits.map((t) => [t.name, t.kind]));
  // The results panel's draft: the profile, the rent band, and the read-only search area.
  let draft = defaultProfile(bundle.vocabulary, undefined);
  let rentBand = "any";
  let area = null;
  let confirmedQuery = null;
  let rescore = null;

  // The map is built on the first confirmation, once its container is visible.
  function showResults() {
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

    // Scores change only with the confirmed query; the slider just filters them.
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
      $("scope-empty").hidden = scores.length > 0;
      $("empty").hidden = ranked.length > 0 || scores.length === 0;
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

    return (nextScores) => {
      scores = nextScores;
      map.invalidateSize();
      // Frame the whole search area, so circles revealed by the slider are in view.
      const inScope = scores.map((s) => circles.get(s.postcode_district));
      if (inScope.length) map.fitBounds(L.featureGroup(inScope).getBounds(), { padding: [20, 20], maxZoom: 13 });
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

  function updateDraft() {
    const pending = !confirmedQuery || rentBand !== confirmedQuery.rentBand ||
      Object.keys(draft).some((name) => draft[name] !== confirmedQuery.profile[name]);
    const where = area?.label ?? "England";
    let message = `Review your choices, then compare districts in ${where}.`;
    if (confirmedQuery) {
      message = pending
        ? `Edits are not applied. Results still show your last confirmed restaurant in ${confirmedQuery.area.label}.`
        : `Results match your confirmed restaurant in ${confirmedQuery.area.label}.`;
    }
    $("profile-status").textContent = message;
    $("profile-error").hidden = true;
    $("cuisine").removeAttribute("aria-invalid");
  }

  function confirm() {
    let message = "";
    if (!bundle.vocabulary.cuisines.some((c) => c.cuisine === draft.cuisine)) {
      message = "Choose a cuisine from the list before comparing districts.";
      $("cuisine").setAttribute("aria-invalid", "true");
    } else if (bundle.vocabulary.traits.some((t) => t.kind === "on_off" ? typeof draft[t.name] !== "boolean" : !t.values.includes(draft[t.name]))) {
      message = "Choose a supported value for every trait before comparing districts.";
    } else if (!area || !RENT_BANDS.includes(rentBand)) {
      message = "Choose a search area and rent band before comparing districts.";
    }
    if (message) {
      $("profile-error").textContent = message;
      $("profile-error").hidden = false;
      if ($("cuisine").getAttribute("aria-invalid") === "true") $("cuisine").focus();
      return;
    }
    try {
      const query = { profile: { ...draft }, area, rentBand };
      // The search area and rent band filter districts; they are not NN1 inputs.
      const scope = interpreter.districtsInScope(area, rentBand);
      const scores = scoreDistricts(bundle, query.profile).filter((s) => scope.has(s.postcode_district));
      rescore ??= showResults();
      rescore(scores);
      confirmedQuery = query;
      const cuisine = bundle.vocabulary.cuisines.find((c) => c.cuisine === query.profile.cuisine);
      const traits = bundle.vocabulary.traits.map((t) => {
        let value = query.profile[t.name];
        value = typeof value === "boolean" ? (value ? "Yes" : "No") : valueLabel(value);
        return `${traitLabel(t.name)}: ${value}`;
      });
      if (interpreter.hasRent) traits.push(`Rent band: ${RENT_LABELS[rentBand]}`);
      $("confirmed-area").textContent = area.label;
      $("confirmed-profile").textContent = `${cuisine.label} · ${area.label}. ${traits.join("; ")}.`;
      updateDraft();
    } catch (error) {
      showError(error);
    }
  }

  $("compare").addEventListener("click", confirm);

  const cuisinePicker = setUpCuisinePicker(bundle.vocabulary.cuisines, (cuisine) => {
    draft = { ...draft, cuisine };
    updateDraft();
  });
  $("trait-pickers").addEventListener("change", (event) => {
    const { name, value, checked } = event.target;
    if (!traitKinds.has(name)) return;
    // Traits set before a cuisine is picked still count once one is.
    draft[name] = traitKinds.get(name) === "on_off" ? checked : value;
    updateDraft();
  });
  $("rent-picker").addEventListener("change", (event) => {
    rentBand = event.target.value;
    updateDraft();
  });

  // The review card's Compare districts: prefill the results panel, then confirm it.
  function compareDraft(next) {
    draft = { ...next.profile };
    rentBand = next.rentBand;
    area = next.area;
    cuisinePicker.set(draft.cuisine);
    for (const input of $("profile-controls").querySelectorAll("input[name]")) {
      const value = input.name === "rent_band" ? rentBand : draft[input.name];
      input.checked = input.type === "checkbox" ? value === true : input.value === value;
    }
    $("area-label").textContent = area.label;
    showScreen("results");
    confirm();
  }

  const questions = setUpQuestions({
    bundle,
    interpreter,
    serveDish: () => kitchen.then((k) => k?.serve()),
    onCompare: compareDraft,
  });
  $("change-answers").addEventListener("click", () => { showScreen("questions"); questions.open(); });
  $("change-area").addEventListener("click", () => { showScreen("questions"); questions.open("location"); });
  $("model-download").addEventListener("click", () => {
    // shortcut: no on-device model yet; #136 connects NN2's explicit download (size, progress, cancel) here.
    $("model-status").textContent = "The on-device model is not available yet, so Plotluck's built-in reader reads your answers.";
  });

  $("loading").hidden = true;
  $("profile-controls").disabled = false;
  updateDraft();
}

main().catch(showError);
