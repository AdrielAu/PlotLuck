// Real-browser test of the results screen and its pickers panel: install Playwright, Leaflet and
// Three.js locally (docs/setup.md), then run this file with Node.
import assert from "node:assert/strict";
import { test } from "node:test";

import { answerQuestions, newPage, openSite } from "./site.mjs";

test("a profile needs confirmation before its district results appear", async (t) => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser);
  await page.goto(url);
  const startHistory = await page.evaluate(() => history.length);
  await answerQuestions(page, ["anywhere", "Thai", "", "", "", "vegan options"]);
  const results = page.locator("#results-screen");
  assert.equal(await results.isVisible(), false);
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  await results.waitFor();
  assert.equal(await page.locator("#questions-screen").isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "results-heading");
  const cuisine = page.getByRole("combobox", { name: "Cuisine", exact: true });
  assert.equal(await cuisine.isVisible(), false);
  await page.getByText("Edit your restaurant", { exact: true }).click();
  assert.equal(await cuisine.inputValue(), "Thai");
  assert.equal(await page.locator("#results-heading").innerText(), "Thai · England");
  assert.match(await page.locator("#confirmed-profile").innerText(), /Vegan options: Yes/);
  // The slider starts at the 10th-best score, so the shortlist opens on the top 10.
  assert.equal(await page.locator("#ranked li").count(), 10);
  assert.match(await page.locator("#count").innerText(), /^10 of \d+ districts in your search area$/);
  assert.match(await page.locator("#ranked li").first().innerText(), /^1\s/);
  const slider = page.getByRole("slider", { name: "Score threshold", exact: true });
  const compare = page.getByRole("button", { name: "Compare districts", exact: true });

  await t.test("the map and the ranked list are linked", async () => {
    const third = page.locator("#ranked li button").nth(2);
    const code = await third.locator(".district-code").innerText();
    await third.click();
    assert.match(await third.getAttribute("class"), /is-highlighted/);
    const tooltip = page.locator(".leaflet-tooltip");
    assert.match(await tooltip.innerText(), new RegExp(`^#3 · ${code} · \\d\\.\\d{2,4}$`));
    // Hovering the circle at the map's centre, where the click glided to, highlights that circle's row.
    await page.waitForTimeout(1500);
    // The opened pickers panel can push the map's centre below the window.
    await page.locator("#map").scrollIntoViewIfNeeded();
    const box = await page.locator("#map").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Leaflet fades a closed tooltip out for 200 ms before removing it.
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-tooltip").length === 1);
    const hovered = (await tooltip.innerText()).split(" · ")[1];
    assert.equal(await page.locator("#ranked button.is-highlighted .district-code").innerText(), hovered);
    await page.mouse.move(box.x + box.width + 40, box.y + 10);
    await page.locator("#ranked button.is-highlighted").waitFor({ state: "detached" });
  });

  await t.test("a moved threshold is kept for the same answers and reset for new ones", async () => {
    // Home moves the slider to the search area's lowest score, showing every district.
    const mapHeight = () => page.locator(".map-panel").evaluate((panel) => panel.offsetHeight);
    const topTenHeight = await mapHeight();
    await slider.press("Home");
    const all = await page.locator("#ranked li").count();
    assert.ok(all > 10);
    // The long list scrolls in its panel; it must not stretch the map.
    assert.equal(await mapHeight(), topTenHeight);
    // End goes just past the best score: nothing is shown and the message says why.
    await slider.press("End");
    assert.equal(await page.locator("#ranked li").count(), 0);
    assert.match(await page.locator("#empty").innerText(), /No district reaches this score threshold/);
    await slider.press("Home");
    await compare.click();
    assert.match(await page.locator("#profile-status").innerText(), /Results match/);
    assert.equal(await page.locator("#ranked li").count(), all);
    const heading = await page.locator("#results-heading").innerText();
    await page.getByRole("checkbox", { name: "Gluten free", exact: true }).check();
    await cuisine.fill("Vietnamese");
    await cuisine.press("Enter");
    assert.match(await page.locator("#profile-status").innerText(), /Edits are not applied/);
    assert.equal(await page.locator("#results-heading").innerText(), heading);
    await compare.click();
    assert.match(await page.locator("#results-heading").innerText(), /^Vietnamese.* · England$/);
    assert.match(await page.locator("#confirmed-profile").innerText(), /Vegan options: Yes/);
    assert.match(await page.locator("#confirmed-profile").innerText(), /Gluten free: Yes/);
    assert.equal(await page.locator("#ranked li").count(), 10);
  });

  await t.test("an unmatched cuisine cannot replace confirmed results", async () => {
    const heading = await page.locator("#results-heading").innerText();
    const ranked = await page.locator("#ranked").innerText();
    const selected = await cuisine.inputValue();
    await cuisine.fill("Atlantis food");
    await compare.click();
    assert.match(await page.getByRole("alert").innerText(), /Choose a cuisine from the list/);
    assert.equal(await cuisine.getAttribute("aria-invalid"), "true");
    assert.equal(await cuisine.inputValue(), "Atlantis food");
    assert.equal(await page.locator("#results-heading").innerText(), heading);
    assert.equal(await page.locator("#ranked").innerText(), ranked);
    await cuisine.press("Escape");
    assert.equal(await cuisine.inputValue(), selected);
  });

  await t.test("confirmation is keyboard accessible and leaves no trace outside the tab", async () => {
    await compare.focus();
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#profile-status").innerText(), /Results match/);
    assert.equal(await page.evaluate(() => document.activeElement.id), "results-heading");
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => history.length), startHistory);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    if (process.env.PLOTLUCK_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-results-desktop.png`, fullPage: true });
    }
  });

  await t.test("Change answers goes back to the questions with the answers kept", async () => {
    await page.getByRole("button", { name: "Change answers", exact: true }).click();
    assert.equal(await results.isVisible(), false);
    assert.equal(await page.getByRole("combobox", { name: "Where would you like to open?" }).inputValue(), "anywhere");
  });
  assert.deepEqual(page.errors, []);
});
