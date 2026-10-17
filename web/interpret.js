// The questions screen's one path from answers to a draft: interpret(answers) -> draft.
// NN2 reads the answers when it is loaded; otherwise, or if it fails, a deterministic fallback does.
// Pure: no DOM, so it runs in Node tests.
import { RENT_BANDS } from "./interpreter.js";
import { defaultProfile, matchCuisines, traitLabel, valueLabel } from "./pickers.js";

export { RENT_BANDS };

// The six answers, in question order, with the labels of the joined description.
export const ANSWER_LABELS = {
  location: "Location",
  food: "Food",
  place: "Kind of place",
  prices: "Menu prices",
  rent: "Rent",
  other: "Other",
};
export const RENT_LABELS = { low: "Low", mid: "Mid", high: "High", any: "Any" };
export const REQUIRED = "You must answer this question.";
export const PLACE_SOON = "Place names arrive soon. For now, enter a postcode like LS1, or 'anywhere'.";

// The six answers joined into one labelled description: NN2's input.
export function describe(answers) {
  return Object.entries(ANSWER_LABELS).map(([key, label]) => `${label}: ${answers[key] ?? ""}`).join("\n");
}

// shortcut: hand-kept English cue words, so the fallback can propose values it was not
// told outright. Only browsers without NN2 rely on them; extend a list when a test needs it.
const VALUE_CUES = {
  venue_type: {
    Restaurant: ["bistro", "brasserie", "diner", "dining", "eatery", "trattoria"],
    "Pub and bar": ["gastropub", "tavern", "inn", "taproom"],
    "Café": ["coffee", "bakery", "tea", "brunch", "tearoom"],
    "Fast food and street food": ["takeaway", "takeout", "kiosk", "van", "truck", "stall"],
  },
  price_band: {
    $: ["cheap", "low", "affordable", "inexpensive", "student"],
    $$: ["moderate", "medium", "average", "reasonable", "middle"],
    $$$: ["expensive", "premium", "upmarket", "luxury", "fine", "pricey"],
    unknown: ["unknown", "unsure", "don t know"],
  },
  rent_band: {
    low: ["cheap", "budget", "small", "affordable", "lowest", "tight"],
    mid: ["medium", "moderate", "average", "middle", "reasonable"],
    high: ["expensive", "prime", "premium", "top", "highest"],
    any: ["anything", "whatever", "don t mind", "doesn t matter", "no preference", "flexible"],
  },
};
const TRAIT_CUES = {
  chain: ["chain", "franchise"],
  vegetarian_friendly: ["vegetarian", "veggie"],
  vegan_options: ["vegan", "plant based"],
  gluten_free: ["gluten", "coeliac", "celiac"],
};
// Words that carry no detail of their own, so their absence leaves nothing unused.
const FILLER = new Set("a an and the of with some our my food foods cuisine dishes dish style place restaurant serve serving".split(" "));
const NEGATORS = new Set("no not never without non isn isnt don dont won nothing".split(" "));
const ENGLAND = new Set(["anywhere", "everywhere", "england"]);
const ENGLAND_FILLER = new Set("all of in the whole".split(" "));
const NOTHING = new Set(["", "none", "nothing", "no", "nope", "n a", "nothing else"]);

const norm = (text) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();
const words = (text) => norm(text).split(" ").filter(Boolean);

// Where `phrase` first occurs as whole words in normalised `text`, not after a negator; -1 if never.
function findPhrase(text, phrase) {
  const ws = text.split(" ");
  const ps = phrase.split(" ");
  for (let i = 0; i + ps.length <= ws.length; i++) {
    if (ps.every((p, j) => ws[i + j] === p) && !ws.slice(Math.max(0, i - 2), i).some((w) => NEGATORS.has(w))) return i;
  }
  return -1;
}

// Words of `text` left once `phrase` and filler are removed.
function leftover(text, phrase) {
  const ws = text.split(" ");
  const at = findPhrase(text, phrase);
  if (at >= 0) ws.splice(at, phrase.split(" ").length);
  return ws.filter((w) => !FILLER.has(w));
}

