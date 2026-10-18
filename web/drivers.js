// Driver summaries: why a ranked district sits where it does, by the swap-one-factor test.
// Pure: no DOM or Leaflet, so it runs in Node tests and in the browser.
import { profileScorer } from "./scoring.js";

// Score changes (the score is a 0-1 percentile in bundle version 5) below NOTABLE are not
// mentioned; at STRONG or more a driver is worded "far more", "much higher" and so on.
export const NOTABLE = 0.01;
export const STRONG = 0.04;
// A search area with fewer districts than this has no meaningful typical district,
// so its districts are compared with England's.
export const MIN_AREA_DISTRICTS = 5;
const MAX_DRIVERS = 3;

// Census group key -> how a driver summary names it.
const ETHNIC_NAMES = {
  bangladeshi: "Bangladeshi", chinese: "Chinese", indian: "Indian", pakistani: "Pakistani",
  african: "African", caribbean: "Caribbean", irish: "Irish", arab: "Arab", white_british: "White British",
};

// The eight factor groups, in tie-break order. `inputs` are the NN1 district inputs each
// swaps; `words(more, strong)` names the district's value against the other district's.
// The local population mix takes every input no other group claims.
const GROUPS = [
  { key: "restaurants", inputs: ["total_restaurants"],
    words: (more, strong) => `${strong ? "Far " : ""}${more ? "more" : "fewer"} restaurants nearby` },
  { key: "residents", inputs: ["population"],
    words: (more, strong) => `${strong ? "Far " : ""}${more ? "more" : "fewer"} residents` },
  { key: "visitors", inputs: ["attractions_count", "hotels_count"],
    words: (more, strong) => `${strong ? "Far " : ""}${more ? "more" : "fewer"} hotels and attractions` },
  { key: "supply", inputs: ["same_cuisine_supply"],
    words: (more, strong, { supplyName }) => `${strong ? "Far " : ""}${more ? "more" : "fewer"} ${supplyName} already here` },
  // Named only when it raises the rank (ADR 0007's matched community, glossary).
  { key: "community", inputs: ["matched_community_share"], onlyWhenHelping: true,
    words: (more, strong, { communityName }) => `${strong ? "Much larger" : "Larger"} ${communityName}` },
  { key: "rent", inputs: ["commercial_rent_index"],
    words: (more, strong) => `${strong ? "Much " : ""}${more ? "higher" : "lower"} rent` },
  // A higher index of multiple deprivation rank means a less deprived area.
  { key: "deprivation", inputs: ["deprivation_index"],
    words: (more, strong) => `${strong ? "Much " : ""}${more ? "less" : "more"} deprived area` },
  { key: "mix", inputs: null,
    words: (more, strong, _names, helps) => helps
      ? `Local population mix suits it${strong ? " well" : ""}`
      : `Local population mix suits it ${strong ? "much " : ""}less` },
];

// `explainer(rank)` for one query: `ranked` is the whole search area, best first
// ([{postcode_district, score}], ranks from 1). The summary is
// `{ basis, drivers: [{ helps, text }], ahead }`: `basis` is "area" or "england",
// up to three notable drivers strongest first, and `ahead` the line comparing it with
// the next-ranked district (null for the last). Summaries are worked out on first use.
export function driverExplainer(bundle, profile, ranked) {
  const scorer = profileScorer(bundle, profile);
  const byCode = new Map(bundle.districts.map((d) => [d.postcode_district, d]));
  const raw = new Map();
  const rawOf = (code) => {
    if (!raw.has(code)) raw.set(code, scorer.rawInputs(byCode.get(code)).map(toNumber));
    return raw.get(code);
  };
  const basis = ranked.length >= MIN_AREA_DISTRICTS ? "area" : "england";
  // The typical district is a real one, the median-ranked, so its shares stay consistent.
  const typicalCode = basis === "area" ? medianDistrict(ranked) : medianDistrict(englandRanked(bundle, scorer));
  const typical = rawOf(typicalCode);
  const groups = groupColumns(scorer.inputs);
  const names = {
    supplyName: supplyName(bundle.groups.get(profile.cuisine)),
    communityName: communityName(bundle.communities?.get(profile.cuisine) ?? [], profile.cuisine),
  };
  const cache = new Map();

  return function explain(rank) {
    if (cache.has(rank)) return cache.get(rank);
    const district = rawOf(ranked[rank - 1].postcode_district);
    const drivers = effects(scorer, groups, district, typical)
      .filter(({ group, effect }) => Math.abs(effect) >= NOTABLE && (!group.onlyWhenHelping || effect > 0))
      .slice(0, MAX_DRIVERS)
      .map((e) => ({ helps: e.effect > 0, text: phrase(e, names) }));
    const next = ranked[rank];
    // The group that most explains the lead: swapping in the next district's values costs the most.
    const lead = next && effects(scorer, groups, district, rawOf(next.postcode_district)).find((e) => e.effect > 0);
    const ahead = !next ? null
      : lead ? `Ahead of #${rank + 1} (${next.postcode_district}) mainly on: ${lowerFirst(phrase(lead, names))}.`
      : `Ahead of #${rank + 1} (${next.postcode_district}) on the overall balance of factors.`;
    const summary = { basis, drivers, ahead };
    cache.set(rank, summary);
    return summary;
  };
}

