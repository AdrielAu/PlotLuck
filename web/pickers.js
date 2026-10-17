// Picker logic read from the bundle vocabulary. Pure: no DOM, so it runs in Node tests.

// The profile for a picked cuisine: every shipped trait at its vocabulary default.
export function defaultProfile(vocabulary, cuisine) {
  return { cuisine, ...Object.fromEntries(vocabulary.traits.map((t) => [t.name, t.default])) };
}

// Cuisines whose name contains `query`, ignoring case, in vocabulary order.
export function matchCuisines(cuisines, query) {
  const needle = query.trim().toLowerCase();
  return cuisines.filter((c) => c.cuisine.toLowerCase().includes(needle));
}
