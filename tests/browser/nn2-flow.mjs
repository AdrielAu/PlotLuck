// Real-browser test of NN2 behind the questions screen (#136): the explicit download, the answers read
// into a review, and the fallback where WebGPU is missing. Headless browsers cannot run the real model,
// so a stand-in WebLLM module answers in its place with a fixed reply; the real worker still validates it.
import assert from "node:assert/strict";
import { test } from "node:test";

import { NN2 } from "../../web/nn2-runtime.js";
import { answerQuestions, newPage, openSite } from "./site.mjs";

const answers = ["SE", "neapolitan pizza", "casual restaurant", "mid-range", "not too expensive", "lots of vegan dishes, live music"];
const field = (value, provenance, evidence) => ({ value, provenance, evidence });
const reply = {
  fields: {
    cuisine: field("Italian", "inferred", "neapolitan pizza"),
    venue_type: field("Restaurant", "explicit", "restaurant"),
    price_band: field("$$", "explicit", "mid-range"),
    vegan_options: field(true, "explicit", "vegan dishes"),
    rent_band: field("mid", "inferred", "not too expensive"),
  },
  location: { text: "SE", near: false, distance: null, unit: null },
  unused: ["live music"],
  clarifications: [],
};

// A stand-in for the pinned WebLLM module. `loads` false never finishes loading, to test cancel.
function fakeRuntime(loads, modelReply = reply) {
  return `export async function CreateMLCEngine(id, { initProgressCallback }) {
  initProgressCallback({ progress: 0.25, text: "Fetching" });
  if (!${loads}) await new Promise(() => {});
  initProgressCallback({ progress: 1, text: "Done" });
  const content = ${JSON.stringify(JSON.stringify(modelReply))};
  return { chat: { completions: { create: async () => ({ choices: [{ finish_reason: "stop", message: { content } }] }) } } };
}`;
}

// A page whose WebGPU is `gpu` (true: an adapter, false: none) and whose WebLLM is the stand-in.
async function openPage(t, { gpu, loads = true, modelReply = reply }) {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser);
  page.sent = [];
  page.context().on("request", (request) => page.sent.push(`${request.url()} ${request.postData() ?? ""}`));
  await page.addInitScript((has) => {
    Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, get: () => (has ? { requestAdapter: async () => ({}) } : undefined) });
  }, gpu);
  await page.context().route(NN2.runtimeUrl, (route) => route.fulfill({
    body: fakeRuntime(loads, modelReply), contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  }));
  await page.goto(url);
  await page.locator("#answer:not([disabled])").waitFor();
  return page;
}

const status = (page) => page.locator("#model-status").innerText();

test("an NN2 draft with London waits for a confirmed catalogue boundary", async (t) => {
  const modelReply = { ...reply, location: { text: "London", near: false, distance: null, unit: null } };
  const page = await openPage(t, { gpu: true, modelReply });
  await page.locator('#answer[aria-busy="false"]').waitFor();
  await page.getByRole("button", { name: "Download" }).click();
  await page.waitForFunction(() => /ready/.test(document.querySelector("#model-status").textContent));
  await answerQuestions(page, ["London", ...answers.slice(1)]);
  assert.equal(await status(page), "The on-device model read your answers.");
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  assert.match(await page.getByRole("alert").innerText(), /Choose the intended place/);
  await page.getByLabel("Intended place", { exact: true }).selectOption({ label: "City of London (city, England)" });
  await page.getByLabel("Rent band", { exact: true }).selectOption("any");
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  assert.equal(await page.locator("#review-error").isVisible(), false, await page.locator("#review-error").innerText());
  await page.locator("#results-screen").waitFor();
  assert.match(await page.locator("#results-heading").innerText(), /^Italian.*City of London/);
  assert.ok((await page.locator(".district-code").allInnerTexts()).every(code => code.startsWith("EC")));
  assert.deepEqual(page.errors, []);
});

test("dietary traits NN2 omits stay editable for confirmation when the user states them", async (t) => {
  const omittedTraitReply = {
    ...reply,
    fields: { cuisine: field("Thai", "explicit", "Thai") },
    unused: ["vegan options with live music"],
  };
  const page = await openPage(t, { gpu: true, modelReply: omittedTraitReply });
  await page.getByRole("button", { name: "Download" }).click();
  await page.waitForFunction(() => /ready/.test(document.querySelector("#model-status").textContent));
  await answerQuestions(page, ["SE", "Thai", "", "", "", "vegan options with live music"]);
  const vegan = page.locator("#draft-vegan_options");
  assert.equal(await vegan.isChecked(), true);
  assert.match(await page.locator("#unused-list").innerText(), /live music/i);
  await vegan.uncheck();
  await vegan.check();
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  await page.locator("#results-screen").waitFor();
  assert.match(await page.locator("#confirmed-profile").innerText(), /Vegan options: Yes/);
  assert.deepEqual(page.errors, []);
});