// A summary as the lines the map and list show, such as
// ["Compared with a typical district in this area:", "↑ More restaurants nearby", "Ahead of #4 (M15) mainly on: …"].
export function summaryLines({ basis, drivers, ahead }) {
  const place = basis === "area" ? "in this area" : "in England";
  const lines = drivers.length
    ? [`Compared with a typical district ${place}:`, ...drivers.map((d) => `${d.helps ? "↑" : "↓"} ${d.text}`)]
    : [`Close to a typical district ${place} on every factor.`];
  return ahead ? [...lines, ahead] : lines;
}

// Each group's effect on `district`'s score: its score less its score with that group's
// values swapped for `other`'s. Positive means the group raises its rank. Largest first.
function effects(scorer, groups, district, other) {
  const base = scorer.score(district.map(fromNumber));
  return groups
    .map((g) => {
      const swapped = district.map((v, i) => (g.columns.includes(i) ? other[i] : v));
      const total = (row) => g.columns.reduce((sum, i) => sum + row[i], 0);
      return { group: g, effect: base - scorer.score(swapped.map(fromNumber)), more: total(district) > total(other) };
    })
    .filter((e) => e.group.columns.length)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

function phrase({ group, effect, more }, names) {
  // A multi-input group whose totals tie reads in the direction of its effect.
  return capitalise(group.words(more, Math.abs(effect) >= STRONG, names, effect > 0));
}

// Group -> the input-vector columns it swaps.
function groupColumns(inputs) {
  const claimed = new Set(GROUPS.flatMap((g) => g.inputs ?? []));
  return GROUPS.map((g) => ({
    ...g,
    columns: inputs.flatMap((name, i) => ((g.inputs ? g.inputs.includes(name) : !claimed.has(name)) ? [i] : [])),
  }));
}

// The median-ranked district's code (the better of the middle two for an even count).
function medianDistrict(ranked) {
  return ranked[Math.floor((ranked.length - 1) / 2)].postcode_district;
}

// Every bundle district for this profile, best first, ties by code.
function englandRanked(bundle, scorer) {
  return bundle.districts
    .map((d) => ({ postcode_district: d.postcode_district, score: scorer.score(scorer.rawInputs(d)) }))
    .sort((a, b) => b.score - a.score || (a.postcode_district < b.postcode_district ? -1 : 1));
}

// Raw inputs are numbers or "" when missing; NaN stands in for "" while comparing.
function toNumber(value) {
  return value === "" ? NaN : Number(value);
}

function fromNumber(value) {
  return Number.isNaN(value) ? "" : value;
}

function supplyName(group) {
  return !group || group === "Other" || group === "Unspecified" ? "similar restaurants" : `${group} restaurants`;
}

// "Indian, Pakistani and Bangladeshi community", or the cuisine's name where a matched
// group is a catch-all Census category such as "Other Asian".
function communityName(groups, cuisine) {
  if (!groups.length || !groups.every((g) => g in ETHNIC_NAMES)) return `community matched to ${cuisine} food`;
  const names = groups.map((g) => ETHNIC_NAMES[g]);
  return `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]} community`;
}

function capitalise(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function lowerFirst(text) {
  return text[0].toLowerCase() + text.slice(1);
}
