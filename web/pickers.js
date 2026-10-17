// Picker logic read from the bundle vocabulary. Pure: no DOM, so it runs in Node tests.

// Display wording for vocabulary names and values. Anything not listed shows its
// own name, so a trait added to the vocabulary still gets a picker.
export const TRAIT_LABELS = {
  venue_type: "Venue type",
  price_band: "Price band",
  chain: "Part of a chain",
  vegetarian_friendly: "Vegetarian friendly",
  vegan_options: "Vegan options",
  gluten_free: "Gluten free",
};
export const VALUE_LABELS = { $: "Budget ($)", $$: "Mid-range ($$)", $$$: "High-end ($$$)", unknown: "Not sure" };
export const traitLabel = (name) => TRAIT_LABELS[name] ?? name.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const valueLabel = (value) => VALUE_LABELS[value] ?? value;

// The profile for a picked cuisine: every shipped trait at its vocabulary default.
export function defaultProfile(vocabulary, cuisine) {
  return { cuisine, ...Object.fromEntries(vocabulary.traits.map((t) => [t.name, t.default])) };
}

// Cuisines whose name contains `query`, ignoring case, in vocabulary order.
export function matchCuisines(cuisines, query) {
  const needle = query.trim().toLowerCase();
  return cuisines.filter((c) => c.cuisine.toLowerCase().includes(needle));
}
