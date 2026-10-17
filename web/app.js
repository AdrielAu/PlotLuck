// The questions screen: restaurant pickers whose confirmed answers open the results screen.
import { defaultProfile, matchCuisines } from "./pickers.js";
import { setUpResultsScreen } from "./results-screen.js";
import { loadBundle } from "./scoring.js";

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
const VALUE_LABELS = { unknown: "Unknown" };
const traitLabel = (name) => TRAIT_LABELS[name] ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

function showError(error) {
  $("questions-screen").hidden = false;
  $("results-screen").hidden = true;
  $("answers-error").hidden = true;
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

  // Escape restores the last selection; unmatched text otherwise stays visible for correction.
  function restore() {
    close();
    input.value = picked?.label ?? "";
    onPick(picked?.cuisine);
  }

  function pick(cuisine) {
    picked = cuisine;
    input.value = cuisine.label;
    close();
    onPick(cuisine.cuisine);
  }

  // No open on focus: tabbing through should not announce the whole list.
  input.addEventListener("input", () => {
    open();
    onPick(input.value === picked?.label ? picked.cuisine : undefined);
  });
  input.addEventListener("click", () => { if (list.hidden) open(); });
  input.addEventListener("blur", close);
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

  $("compare").addEventListener("click", () => {
    let message = "";
    if (!bundle.vocabulary.cuisines.some((c) => c.cuisine === draft.cuisine)) {
      message = "Choose a cuisine from the list before comparing districts.";
      $("cuisine").setAttribute("aria-invalid", "true");
    } else if (bundle.vocabulary.traits.some((t) => t.kind === "on_off" ? typeof draft[t.name] !== "boolean" : !t.values.includes(draft[t.name]))) {
      message = "Choose a supported value for every trait before comparing districts.";
    }
    if (message) {
      $("profile-error").textContent = message;
      $("profile-error").hidden = false;
      if ($("cuisine").getAttribute("aria-invalid") === "true") $("cuisine").focus();
      return;
    }
    try {
      // The pickers only offer England; a search area comes with NN2 (#110).
      openResults({ profile: { ...draft }, searchArea: [] });
      confirmed = { ...draft };
      $("pick-prompt").hidden = true;
      updateDraft();
    } catch (error) {
      showError(error);
    }
  });

  setUpCuisinePicker(bundle.vocabulary.cuisines, (cuisine) => {
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

  $("loading").hidden = true;
  $("pick-prompt").hidden = false;
  $("profile-controls").disabled = false;
  updateDraft();
}

main().catch(showError);
