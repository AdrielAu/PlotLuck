// The questions screen: restaurant pickers whose confirmed answers open the results screen.
import { defaultProfile, matchCuisines } from "./pickers.js";
import { setUpResultsScreen, showScreen } from "./results-screen.js";
import { loadBundle } from "./scoring.js";

const $ = (id) => document.getElementById(id);

// The kitchen is decorative: without Three.js or WebGL the page keeps its flat background.
const kitchen = import("./kitchen.js").then((m) => m.startKitchen($("kitchen"))).catch(() => {
  $("kitchen").dataset.kitchen = "off";
  return null;
});

function showError(error) {
  showScreen("questions-screen");
  $("loading").hidden = true;
  $("pick-prompt").hidden = true;
  $("profile-controls").disabled = true;
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
  let confirmed = null;

  function describeProfile(profile, searchAreaName) {
    const cuisine = bundle.vocabulary.cuisines.find((c) => c.cuisine === profile.cuisine);
    const traits = bundle.vocabulary.traits.map((t) => {
      let value = profile[t.name];
      if (typeof value === "boolean") value = value ? "Yes" : "No";
      else value = VALUE_LABELS[value] ?? value;
      return `${traitLabel(t.name)}: ${value}`;
    });
    return { heading: `${cuisine.label} · ${searchAreaName}`, summary: `${traits.join("; ")}.` };
  }

  const openResults = setUpResultsScreen(bundle, {
    describeProfile,
    onChangeAnswers: () => {
      updateDraft();
      $("cuisine").focus();
    },
  });

  function updateDraft() {
    const pending = !confirmed || Object.keys(draft).some((name) => draft[name] !== confirmed[name]);
    let message = "Review your choices, then compare districts across England.";
    if (confirmed) {
      message = pending
        ? "Your results show your last confirmed answers. Select Compare districts to update them."
        : "These answers match your results. Select Compare districts to see them again.";
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
      // shortcut: the pickers only offer England, upgrade when NN2 proposes a search area (#110).
      if (!openResults({ profile: { ...draft }, searchArea: [] })) return;
      confirmed = { ...draft };
      $("pick-prompt").hidden = true;
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
    serveDish: (places) => kitchen.then((k) => k?.serve(places)),
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