// `nn2`, when given: { ready() -> boolean, read(description) -> Promise of a validated NN2 draft }.
export function makeInterpreter(bundle, nn2) {
  const { vocabulary } = bundle;
  const districts = new Set(bundle.districts.map((d) => d.postcode_district));
  const areas = new Set(bundle.districts.map((d) => d.postcode_district.match(/^[A-Z]+/)[0]));
  const traits = vocabulary.traits;
  const rentCuts = rentTertiles(bundle.districts);

  function readArea(text) {
    const ws = words(text);
    if (!ws.length) return null;
    if (ws.some((w) => ENGLAND.has(w)) && ws.every((w) => ENGLAND.has(w) || ENGLAND_FILLER.has(w))) return { kind: "england", code: "", label: "England" };
    const code = text.toUpperCase().replace(/\s+/g, "");
    if (districts.has(code)) return { kind: "district", code, label: code };
    if (areas.has(code)) return { kind: "postcode_area", code, label: `${code} postcode area` };
    return null;
  }

  // {value, mark, rest}: the cuisine and the words of the answer it leaves unexplained.
  function readCuisine(text) {
    const n = norm(text);
    if (!n) return null;
    const named = vocabulary.cuisines
      .filter((c) => n === norm(c.label) || findPhrase(n, norm(c.cuisine)) >= 0)
      .sort((a, b) => b.cuisine.length - a.cuisine.length)[0];
    if (named) return { value: named.cuisine, mark: "explicit", rest: n === norm(named.label) ? [] : leftover(n, norm(named.cuisine)) };
    // One partial word ("viet") that only one cuisine contains.
    const partial = n.includes(" ") || n.length < 3 ? [] : matchCuisines(vocabulary.cuisines, n);
    return partial.length === 1 ? { value: partial[0].cuisine, mark: "explicit", rest: [] } : null;
  }

  // The first value named or cued in the answer: its own words are explicit, cue words inferred.
  function readChoice(text, values, cues, label) {
    const n = norm(text);
    let best = null;
    for (const value of values) {
      const own = [norm(value), norm(label(value)), ...words(label(value)).filter((w) => w.length > 2 && !FILLER.has(w) && !NEGATORS.has(w))];
      for (const [phrases, mark] of [[own, "explicit"], [cues[value] ?? [], "inferred"]]) {
        for (const phrase of phrases) {
          const at = n === phrase ? 0 : findPhrase(n, phrase);
          if (at >= 0 && (!best || at < best.at)) best = { value, mark, at };
        }
      }
    }
    return best;
  }

  function readTraits(text, draft) {
    const unused = [];
    if (NOTHING.has(norm(text))) return unused;
    for (const clause of text.split(/[,;.\n&+/]| and | or /i).map(norm).filter(Boolean)) {
      let matched = false;
      for (const t of traits.filter((t) => t.kind === "on_off")) {
        const cues = TRAIT_CUES[t.name] ?? [norm(traitLabel(t.name))];
        const at = cues.map((cue) => ` ${clause} `.indexOf(` ${cue} `)).filter((i) => i >= 0)[0];
        if (at === undefined) continue;
        matched = true;
        // A trait clause is short, so a negator anywhere before the cue turns it off.
        draft.profile[t.name] = !clause.slice(0, at).split(" ").some((w) => NEGATORS.has(w));
        draft.marks[t.name] = "explicit";
      }
      if (!matched) unused.push(clause);
    }
    return unused;
  }

  // NN2's validated draft in the questions screen's shape. The area is read locally, never from the model.
  // shortcut: NN2's location text, distance and clarifications are unused until the place catalogue (#117/#118).
  function fromModel(reply, answers) {
    const draft = {
      profile: { ...reply.profile, cuisine: reply.profile.cuisine ?? undefined },
      marks: { area: "explicit" },
      area: readArea(answers.location ?? ""),
      rentBand: rentCuts ? reply.fields.rent_band.value : "any",
      unused: [...reply.unused],
    };
    if (!draft.area) draft.marks.area = "unresolved";
    for (const [name, f] of Object.entries(reply.fields)) draft.marks[name] = f.provenance;
    if (!draft.profile.cuisine) draft.marks.cuisine = "unresolved";
    if (!rentCuts) draft.marks.rent_band = "default";
    return draft;
  }

  async function interpret(answers) {
    if (nn2?.ready()) {
      try {
        return fromModel(await nn2.read(describe(answers)), answers);
      } catch {
        // A failed, cancelled or invalid reading leaves the answers to the fallback below.
      }
    }
    return readAnswers(answers);
  }

  function readAnswers(answers) {
    const draft = {
      profile: defaultProfile(vocabulary, undefined),
      marks: { area: "explicit", cuisine: "explicit" },
      area: readArea(answers.location ?? ""),
      rentBand: "any",
      unused: [],
    };
    const unused = (key, text) => draft.unused.push(`${ANSWER_LABELS[key]}: ${text.trim()}`);
    if (!draft.area) draft.marks.area = "unresolved";

    const cuisine = readCuisine(answers.food ?? "");
    draft.profile.cuisine = cuisine?.value;
    if (!cuisine) draft.marks.cuisine = "unresolved";
    if (!cuisine || cuisine.rest.length) unused("food", answers.food ?? "");

    const choices = [["venue_type", "place"], ["price_band", "prices"]].flatMap(([name, key]) => {
      const t = traits.find((t) => t.name === name);
      return t ? [[name, key, t.values, t.default, valueLabel]] : [];
    });
    if (rentCuts) choices.push(["rent_band", "rent", RENT_BANDS, "any", (v) => RENT_LABELS[v]]);
    else draft.marks.rent_band = "default";
    for (const [name, key, values, fallback, label] of choices) {
      const text = answers[key] ?? "";
      const read = norm(text) ? readChoice(text, values, VALUE_CUES[name] ?? {}, label) : null;
      if (norm(text) && !read) unused(key, text);
      if (name === "rent_band") draft.rentBand = read?.value ?? fallback;
      else draft.profile[name] = read?.value ?? fallback;
      draft.marks[name] = read?.mark ?? "default";
    }

    for (const t of traits.filter((t) => t.kind === "on_off")) draft.marks[t.name] = "default";
    for (const clause of readTraits(answers.other ?? "", draft)) unused("other", clause);
    return draft;
  }

  // The error a question shows for this answer, or null when it can move on.
  function check(key, text) {
    if (key === "location") return !norm(text) ? REQUIRED : readArea(text) ? null : PLACE_SOON;
    // NN2 reads food the fallback cannot ("neapolitan pizza"); the review card asks if it cannot either.
    if (key === "food") return (nn2?.ready() ? norm(text) : readCuisine(text)) ? null : REQUIRED;
    return null;
  }

  // The district codes inside the search area and rent band, in bundle order.
  function districtsInScope(area, rentBand) {
    return new Set(bundle.districts.filter((d) => {
      const code = d.postcode_district;
      const inArea = area.kind === "england" || (area.kind === "district" ? code === area.code : new RegExp(`^${area.code}\\d`).test(code));
      return inArea && (rentBand === "any" || rentBandOf(d, rentCuts) === rentBand);
    }).map((d) => d.postcode_district));
  }

  return { interpret, check, readArea, districtsInScope, hasRent: Boolean(rentCuts) };
}

// The highest rent in England's lowest and middle thirds of districts, or null with no rent values.
function rentTertiles(districts) {
  const rents = districts.map((d) => d.commercial_rent_index).filter((r) => r !== "" && r != null).map(Number).sort((a, b) => a - b);
  if (!rents.length) return null;
  return { low: rents[Math.ceil(rents.length / 3) - 1], mid: rents[Math.ceil((2 * rents.length) / 3) - 1] };
}

// A district with no rent value is in no band, so only "any" keeps it.
function rentBandOf(district, cuts) {
  const raw = district.commercial_rent_index;
  if (!cuts || raw === "" || raw == null) return null;
  const rent = Number(raw);
  return rent <= cuts.low ? "low" : rent <= cuts.mid ? "mid" : "high";
}