test("the downloaded model reads the answers into a review that compares districts", async (t) => {
  const page = await openPage(t, { gpu: true });

  await t.test("Download shows progress, then the model is ready", async () => {
    await page.getByRole("button", { name: "Download" }).click();
    await page.waitForFunction(() => /ready/.test(document.querySelector("#model-status").textContent));
    assert.equal(await page.getByRole("button", { name: "Download" }).isVisible(), false);
    assert.equal(await page.locator("#model-progress").isVisible(), false);
  });

  await t.test("the model's draft reaches the review with its marks and unused details", async () => {
    await answerQuestions(page, answers);
    assert.equal(await status(page), "The on-device model read your answers.");
    assert.equal(await page.getByLabel("Food", { exact: true }).inputValue(), "Italian");
    const mark = (label) => page.locator(".draft-chip", { has: page.getByLabel(label, { exact: true }) }).locator(".mark");
    assert.equal(await mark("Food").innerText(), "Inferred");
    assert.equal(await mark("Rent band").innerText(), "Inferred");
    assert.equal(await mark("Price band").count(), 0);
    assert.equal(await mark("Part of a chain").innerText(), "Default");
    assert.equal(await page.getByLabel("Rent band").inputValue(), "mid");
    assert.equal(await page.locator("#draft-vegan_options").isChecked(), true);
    assert.deepEqual(await page.locator("#unused-list li").allInnerTexts(), ["live music"]);
  });

  await t.test("Compare districts opens results for the confirmed draft", async () => {
    await page.getByRole("button", { name: "Compare districts" }).click();
    await page.locator("#results-screen").waitFor();
    assert.match(await page.locator("#results-heading").innerText(), /^Italian.* · SE postcode area$/);
    assert.match(await page.locator("#confirmed-profile").innerText(), /Price band: .*\$\$.*Vegan options: Yes;.*Rent band: Mid\.$/);
  });

  await t.test("the answers never leave the tab", async () => {
    assert.ok(page.sent.some((s) => s.startsWith(NN2.runtimeUrl)));
    assert.deepEqual(page.sent.filter((s) => /neapolitan|vegan dishes/i.test(s)), []);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  });
  assert.deepEqual(page.errors, []);
});

test("a download can be cancelled, and the built-in reader then reads the answers", async (t) => {
  const page = await openPage(t, { gpu: true, loads: false });
  await page.getByRole("button", { name: "Download" }).click();
  await page.waitForFunction(() => document.querySelector("#model-progress").value === 0.25);
  assert.equal(await page.locator("#model-progress").isVisible(), true);
  await page.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await status(page), "Download cancelled. Plotluck's built-in reader reads your answers.");
  assert.equal(await page.getByRole("button", { name: "Download" }).isVisible(), true);
  assert.equal(await page.locator("#model-progress").isVisible(), false);
  await answerQuestions(page, ["SE", "Thai", "", "quite cheap", "", ""]);
  const price = page.locator(".draft-chip", { has: page.getByLabel("Price band") });
  assert.equal(await price.locator(".mark").innerText(), "Inferred");
  assert.deepEqual(page.errors, []);
});

test("without WebGPU nothing downloads and the built-in reader leads to results", async (t) => {
  const page = await openPage(t, { gpu: false });
  await page.getByRole("button", { name: "Download" }).click();
  assert.match(await status(page), /^This browser cannot run the on-device model/);
  await answerQuestions(page, ["SE", "Thai", "", "quite cheap", "", "vegan options"]);
  assert.equal(await page.getByLabel("Food", { exact: true }).inputValue(), "Thai");
  await page.getByRole("button", { name: "Compare districts" }).click();
  await page.locator("#results-screen").waitFor();
  assert.match(await page.locator("#results-heading").innerText(), /^Thai · SE postcode area$/);
  assert.equal(page.sent.some((s) => s.startsWith(NN2.runtimeUrl)), false);
  assert.deepEqual(page.errors, []);
});
