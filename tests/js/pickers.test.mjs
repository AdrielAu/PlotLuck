// Picker logic for #75: cuisine search and the starting profile, both read from the vocabulary.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { defaultProfile, matchCuisines } from "../../web/pickers.js";

const vocabulary = JSON.parse(await readFile(new URL("../../data/sample/vocabulary.json", import.meta.url), "utf8"));

test("part of a word finds the cuisine, whatever its case", () => {
  assert.deepEqual(matchCuisines(vocabulary.cuisines, "viet").map((c) => c.cuisine), ["Vietnamese"]);
  assert.deepEqual(matchCuisines(vocabulary.cuisines, "NAMES").map((c) => c.cuisine), ["Vietnamese"]);
});

test("a picked cuisine starts with the vocabulary defaults for every shipped trait", () => {
  assert.deepEqual(defaultProfile(vocabulary, "Thai"), {
    cuisine: "Thai",
    venue_type: "Restaurant",
    price_band: "unknown",
    chain: false,
    vegetarian_friendly: false,
    vegan_options: false,
    gluten_free: false,
  });
});

test("a trait missing from the vocabulary is missing from the profile", () => {
  const withoutChain = { ...vocabulary, traits: vocabulary.traits.filter((t) => t.name !== "chain") };
  assert.ok(!("chain" in defaultProfile(withoutChain, "Thai")));
});
