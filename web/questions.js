// The questions screen: six questions one at a time in one prompt box, then a review card.
// Answers reach a draft only through interpreter.interpret, which NN2 or its fallback serves.
import { setUpCombobox } from "./combobox.js";
import { ANSWER_LABELS, AREA_HELP, RENT_BANDS, RENT_LABELS, REQUIRED } from "./interpret.js";
import { matchCuisines, traitLabel, valueLabel } from "./pickers.js";

const $ = (id) => document.getElementById(id);
const MAX_OPTIONS = 8;
const MARK_LABELS = { inferred: "Inferred", default: "Default", unresolved: "Needs a choice" };

const contains = (text, query) => text.toLowerCase().includes(query.trim().toLowerCase());
const clauses = (text) => text.split(",").map((s) => s.trim()).filter(Boolean);

// The question list, its suggestion chips and autocomplete, all read from the bundle.
function buildQuestions(bundle, interpreter) {
  const { vocabulary } = bundle;
  const trait = (name) => vocabulary.traits.find((t) => t.name === name);
  const choices = (labels) => labels.map((label) => ({ label, text: label }));
  const filtered = (options) => (text) => (text.trim() ? options.filter((o) => contains(o.label, text)).slice(0, MAX_OPTIONS) : []);

  const codes = bundle.districts.map((d) => d.postcode_district);
  const areas = [...new Set(codes.map((c) => c.match(/^[A-Z]+/)[0]))];
  const anywhere = { label: "Anywhere in England", text: "Anywhere in England" };
  // Cuisines scored as themselves, most common first by the bundle's restaurant supply.
  const supply = new Map();
  for (const [key, n] of bundle.supply) supply.set(key.split("\t")[1], (supply.get(key.split("\t")[1]) ?? 0) + n);
  const common = vocabulary.cuisines
    .filter((c) => c.cuisine === c.cuisine_group && supply.has(c.cuisine) && c.cuisine !== "Unspecified")
    .sort((a, b) => supply.get(b.cuisine) - supply.get(a.cuisine))
    .slice(0, MAX_OPTIONS);
  const flags = vocabulary.traits.filter((t) => t.kind === "on_off").map((t) => traitLabel(t.name));

  const questions = [
    {
      key: "location", text: "Where would you like to open?", chips: [anywhere],
      search(text) {
        const code = text.toUpperCase().replace(/\s+/g, "");
        if (!code) return [];
        const options = contains(anywhere.label, text) ? [anywhere] : [];
        options.push(...areas.filter((a) => a.startsWith(code)).map((a) => ({ label: `${a} postcode area`, text: a })));
        options.push(...codes.filter((c) => c.startsWith(code)).map((c) => ({ label: c, text: c })));
        options.push(...interpreter.areaCandidates(text).map(a => ({ label: a.label, text })));
        return options.slice(0, MAX_OPTIONS);
      },
    },
    {
      key: "food", text: "What food will you serve?", chips: common.map((c) => ({ label: c.cuisine, text: c.cuisine })),
      search: (text) => (text.trim() ? matchCuisines(vocabulary.cuisines, text).slice(0, MAX_OPTIONS).map((c) => ({ label: c.label, text: c.cuisine })) : []),
    },
    { key: "place", text: "What kind of place is it?", options: choices(trait("venue_type")?.values ?? []) },
    { key: "prices", text: "How are your menu prices?", options: choices((trait("price_band")?.values ?? []).map(valueLabel)) },
    { key: "rent", text: "How much rent can you take on?", options: choices(RENT_BANDS.map((b) => RENT_LABELS[b])), skip: !interpreter.hasRent },
    {
      key: "other", text: "Anything else diners should know?", chips: choices(flags), toggles: true,
      // Completes the clause after the last comma.
      search(text) {
        const last = text.split(",").at(-1);
        const taken = clauses(text).map((s) => s.toLowerCase());
        return last.trim() ? flags.filter((f) => contains(f, last) && !taken.includes(f.toLowerCase())).map((f) => ({ label: f, text: f })) : [];
      },
    },
  ].filter((q) => !q.skip);
  for (const q of questions) {
    q.required = q.key === "food";
    if (q.options) {
      q.chips = q.options;
      q.search = filtered(q.options);
    }
  }
  return questions;
}

