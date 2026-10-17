// The kitchen's dish draw (#135): no dish twice a round, none already on the table, never the same appliance twice in a row;
// and the table's cycle: fill, hold, clear out of the window, fill again.
// Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { APPLIANCES, DISHES, TABLE_MS, nextDish, tableStep } from "../../web/dishes.js";

// A small seeded generator, so a failure replays.
function seeded(seed) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

test("the roster pairs 31 dishes with the nine appliances", () => {
  assert.equal(DISHES.length, 31);
  assert.deepEqual(APPLIANCES, ["pizza oven", "oven", "fryer", "hob", "grill", "tandoor", "steamer", "wok", "fridge"]);
  assert.deepEqual(DISHES.filter((d) => d.appliance === "tandoor").map((d) => d.name), ["Chicken tikka with naan", "Seekh kebab"]);
});

// The kitchen's loop: six places filled, then cleared one random dish at a time, a new round when the draw runs dry.
function service(random, count) {
  const out = [];
  let served = [];
  const table = [];
  while (out.length < count) {
    const last = out.at(-1)?.dish;
    let dish = nextDish(served, table, random, last);
    if (!dish) {
      served = [];
      dish = nextDish(served, table, random, last);
    }
    assert.ok(dish, "a new round always has a dish");
    assert.ok(!table.includes(dish), `${dish.name} is already on the table`);
    served.push(dish);
    table.push(dish);
    out.push({ dish, round: served.length === 1 });
    if (table.length === 6) while (table.length) table.splice(Math.floor(random() * table.length), 1);
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

// The table's moves over `ms` of running time, ticked like the kitchen's 30 fps loop.
function moves(ms) {
  const out = [];
  let state = { stage: "filling", wait: TABLE_MS.first, dishes: 0 };
  for (let t = 0; t <= ms; t += 33) {
    let action;
    [state, action] = tableStep(state, 33, 6);
    if (action) out.push({ t, action, dishes: state.dishes, stage: state.stage });
  }
  return out;
}

test("the table fills, holds, clears one dish at a time, then fills again", () => {
  const out = moves(60000);
  const actions = out.map((m) => m.action[0]).join("");
  assert.match(actions, /^(s{6}c{6})+s*c*$/);
  const at = (i) => out[i].t;
  assert.ok(Math.abs(at(0) - 1500) < 40, "first dish about 1.5 s in");
  assert.ok(Math.abs(at(1) - at(0) - 4000) < 40, "then one every 4 s");
  assert.ok(Math.abs(at(6) - at(5) - 3100) < 40, "the last dish lands, then the full table shows for 2 s");
  assert.ok(Math.abs(at(7) - at(6) - 1000) < 40, "dishes leave about 1 s apart");
  assert.ok(Math.abs(at(12) - at(11) - 1000) < 40, "a beat after the table empties, serving starts again");
  assert.ok(Math.abs(at(13) - at(12) - 4000) < 40, "back to the 4 s rhythm");
  assert.deepEqual(out.slice(0, 12).map((m) => m.dishes), [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(out[5].stage, "clearing", "no dish is served while the table clears");
  assert.equal(out[11].stage, "filling");
});

test("across an empty table, the next dish still keeps to another appliance", () => {
  const last = DISHES.find((d) => d.name === "Seekh kebab");
  const served = DISHES.filter((d) => d.appliance !== "tandoor");
  assert.equal(nextDish(served, [], Math.random, last), null);
});
