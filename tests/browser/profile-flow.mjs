// Real-browser test of the results panel: install Playwright, Leaflet and Three.js locally
// (docs/setup.md), then run this file with Node.
import assert from "node:assert/strict";
import { test } from "node:test";

import { answerQuestions, newPage, openSite } from "./site.mjs";

test("a profile needs confirmation before its district results appear", async (t) => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser);
  await page.goto(url);
  await answerQuestions(page, ["anywhere", "Thai", "", "", "", "vegan options"]);
  assert.equal(await page.getByRole("region", { name: "District results", exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  await page.getByRole("region", { name: "District results", exact: true }).waitFor();
  const cuisine = page.getByRole("combobox", { name: "Cuisine", exact: true });
  assert.equal(await cuisine.inputValue(), "Thai");
  assert.match(await page.locator("#confirmed-profile").innerText(), /Thai.*England/);
  assert.match(await page.locator("#confirmed-profile").innerText(), /Vegan options: Yes/);
  assert.ok(await page.locator("#ranked li").count() > 0);

  await t.test("draft edits and threshold changes preserve the confirmed restaurant", async () => {
    const confirmed = await page.locator("#confirmed-profile").innerText();
    const ranked = await page.locator("#ranked").innerText();
    await page.getByRole("checkbox", { name: "Gluten free", exact: true }).check();
    await cuisine.fill("Vietnamese");
    await cuisine.press("Enter");
    assert.equal(await page.locator("#confirmed-profile").innerText(), confirmed);
    assert.equal(await page.locator("#ranked").innerText(), ranked);
    assert.match(await page.locator("#profile-status").innerText(), /Edits are not applied/);
    await page.getByRole("slider", { name: "Score threshold", exact: true }).fill("0");
    assert.equal(await page.locator("#confirmed-profile").innerText(), confirmed);
    assert.equal(await page.getByRole("checkbox", { name: "Vegan options", exact: true }).isChecked(), true);
    await page.getByRole("button", { name: "Compare districts", exact: true }).click();
    assert.match(await page.locator("#confirmed-profile").innerText(), /Vietnamese.*Vegan options: Yes/);
    assert.match(await page.locator("#profile-status").innerText(), /Results match/);
    assert.equal(await page.getByRole("slider", { name: "Score threshold", exact: true }).inputValue(), "0");
  });

  await t.test("an unmatched cuisine cannot replace confirmed results", async () => {
    const confirmed = await page.locator("#confirmed-profile").innerText();
    const ranked = await page.locator("#ranked").innerText();
    const selected = await cuisine.inputValue();
    await cuisine.fill("Atlantis food");
    await page.getByRole("button", { name: "Compare districts", exact: true }).click();
    assert.match(await page.getByRole("alert").innerText(), /Choose a cuisine from the list/);
    assert.equal(await cuisine.getAttribute("aria-invalid"), "true");
    assert.equal(await cuisine.inputValue(), "Atlantis food");
    assert.equal(await page.locator("#confirmed-profile").innerText(), confirmed);
    assert.equal(await page.locator("#ranked").innerText(), ranked);
    await cuisine.press("Escape");
    assert.equal(await cuisine.inputValue(), selected);
    await page.getByRole("button", { name: "Compare districts", exact: true }).click();
    assert.equal(await page.locator("#confirmed-profile").innerText(), confirmed);
  });

  await t.test("confirmation is keyboard accessible and fits a narrow screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Compare districts", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#profile-status").innerText(), /Results match/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    if (process.env.PLOTLUCK_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-profile-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.screenshot({ path: `${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-profile-desktop.png`, fullPage: true });
    }
  });
  assert.deepEqual(page.errors, []);
});