export function setUpQuestions({ bundle, interpreter, serveDish, onCompare }) {
  const questions = buildQuestions(bundle, interpreter);
  const answers = Object.fromEntries(Object.keys(ANSWER_LABELS).map((key) => [key, ""]));
  const input = $("answer");
  const box = $("prompt");
  let index = 0;
  let draft = null;
  // True while the answers are being read, so a second submit cannot start a second reading.
  let reading = false;
  // Questions that have sent their dish; answering again sends no more.
  const served = new Set();

  const combobox = setUpCombobox({
    input,
    list: $("answer-options"),
    status: $("answer-status"),
    search: (text) => questions[index].search(text),
    count: (n) => (n ? `${n} ${n === 1 ? "suggestion" : "suggestions"}` : ""),
    onPick(option) {
      if (questions[index].toggles) {
        const kept = clauses(input.value);
        kept.splice(input.value.trim().endsWith(",") ? kept.length : -1, 1, option.text);
        input.value = kept.join(", ");
        clearError();
        syncChips();
      } else {
        // A picked suggestion answers the question, like its chip.
        input.value = option.text;
        submit();
      }
    },
  });

  function clearError() {
    $("answer-error").hidden = true;
    input.removeAttribute("aria-invalid");
  }

  function showError(message) {
    $("answer-error").textContent = message;
    $("answer-error").hidden = false;
    input.setAttribute("aria-invalid", "true");
    // Restart the shake if it is already running.
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    input.focus();
  }

  function syncChips() {
    if (!questions[index].toggles) return;
    const said = clauses(input.value).map((s) => s.toLowerCase());
    for (const chip of $("chips").children) chip.setAttribute("aria-pressed", String(said.includes(chip.textContent.toLowerCase())));
  }

  function show(i, focus = true) {
    index = i;
    const q = questions[i];
    $("review").hidden = true;
    box.hidden = false;
    $("question").textContent = q.text;
    input.value = answers[q.key];
    combobox.close();
    clearError();
    $("chips").replaceChildren(...q.chips.map((chip) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = chip.label;
      if (q.toggles) {
        button.addEventListener("click", () => {
          const kept = clauses(input.value);
          const at = kept.findIndex((s) => s.toLowerCase() === chip.text.toLowerCase());
          if (at >= 0) kept.splice(at, 1);
          else kept.push(chip.text);
          input.value = kept.join(", ");
          syncChips();
        });
      } else {
        button.addEventListener("click", () => {
          input.value = chip.text;
          submit();
        });
      }
      return button;
    }));
    syncChips();
    $("back").hidden = i === 0;
    $("progress").textContent = `Question ${i + 1} of ${questions.length}`;
    [...$("pips").children].forEach((pip, p) => { pip.className = p < i ? "done" : p === i ? "current" : ""; });
    if (focus) input.focus();
  }

  async function submit() {
    if (reading) return;
    const q = questions[index];
    const text = input.value.trim();
    const error = interpreter.check(q.key, text);
    if (error) return showError(error);
    answers[q.key] = text;
    if (!served.has(q.key)) {
      served.add(q.key);
      serveDish(questions.length);
    }
    if (index < questions.length - 1) return show(index + 1);
    reading = true;
    try {
      draft = await interpreter.interpret({ ...answers });
    } finally {
      reading = false;
    }
    showReview();
  }

  function markBadge(field) {
    const mark = MARK_LABELS[draft.marks[field]];
    if (!mark) return [];
    const badge = document.createElement("span");
    badge.className = `mark mark-${draft.marks[field]}`;
    badge.textContent = mark;
    return [badge];
  }

  // One editable chip: a label, its control and the draft's mark for that field.
  function draftChip(field, label, control, valid = () => true) {
    control.id = `draft-${field}`;
    const chip = document.createElement("div");
    chip.className = "draft-chip";
    const text = document.createElement("label");
    text.htmlFor = control.id;
    text.textContent = label;
    chip.append(text, control, ...markBadge(field));
    control.addEventListener("change", () => {
      if (!valid()) return;
      draft.marks[field] = "explicit";
      chip.querySelector(".mark")?.remove();
      $("review-error").hidden = true;
    });
    return chip;
  }

  function select(values, current, label, placeholder) {
    const el = document.createElement("select");
    if (current === undefined) el.append(new Option(placeholder, "", true, true));
    for (const v of values) el.append(new Option(label(v), v, false, v === current));
    return el;
  }

  function showReview() {
    const { vocabulary } = bundle;
    box.hidden = true;
    $("review").hidden = false;
    const chips = [];

    const area = document.createElement("input");
    area.type = "text";
    area.autocomplete = "off";
    area.value = draft.area?.kind === "place" ? answers.location : draft.area ? draft.area.code || draft.area.label : answers.location;
    const intended = document.createElement("select");
    intended.id = "draft-place";
    const choice = document.createElement("div");
    choice.className = "draft-chip";
    const choiceLabel = document.createElement("label");
    choiceLabel.htmlFor = intended.id;
    choiceLabel.textContent = "Intended place";
    const help = document.createElement("p");
    help.id = "draft-area-help";
    help.textContent = "Choose the intended boundary. Districts are included when their centres lie inside it; scores describe whole districts. An overlapping district with its centre outside is excluded.";
    intended.setAttribute("aria-describedby", help.id);
    choice.append(choiceLabel, intended, help);
    function updatePlaces() {
      const candidates = interpreter.areaCandidates(area.value);
      choice.hidden = candidates.length === 0;
      intended.replaceChildren(new Option("Choose the intended place", ""),
        ...candidates.map(a => new Option(a.label, a.code, false, a.code === draft.area?.code)));
    }
    intended.addEventListener("change", () => {
      draft.area = interpreter.areaCandidates(area.value).find(a => a.code === intended.value) ?? null;
      if (draft.area) {
        area.removeAttribute("aria-invalid");
        draft.marks.area = "explicit";
        $("draft-area").closest(".draft-chip").querySelector(".mark")?.remove();
        $("review-error").hidden = true;
      }
    });
    // Registered before the chip's own handler, so the mark only clears once the area reads.
    area.addEventListener("input", () => {
      draft.area = interpreter.readArea(area.value);
      updatePlaces();
      // Clear stale errors while typing, before a click can move the comparison button on blur.
      $("review-error").hidden = true;
      if (draft.area) {
        area.removeAttribute("aria-invalid");
        area.closest(".draft-chip").querySelector(".mark")?.remove();
        draft.marks.area = "explicit";
      }
    });
    area.addEventListener("change", () => {
      if (draft.area) area.removeAttribute("aria-invalid");
      else showAreaError();
    });
    chips.push(draftChip("area", "Search area", area, () => Boolean(draft.area)));
    updatePlaces();
    chips.push(choice);

    const cuisine = select(vocabulary.cuisines.map((c) => c.cuisine), draft.profile.cuisine,
      (v) => vocabulary.cuisines.find((c) => c.cuisine === v).label, "Choose a cuisine");
    cuisine.addEventListener("change", () => { draft.profile.cuisine = cuisine.value || undefined; });
    chips.push(draftChip("cuisine", "Food", cuisine, () => Boolean(cuisine.value)));

    for (const t of vocabulary.traits.filter((t) => t.kind === "single_choice")) {
      const el = select(t.values, draft.profile[t.name], valueLabel);
      chips.push(draftChip(t.name, traitLabel(t.name), el));
      el.addEventListener("change", () => { draft.profile[t.name] = el.value; });
    }
    if (interpreter.hasRent) {
      const el = select(RENT_BANDS, draft.rentBand, (b) => RENT_LABELS[b]);
      chips.push(draftChip("rent_band", "Rent band", el));
      el.addEventListener("change", () => { draft.rentBand = el.value; });
    }
    for (const t of vocabulary.traits.filter((t) => t.kind === "on_off")) {
      const el = document.createElement("input");
      el.type = "checkbox";
      el.checked = draft.profile[t.name] === true;
      const chip = draftChip(t.name, traitLabel(t.name), el);
      chip.classList.add("draft-flag");
      chips.push(chip);
      el.addEventListener("change", () => { draft.profile[t.name] = el.checked; });
    }
    $("draft-chips").replaceChildren(...chips);
    $("unused").hidden = draft.unused.length === 0;
    $("unused-list").replaceChildren(...draft.unused.map((detail) => Object.assign(document.createElement("li"), { textContent: detail })));
    $("review-error").hidden = true;
    if (!draft.area) area.setAttribute("aria-invalid", "true");
    $("review-heading").focus();
  }

  function showAreaError() {
    $("draft-area").setAttribute("aria-invalid", "true");
    const candidates = interpreter.areaCandidates($("draft-area").value);
    showReviewError(candidates.length ? "Choose the intended place before comparing districts." : AREA_HELP,
      candidates.length ? $("draft-place") : $("draft-area"));
  }

  function showReviewError(message, control) {
    $("review-error").textContent = message;
    $("review-error").hidden = false;
    control.focus();
  }

  box.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  box.addEventListener("animationend", () => box.classList.remove("shake"));
  input.addEventListener("input", () => {
    clearError();
    syncChips();
  });
  $("back").addEventListener("click", () => show(index - 1));
  $("review-back").addEventListener("click", () => show(0));
  $("review-compare").addEventListener("click", () => {
    if (!draft.area) return showAreaError();
    if (!bundle.vocabulary.cuisines.some((c) => c.cuisine === draft.profile.cuisine)) return showReviewError("Choose a cuisine before comparing districts.", $("draft-cuisine"));
    // onCompare returns why the draft cannot be compared, such as a rent band with no district in the area.
    const problem = onCompare(structuredClone(draft));
    if (problem) showReviewError(problem, $("draft-rent_band") ?? $("draft-area"));
  });

  $("pips").replaceChildren(...questions.map(() => document.createElement("li")));
  input.disabled = false;
  $("next").disabled = false;
  show(0, false);
  // From the results screen: back to a question with every answer kept.
  return { open: (key = "location") => show(Math.max(0, questions.findIndex((q) => q.key === key))) };
}
