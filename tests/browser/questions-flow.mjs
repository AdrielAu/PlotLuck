// Real-browser test of the questions screen (#135): six questions, the review card and the kitchen.
// Install Playwright, Leaflet and Three.js locally (docs/setup.md), then run this file with Node.
import assert from "node:assert/strict";
import { test } from "node:test";

import { answerQuestions, newPage, openSite } from "./site.mjs";

const frames = (page) => page.locator("#kitchen").getAttribute("data-frames").then(Number);

test("six questions lead through a review card to scoped results", async (t) => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser);
  await page.goto(url);
  const box = page.locator("#answer");
  await page.locator("#answer:not([disabled])").waitFor();

  await t.test("the first screen introduces Plotluck and keeps the source attribution", async () => {
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Plotluck");
    assert.match(await page.locator(".lede").innerText(), /^Tell us about your restaurant idea and we will help you find the ideal location for your restaurant\.$/);
    assert.match(await page.locator(".model-line").first().innerText(), /on-device model \(≈300 MB\) · Download/);
    assert.match(await page.locator("body > footer").innerText(), /Not affiliated with or endorsed by Tripadvisor.*Non-commercial use only/s);
    assert.equal(await page.locator("#results-screen").isVisible(), false);
  });

  await t.test("a required question shakes and will not move on without a readable answer", async () => {
    const question = page.getByRole("combobox", { name: "Where would you like to open?" });
    await box.press("Enter");
    assert.equal(await page.getByRole("alert").innerText(), "You must answer this question.");
    assert.equal(await page.locator("#prompt").evaluate((el) => el.classList.contains("shake")), true);
    assert.equal(await question.getAttribute("aria-invalid"), "true");
    await box.fill("Leeds");
    await box.press("Escape");
    await box.press("Enter");
    assert.equal(await page.getByRole("alert").innerText(), "Place names arrive soon. For now, enter a postcode like LS1, or 'anywhere'.");
    assert.ok(await question.isVisible());
  });

  await t.test("autocomplete and chips come from the bundle, and each answer serves one dish", async () => {
    const before = Number(await page.locator("#kitchen").getAttribute("data-dishes"));
    await box.fill("se1");
    // The site serves the full bundle: up to eight districts that start with what was typed.
    const options = await page.getByRole("option").allInnerTexts();
    assert.equal(options[0], "SE1");
    assert.ok(options.length <= 8 && options.every((o) => o.startsWith("SE1")), options.join());
    await page.getByRole("option", { name: "SE1", exact: true }).click();
    await page.getByRole("combobox", { name: "What food will you serve?" }).waitFor();
    await box.fill("viet");
    await box.press("Enter");
    await page.getByRole("combobox", { name: "What kind of place is it?" }).waitFor();
    assert.deepEqual(await page.locator("#chips button").allInnerTexts(), ["Restaurant", "Pub and bar", "Café", "Fast food and street food"]);
    await box.press("Enter");
    await box.fill("quite cheap");
    await box.press("Enter");
    await page.getByRole("button", { name: "Low", exact: true }).click();
    await page.getByRole("combobox", { name: "Anything else diners should know?" }).waitFor();
    await page.getByRole("button", { name: "Vegan options", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Vegan options", exact: true }).getAttribute("aria-pressed"), "true");
    await box.press("End");
    await box.pressSequentially(", lots of parking");
    await box.press("Escape");
    await box.press("Enter");
    await page.getByRole("heading", { name: "Your restaurant, as we read it" }).waitFor();
    assert.equal(Number(await page.locator("#kitchen").getAttribute("data-dishes")), before + 6);
  });

  await t.test("the review card marks inferred values and lists details not used in scoring", async () => {
    assert.equal(await page.getByLabel("Food", { exact: true }).inputValue(), "Vietnamese");
    assert.equal(await page.getByLabel("Search area").inputValue(), "SE1");
    const price = page.locator(".draft-chip", { has: page.getByLabel("Price band") });
    assert.equal(await price.locator(".mark").innerText(), "Inferred");
    assert.deepEqual(await page.locator("#unused-list li").allInnerTexts(), ["Other: lots of parking"]);
    await page.getByLabel("Venue type").selectOption("Café");
    assert.equal(await page.locator(".draft-chip", { has: page.getByLabel("Venue type") }).locator(".mark").count(), 0);
    await page.getByLabel("Search area").fill("Leeds");
    await page.getByLabel("Search area").press("Tab");
    assert.equal(await page.getByLabel("Search area").getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator(".draft-chip", { has: page.getByLabel("Search area") }).locator(".mark").count(), 0);
    await page.getByRole("button", { name: "Compare districts" }).click();
    assert.match(await page.getByRole("alert").innerText(), /Place names arrive soon/);
    await page.getByLabel("Search area").fill("SE");
    await page.getByLabel("Search area").press("Tab");
    await page.getByLabel("Rent band").selectOption("high");
    await page.getByRole("button", { name: "Compare districts" }).click();
    await page.locator("#results-screen").waitFor();
  });

  await t.test("results show the draft, filter by area and rent band, and go back with answers kept", async () => {
    assert.match(await page.locator("#results-heading").innerText(), /^Vietnamese.* · SE postcode area$/);
    assert.match(await page.locator("#confirmed-profile").innerText(), /^Venue type: Café; Price band: Budget \(\$\);.*Vegan options: Yes;.*Rent band: High\.$/);
    // The pickers panel starts collapsed, so the map fills the window.
    assert.equal(await page.locator("#profile-panel").evaluate((el) => el.open), false);
    assert.equal(await page.getByRole("button", { name: "Compare districts" }).isVisible(), false);
    await page.getByText("Edit your restaurant", { exact: true }).click();
    // Filtering itself is pinned on sample data in tests/js; here, only SE districts, fewer at high rent.
    const shown = async () => Number((await page.locator("#count").innerText()).match(/of (\d+) districts/)[1]);
    const high = await shown();
    assert.ok(high > 0);
    assert.ok((await page.locator(".district-code").allInnerTexts()).every((code) => /^SE\d/.test(code)));
    assert.equal(await page.getByRole("radio", { name: "High", exact: true }).isChecked(), true);
    assert.equal(await page.locator("#area-label").innerText(), "SE postcode area");
    await page.getByRole("radio", { name: "Any", exact: true }).check();
    await page.getByRole("button", { name: "Compare districts" }).click();
    assert.ok(await shown() > high);
    assert.equal(await page.locator("#kitchen").getAttribute("data-kitchen"), "paused");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Where would you like to open?" }).inputValue(), "SE1");
    await page.getByRole("button", { name: "Back" }).waitFor({ state: "hidden" });
    assert.equal(await page.locator("#kitchen").getAttribute("data-kitchen"), "running");
  });

  await t.test("the kitchen pauses while the tab is hidden", async () => {
    const hide = (state) => page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
    await hide("hidden");
    assert.equal(await page.locator("#kitchen").getAttribute("data-kitchen"), "paused");
    const paused = await frames(page);
    await page.waitForTimeout(400);
    assert.equal(await frames(page), paused);
    await hide("visible");
    await page.waitForTimeout(400);
    assert.ok(await frames(page) > paused);
  });

  await t.test("question text keeps AA contrast over any kitchen pixel", async () => {
    // Worst case: the scrim over pure black or pure white, against each text colour on it.
    const ratios = await page.evaluate(() => {
      const rgb = (css) => css.match(/[\d.]+/g).map(Number);
      const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const [r, g, b, a] = rgb(getComputedStyle(document.querySelector(".intro-scrim")).backgroundColor);
      return [...document.querySelectorAll(".intro-scrim p, .intro-scrim h1, .intro-scrim button")].flatMap((el) => {
        const ink = lum(rgb(getComputedStyle(el).color));
        return [0, 255].map((under) => {
          const ground = lum([r, g, b].map((c) => c * a + under * (1 - a)));
          return (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05);
        });
      });
    });
    assert.ok(Math.min(...ratios) >= 4.5, `lowest contrast ${Math.min(...ratios).toFixed(2)}`);
  });

  await t.test("the questions fit a narrow screen without storing answers", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    if (process.env.PLOTLUCK_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-questions-mobile.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: `${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-questions-desktop.png` });
    }
  });
  assert.deepEqual(page.errors, []);
});

test("under reduced motion the kitchen is a still frame and dishes appear in place", async (t) => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser, { reducedMotion: "reduce" });
  await page.goto(url);
  await page.locator("#answer:not([disabled])").waitFor();
  await page.locator("#kitchen[data-kitchen]").waitFor();
  assert.equal(await page.locator("#kitchen").getAttribute("data-kitchen"), "still");
  const still = await frames(page);
  await page.waitForTimeout(400);
  assert.equal(await frames(page), still);
  await answerQuestions(page, ["anywhere", "Thai", "", "", "", ""]);
  assert.equal(await page.locator("#kitchen").getAttribute("data-dishes"), "6");
  // One frame per dish, drawn at once: nothing flies.
  assert.equal(await frames(page), still + 6);
  assert.deepEqual(page.errors, []);
});
