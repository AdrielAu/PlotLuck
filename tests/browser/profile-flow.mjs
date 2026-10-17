// Real-browser test: install Playwright and Leaflet locally, then run this file with Node.
// Set PLOTLUCK_PLAYWRIGHT to its module URL and PLOTLUCK_BROWSER to a Chromium executable if needed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const playwright = import.meta.resolve(process.env.PLOTLUCK_PLAYWRIGHT ?? "playwright");
const { chromium } = await import(playwright);
const leaflet = new URL("../leaflet/dist/", playwright);
const types = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", csv: "text/csv" };

test("a picked profile needs confirmation before its district results appear", async (t) => {
  const root = new URL("../../web/", import.meta.url);
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = new URL(`.${path === "/" ? "/index.html" : path}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[file.pathname.split(".").at(-1)] ?? "text/plain" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLOTLUCK_BROWSER ? { executablePath: process.env.PLOTLUCK_BROWSER } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Serve the real pinned mapping library locally; tiles are irrelevant to profile confirmation.
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({ body: await readFile(new URL(name, leaflet)), contentType: types[name.split(".").at(-1)] });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const cuisine = page.getByRole("combobox", { name: "Cuisine", exact: true });
  await cuisine.waitFor({ state: "visible" });
  await page.locator("#profile-controls:not([disabled])").waitFor();
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  assert.match(await page.getByRole("alert").innerText(), /Choose a cuisine from the list/);
  await page.getByRole("checkbox", { name: "Vegan options", exact: true }).check();
  await cuisine.fill("Thai");
  await cuisine.press("Enter");
  assert.equal(await page.getByRole("region", { name: "District results", exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "Compare districts", exact: true }).click();
  await page.getByRole("region", { name: "District results", exact: true }).waitFor();
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
    await cuisine.fill("Atlantis food");
    await page.getByRole("button", { name: "Compare districts", exact: true }).click();
    assert.match(await page.getByRole("alert").innerText(), /Choose a cuisine from the list/);
    assert.equal(await cuisine.getAttribute("aria-invalid"), "true");
    assert.equal(await cuisine.inputValue(), "Atlantis food");
    assert.equal(await page.locator("#confirmed-profile").innerText(), confirmed);
    assert.equal(await page.locator("#ranked").innerText(), ranked);
    await cuisine.press("Escape");
    assert.equal(await cuisine.inputValue(), "Vietnamese (scored as Other)");
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
  assert.deepEqual(errors, []);
});
