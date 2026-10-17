// The kitchen's dish draw (#135): no dish twice a round, none already on the table, never the same appliance twice in a row.
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

// The kitchen's loop: six places, the oldest dish leaving for each new one, a new round when the draw runs dry.
function service(random, count) {
  const out = [];
  let served = [];
  const table = [];
  while (out.length < count) {
    let dish = nextDish(served, table, random);
    if (!dish) {
      served = [];
      dish = nextDish(served, table, random);
    }
    assert.ok(dish, "a new round always has a dish");
    assert.ok(!table.includes(dish), `${dish.name} is already on the table`);
    if (table.length === 6) table.shift();
    served.push(dish);
    table.push(dish);
    out.push({ dish, round: served.length === 1 });
  }
  return out;
}

test("a round never repeats a dish, and no appliance fires twice in a row", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const out = service(seeded(seed), 200);
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i].dish.appliance, out[i - 1].dish.appliance);
    let round = [];
    for (const { dish, round: fresh } of out) {
      if (fresh) round = [];
      assert.ok(!round.includes(dish), `seed ${seed} repeated ${dish.name} within a round`);
      round.push(dish);
    }
    // Rounds start again, so the kitchen never runs out; a random draw may strand a round's last few dishes.
    assert.ok(out.filter((o) => o.round).length > 1, `seed ${seed} never started a new round`);
  }
});

test("with only the last appliance's dishes left, no dish comes out", () => {
  const served = DISHES.filter((d) => d.appliance !== "tandoor");
  const table = [DISHES.find((d) => d.name === "Seekh kebab")];
  assert.equal(nextDish(served, table, Math.random), null);
});

test("a dish on the table is not drawn again, even in a new round", () => {
  const table = DISHES.filter((d) => d.appliance !== "fridge").slice(0, 6);
  for (let seed = 1; seed <= 20; seed++) assert.ok(!table.includes(nextDish([], table, seeded(seed))));
});
