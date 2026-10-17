// The kitchen's dish draw (#135): no dish twice, never the same appliance twice in a row.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { APPLIANCES, DISHES, nextDish } from "../../web/dishes.js";

// A small seeded generator, so a failure replays.
function seeded(seed) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

test("the roster pairs 31 dishes with the nine appliances", () => {
  assert.equal(DISHES.length, 31);
  assert.deepEqual(APPLIANCES, ["pizza oven", "oven", "fryer", "hob", "grill", "tandoor", "steamer", "wok", "fridge"]);
  assert.deepEqual(DISHES.filter((d) => d.appliance === "tandoor").map((d) => d.name), ["Chicken tikka with naan", "Seekh kebab"]);
});

test("a whole service never repeats a dish or fires one appliance twice in a row", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const random = seeded(seed);
    const served = [];
    for (let dish; (dish = nextDish(served, random)); ) served.push(dish);
    assert.equal(new Set(served).size, served.length);
    for (let i = 1; i < served.length; i++) assert.notEqual(served[i].appliance, served[i - 1].appliance);
    // Six answers fill the table; a random draw may strand the last few dishes.
    assert.ok(served.length >= 6, `seed ${seed} served only ${served.length}`);
  }
});

test("with only the last appliance's dishes left, no dish comes out", () => {
  const served = DISHES.filter((d) => d.appliance !== "tandoor").concat(DISHES.find((d) => d.name === "Seekh kebab"));
  assert.equal(nextDish(served, Math.random), null);
});
