// Questions, then the results screen for the confirmed draft, which keeps the cuisine-and-trait pickers.
import { setUpCombobox } from "./combobox.js";
import { makeInterpreter, RENT_BANDS, RENT_LABELS } from "./interpret.js";
import { defaultProfile, matchCuisines, traitLabel, valueLabel } from "./pickers.js";
import { setUpQuestions } from "./questions.js";
import { setUpResultsScreen, showScreen } from "./results-screen.js";
import { loadBundle } from "./scoring.js";
import { setUpDescription, areaDistricts } from "./description-controls.js";

const $ = (id) => document.getElementById(id);

// The kitchen is decorative: without Three.js or WebGL the page keeps its flat background.
const kitchen = import("./kitchen.js").then((m) => m.startKitchen($("kitchen"))).catch(() => {
  $("kitchen").dataset.kitchen = "off";
  return null;
});

function showError(error) {
  showQuestions();
  $("loading").hidden = true;
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

// results-screen.js swaps the screens; the kitchen runs only behind the questions.
function syncKitchen() {
  $("kitchen").hidden = $("questions-screen").hidden;
  kitchen.then((k) => k?.update());
  window.scrollTo(0, 0);
}

function showQuestions() {
  showScreen("questions-screen");
  syncKitchen();
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
  let questions = null;
  let descriptionControls;
  let applyingInterpretation = false;
  let interpreting = false;
  let catalogueArea;
  let rentBudget = null;

  function describeProfile(profile, searchAreaName) {
    const cuisine = bundle.vocabulary.cuisines.find((c) => c.cuisine === profile.cuisine);
    const traits = bundle.vocabulary.traits.map((t) => {
      let value = profile[t.name];
      value = typeof value === "boolean" ? (value ? "Yes" : "No") : valueLabel(value);
      return `${traitLabel(t.name)}: ${value}`;
    });
    if (interpreter.hasRent) traits.push(`Rent band: ${RENT_LABELS[rentBand]}`);
    if (rentBudget) traits.push(`Rent budget: £${rentBudget.annualGBP.toLocaleString('en-GB')}/year (not used in scoring)`);
    return { heading: `${cuisine.label} · ${searchAreaName}`, summary: `${traits.join("; ")}.` };
  }

  const openResults = setUpResultsScreen(bundle, {
    describeProfile,
    onChangeAnswers: () => {
      descriptionControls?.manualEdit('search area');
      syncKitchen();
      questions.open();
    },
  });

  function updateDraft() {
    const pending = !confirmedQuery || rentBand !== confirmedQuery.rentBand ||
      Object.keys(draft).some((name) => draft[name] !== confirmedQuery.profile[name]) ||
      JSON.stringify(area) !== JSON.stringify(confirmedQuery.area) ||
      JSON.stringify(catalogueArea) !== JSON.stringify(confirmedQuery.catalogueArea) ||
      JSON.stringify(rentBudget) !== JSON.stringify(confirmedQuery.rentBudget);
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

  // Why the draft cannot be compared, or "" when it can. `scope` is its districts.
  function problemWith(scope) {
    if (!bundle.vocabulary.cuisines.some((c) => c.cuisine === draft.cuisine)) return "Choose a cuisine from the list before comparing districts.";
    if (bundle.vocabulary.traits.some((t) => t.kind === "on_off" ? typeof draft[t.name] !== "boolean" : !t.values.includes(draft[t.name]))) {
      return "Choose a supported value for every trait before comparing districts.";
    }
    if (!area) return "Choose a valid search area and positive radius before comparing districts.";
    if (rentBudget && (!Number.isFinite(rentBudget.annualGBP) || rentBudget.amount <= 0)) return "Enter a positive rent budget and its period, or clear it.";
    if (!RENT_BANDS.includes(rentBand)) return "Confirm a rent band alongside your total rent budget before comparing districts.";
    if (!scope.size) return "No district in this search area falls in this rent band. Change the rent band or the search area.";
    return "";
  }

  // Opens results for the draft, or returns why it cannot.
  function confirm() {
    if (interpreting) return "Wait for interpretation or cancel it before comparing districts.";
    // The search area and rent band filter districts; they are not NN1 inputs.
    let scope = new Set();
    if (area && RENT_BANDS.includes(rentBand)) {
      if (catalogueArea === undefined) scope = interpreter.districtsInScope(area, rentBand);
      else if (catalogueArea) {
        const codes = areaDistricts(catalogueArea,bundle.districts);
        const rents = interpreter.districtsInScope({kind:'england'},rentBand);
        scope = new Set([...rents].filter(code=>!codes || codes.has(code)));
      }
    }
    const message = problemWith(scope);
    if (message) return message;
    try {
      const query = { profile: { ...draft }, area, rentBand, rentBudget, catalogueArea };
      const opened = openResults({ profile: query.profile, searchArea: [...scope], searchAreaName: area.label });
      syncKitchen();
      if (!opened) return "";
      confirmedQuery = query;
      updateDraft();
    } catch (error) {
      showError(error);
    }
    return "";
  }

  $("compare").addEventListener("click", () => {
    const message = confirm();
    if (!message) return;
    $("profile-error").textContent = message;
    $("profile-error").hidden = false;
    if (message.startsWith("Choose a cuisine")) {
      $("cuisine").setAttribute("aria-invalid", "true");
      $("cuisine").focus();
    }
  });

  const cuisinePicker = setUpCuisinePicker(bundle.vocabulary.cuisines, (cuisine) => {
    if (!applyingInterpretation) descriptionControls?.manualEdit('cuisine');
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
    descriptionControls?.manualEdit('rent budget');
    descriptionControls?.setRentBand(rentBand);
    updateDraft();
  });

  // The review card's Compare districts: prefill the results panel, then confirm it.
  // Returns why the draft cannot be compared, for the review card to show.
  function compareDraft(next) {
    descriptionControls?.manualEdit('cuisine');
    draft = { ...next.profile };
    rentBand = next.rentBand;
    area = next.area;
    catalogueArea = undefined;
    descriptionControls?.setRentBand(rentBand);
    cuisinePicker.set(draft.cuisine);
    for (const input of $("profile-controls").querySelectorAll("input[name]")) {
      const value = input.name === "rent_band" ? rentBand : draft[input.name];
      input.checked = input.type === "checkbox" ? value === true : input.value === value;
    }
    $("area-label").textContent = area.label;
    return confirm();
  }

  descriptionControls = setUpDescription({vocabulary:bundle.vocabulary,
    onDraft:interpretation=>{
      draft={...draft,...Object.fromEntries(['cuisine','venue_type','price_band'].map(name=>[name,interpretation.profile[name]]))};
      applyingInterpretation=true;cuisinePicker.set(draft.cuisine);applyingInterpretation=false;
      for (const input of $("trait-pickers").querySelectorAll('input')) input.checked=input.type==='checkbox' ? draft[input.name] : input.value===draft[input.name];
      updateDraft();
    },
    onArea:selected=>{
      catalogueArea=selected;
      area=selected ? {kind:'catalogue',code:'',label:selected.label} : null;
      $("area-label").textContent=area?.label ?? 'choose a place';updateDraft();
    },
    onBusy:value=>{interpreting=value;$("compare").disabled=value;},
    onRent:(budget,band)=>{
      rentBudget=budget;rentBand=band;
      for (const input of $("rent-picker").querySelectorAll('input')) input.checked=input.value===band;
      updateDraft();
    },
  });

  questions = setUpQuestions({
    bundle,
    interpreter,
    serveDish: (places) => kitchen.then((k) => k?.serve(places)),
    onCompare: compareDraft,
  });
  $("change-area").addEventListener("click", () => {
    descriptionControls?.manualEdit('search area');
    showQuestions();questions.open("location");
  });
  $("model-download").addEventListener("click", () => {
    // shortcut: no on-device model yet; #136 connects NN2's explicit download (size, progress, cancel) here.
    $("model-status").textContent = "The on-device model is not available yet, so Plotluck's built-in reader reads your answers.";
  });

  $("loading").hidden = true;
  $("profile-controls").disabled = false;
  updateDraft();
}

main().catch(showError);
