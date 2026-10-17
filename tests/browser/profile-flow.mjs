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

  await t.test("three failed interpretations hand off to manual entry without replacing results", async () => {
    // Mock only the model-worker boundary: no model download in UI flow tests.
    await page.addInitScript(() => {
      Object.defineProperty(navigator,'gpu',{value:{},configurable:true});
      window.__interpretRequests = 0;
      window.__workersCreated = 0;
      window.Worker = class {
        constructor() {window.__workersCreated++;}
        postMessage(data) {
          if (data.action === 'load') {
            if (window.__failNextWorker) {window.__failNextWorker=false;queueMicrotask(()=>this.onerror?.({preventDefault(){}}));return;}
            queueMicrotask(()=>this.onmessage?.({data:{id:data.id,loaded:true}}));return;
          }
          window.__interpretRequests++;
          if (data.description === 'Italian restaurant in London with vegan options.') {
            const profile = {cuisine:'Italian',venue_type:'Restaurant',price_band:'unknown',chain:false,vegetarian_friendly:false,vegan_options:false,gluten_free:false};
            const fields = Object.fromEntries(Object.entries(profile).map(([name,value])=>[name,{value,provenance:'default',evidence:null}]));
            fields.cuisine={value:'Italian',provenance:'explicit',evidence:'Italian'};
            queueMicrotask(()=>this.onmessage?.({data:{id:data.id,draft:{profile,fields,location:{text:'London',near:false,distance:null,unit:null},unused:[],clarifications:[]},
              candidates:data.catalogue.places.filter(p=>p.name==='Greater London' || p.name==='City of London')}}));return;
          }
          const deliver = () => this.onmessage?.({data:{id:data.id,error:'Invalid synthetic model output.'}});
          if (data.description.startsWith('Slow')) setTimeout(deliver,300);
          else queueMicrotask(deliver);
        }
        terminate() {} // Deliberately deliver late replies to exercise stale-response protection.
      };
    });
    await page.goto(`${page.url().split('?')[0]}?nn2=1`);
    await page.locator('#profile-controls:not([disabled])').waitFor();
    await cuisine.fill('Thai');await cuisine.press('Enter');
    await page.getByRole('checkbox',{name:'Vegan options',exact:true}).check();
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    const confirmed = await page.locator('#confirmed-profile').innerText();
    const ranked = await page.locator('#ranked').innerText();
    await page.locator('#description-panel summary').click();
    await page.getByLabel('Restaurant description',{exact:true}).fill('A Thai restaurant in London with vegan options.');
    for (let attempt=1;attempt<=3;attempt++) {
      await page.locator('#interpret').click();
      await page.waitForFunction(n=>document.getElementById('interpret-status').textContent.includes(n===3 ? 'Three attempts used' : `${n} of 3 attempts used`),attempt);
    }
    assert.equal(await page.locator('#interpret').isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__interpretRequests),3);
    assert.match(await page.locator('#interpret-status').innerText(),/choose or check.*cuisine.*search area/i);
    assert.equal(await page.getByRole('checkbox',{name:'Vegan options',exact:true}).isChecked(),true);
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    assert.equal(await page.locator('#ranked').innerText(),ranked);
    if (process.env.PLOTLUCK_SCREENSHOTS) {
      await page.setViewportSize({width:390,height:844});
      await page.locator('#profile-controls').screenshot({path:`${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-recovery-mobile.png`});
      await page.setViewportSize({width:1280,height:1000});
      await page.locator('#profile-controls').screenshot({path:`${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-recovery-desktop.png`});
    }
    await page.getByRole('button',{name:'Enter details myself'}).click();
    assert.equal(await cuisine.evaluate(element=>element===document.activeElement),true);
    await cuisine.fill('Italian');await cuisine.press('Enter');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#confirmed-profile').innerText(),/Italian.*Vegan options: Yes/);

    await page.getByLabel('Restaurant description',{exact:true}).fill('Slow Thai restaurant in London.');
    await page.locator('#interpret').click();
    await page.waitForFunction(()=>window.__interpretRequests===4);
    await cuisine.fill('Vietnamese');await cuisine.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await cuisine.inputValue(),'Vietnamese (scored as Asian)');
    assert.equal(await page.locator('#compare').isEnabled(),true);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    assert.doesNotMatch(await page.locator('#interpret-status').innerText(),/^Interpreting/);
  });

  await t.test('a valid interpretation remains a draft until the place and profile are confirmed',async()=>{
    const confirmed = await page.locator('#confirmed-profile').innerText();
    await page.getByLabel('Restaurant description',{exact:true}).fill('Italian restaurant in London with vegan options.');
    await page.locator('#interpret').click();
    await page.waitForFunction(()=>document.getElementById('interpret-status').textContent.startsWith('Draft ready'));
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    assert.equal(await cuisine.inputValue(),'Italian');
    assert.equal(await page.locator('#place-choice').inputValue(),'');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Choose a valid search area/);
    await page.locator('#place-choice').selectOption('E09000001');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#confirmed-profile').innerText(),/Italian.*City of London.*Vegan options: Yes/);
  });

  await t.test("an explicit unresolved area blocks comparison and a chosen place scopes results", async () => {
    const confirmed = await page.locator('#confirmed-profile').innerText();
    await page.getByLabel('Search area',{exact:true}).fill('Atlantis');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Choose a valid search area/);
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    await page.getByLabel('Search area',{exact:true}).fill('London');
    await page.locator('#place-choice:not([disabled])').waitFor();
    assert.equal(await page.locator('#place-choice').inputValue(),'');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Choose a valid search area/);
    await page.locator('#place-choice').selectOption('E09000001');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#confirmed-profile').innerText(),/City of London/);
    const visible = await page.locator('#ranked .district-code').allTextContents();
    const catalogue = JSON.parse(await readFile(new URL('../../web/models/geography.json',import.meta.url)));
    const allowed = new Set(catalogue.places.find(p=>p.id==='E09000001').districts);
    assert.ok(visible.length>0 && visible.every(code=>allowed.has(code)));
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  });

  await t.test('a total rent budget preserves period and annual value without overwriting NN1 district rent',async()=>{
    const confirmed=await page.locator('#confirmed-profile').innerText();
    await page.getByLabel('Total rent budget (£)',{exact:true}).fill('2000');
    await page.getByLabel('Rent budget period',{exact:true}).selectOption('month');
    await page.getByLabel('Total rent budget (£)',{exact:true}).press('Tab');
    assert.match(await page.locator('#rent-summary').innerText(),/24,000 per year/);
    assert.match(await page.locator('#rent-summary').innerText(),/not used in scoring/);
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Confirm a rent band/);
    await page.getByLabel('Confirm rent band',{exact:true}).selectOption('low');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#confirmed-profile').innerText(),/24,000\/year \(not used in scoring\)/);
    assert.match(await page.locator('#confirmed-profile').innerText(),/Rent band: low/);
  });

  await t.test('retry creates a fresh worker after a worker module failure',async()=>{
    await page.getByLabel('Restaurant description',{exact:true}).fill('A Thai restaurant in Camden.');
    const before=await page.evaluate(()=>{window.__failNextWorker=true;return window.__workersCreated;});
    await page.locator('#interpret').click();
    await page.waitForFunction(()=>document.getElementById('interpret-status').textContent.includes('1 of 3 attempts used'));
    await page.locator('#interpret').click();
    await page.waitForFunction(()=>document.getElementById('interpret-status').textContent.includes('2 of 3 attempts used'));
    assert.equal(await page.evaluate(()=>window.__workersCreated),before+2);
    assert.equal(await page.locator('#compare').isEnabled(),true);
  });
  assert.deepEqual(errors, []);
});
