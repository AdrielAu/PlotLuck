// The kitchen's make-believe day and weather (#159). Run from the repo root with `node --test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DAY_MS, SNOW_MS, handAngles, kitchenHour, lightFor, phaseAt, pickWeather, readOverrides, settleSnow } from "../../web/sky.js";

test("a whole day passes every 20 minutes", () => {
  assert.equal(kitchenHour(10, 0), 10);
  assert.equal(kitchenHour(10, DAY_MS / 2), 22);
  assert.equal(kitchenHour(10, DAY_MS), 10);
  // One real minute is 72 kitchen minutes.
  assert.ok(Math.abs(kitchenHour(0, 60_000) - 1.2) < 1e-9);
});

test("the phases split the day at six, seven, six and seven", () => {
  assert.deepEqual([0, 5.99, 6, 6.99, 7, 17.99, 18, 18.99, 19, 23.9].map(phaseAt),
    ["night", "night", "sunrise", "sunrise", "day", "day", "sunset", "sunset", "night", "night"]);
});

test("weather follows British odds", () => {
  assert.deepEqual([0, 0.39, 0.4, 0.69, 0.7, 0.94, 0.95, 0.999].map((r) => pickWeather(() => r)),
    ["cloud", "cloud", "sun", "sun", "rain", "rain", "snow", "snow"]);
});

test("only known phases and weathers can be forced from the address", () => {
  assert.deepEqual(readOverrides("?sky=night&weather=snow"), { sky: "night", weather: "snow" });
  assert.deepEqual(readOverrides("?sky=noon&weather=hail"), { sky: null, weather: null });
  assert.deepEqual(readOverrides(""), { sky: null, weather: null });
});

test("snow settles over a minute and melts over a minute", () => {
  assert.equal(settleSnow(0, true, SNOW_MS / 2), 0.5);
  assert.equal(settleSnow(0.5, true, SNOW_MS), 1);
  assert.equal(settleSnow(1, false, SNOW_MS / 4), 0.75);
  assert.equal(settleSnow(0.2, false, SNOW_MS), 0);
});

test("the hands point the right way", () => {
  assert.deepEqual(handAngles(0), { hour: 0, minute: 0 });
  assert.ok(Math.abs(handAngles(15.5).hour - (3.5 / 12) * 2 * Math.PI) < 1e-9);
  assert.ok(Math.abs(handAngles(15.5).minute - Math.PI) < 1e-9);
});

test("the ceiling light is on at night only, and bad weather dims the day", () => {
  assert.deepEqual(["night", "sunrise", "day", "sunset"].map((p) => lightFor(p, "rain").ceiling), [true, false, false, false]);
  assert.ok(lightFor("day", "rain").sunIntensity < lightFor("day", "sun").sunIntensity);
  assert.notEqual(lightFor("day", "cloud").sky, lightFor("day", "sun").sky);
});
