// The actual worker and strict validator run against a stand-in WebLLM module.
// These tests establish workflow behavior, not model extraction accuracy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { NN2 } from '../../web/nn2-runtime.js';
import { openSite, newPage } from './site.mjs';

const catalogue = JSON.parse(await readFile(new URL('../../web/models/geography.json', import.meta.url)));
function fakeRuntime(loads = true) {
  return `export async function CreateMLCEngine(id, {initProgressCallback}) {
    initProgressCallback({progress:0.25,text:'Fetching'});
    if (!${loads}) await new Promise(()=>{});
    initProgressCallback({progress:1,text:'Ready'});
    return {chat:{completions:{create:async options=>{
      const text=options.messages.at(-1).content;
      if (text.includes('slow')) await new Promise(resolve=>setTimeout(resolve,700));
      const data={region:/london/i.test(text)?'London':text.includes('Hugh Town')?'Hugh Town':/greater manchester/i.test(text)?'Greater Manchester':text.includes('SE1')?'SE1':null,
        cuisine:/thai/i.test(text)?'Thai':null,price_band:/mid(?:[ -]?range| price range)/i.test(text)?'$$':'unknown',venue_type:/restaurant/i.test(text)?'Restaurant':null,rent:text.includes('2000')?{amount:2000,period:'month',currency:'GBP'}:null,
        rent_band:/cheap rent/i.test(text)?'low':null,
        requirements:/no other requirements/i.test(text)?'no other requirements':/vegan options/i.test(text)?'vegan options':null};
      if (text.includes('Greater London')) data.region='Greater London';
      if (text.includes('mid Range')) data.price_band='$$';
      if (text.includes('uncertain prices')) data.price_band='$';
      if (text.includes('bad budget')) data.rent.currency='USD';
      return {choices:[{finish_reason:'stop',message:{content:text.includes('broken')?'not JSON':JSON.stringify(data)}}]};
    }}}};
  }`;
}
async function openPage(t, { gpu = true, loads = true } = {}) {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser, { reducedMotion:'reduce' });
  const sent = [];
  page.context().on('request', r => sent.push(r.url() + ' ' + (r.postData() ?? '')));
  await page.addInitScript(gpu => Object.defineProperty(Navigator.prototype, 'gpu', { configurable:true, get:()=>gpu?{requestAdapter:async()=>({})}:undefined }), gpu);
  await page.context().route(NN2.runtimeUrl, route => route.fulfill({ body:fakeRuntime(loads), contentType:'text/javascript' }));
  await page.goto(url);
  await page.locator('#interpret:enabled').waitFor();
  return { page, sent };
}
const completeText = (text, omit = []) => text + (omit.includes('price') ? '' : ' Mid-range menu prices;') + (omit.includes('rent') ? '' : ' any rent;') + (omit.includes('other') ? '' : ' no other requirements.');
// Unrelated workflow checks supply all six inputs; missing-field cases opt out.
async function submit(page, text, {raw = false, omit = []} = {}) {
  await page.getByLabel('Describe your restaurant idea', { exact:true }).fill(raw ? text : completeText(text,omit));
  await page.getByRole('button', { name:'Find districts', exact:true }).click();
}

test('Greater Manchester and stated food prices and cheap rent are retained without repeat questions',async t=>{
  const {page}=await openPage(t);
  await submit(page,'i want to open a thai restaurant in greater manchester that serves mid price range food. i want as cheap rent as possible',{raw:true});
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#clarification-fields select').count(),0);
  assert.equal(await page.locator('#clarify-other').count(),1);
  await page.getByRole('button',{name:'No other requirements',exact:true}).click();
  await page.getByRole('button',{name:'Show districts',exact:true}).click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(),/Thai.*Greater Manchester/);
  assert.match(await page.locator('#confirmed-profile').innerText(),/Mid-range/);
  assert.deepEqual(page.errors,[]);
});

test('A restaurant in london asks every unanswered Erica question and retains the read restaurant type', async t => {
  const {page}=await openPage(t);
  await submit(page,'A restaurant in london',{raw:true});
  await page.locator('#clarification').waitFor();
  assert.deepEqual(await page.locator('#clarification-fields select').evaluateAll(els=>els.map(e=>e.id)),['clarify-area','clarify-cuisine','clarify-price','clarify-rent']);
  assert.equal(await page.locator('#clarify-venue').count(),0);
  assert.equal(await page.locator('#clarify-other').count(),1);
  assert.equal(await page.locator('#results-screen').isHidden(),true);
  if (process.env.PLOTLUCK_SCREENSHOTS) await page.screenshot({path:process.env.PLOTLUCK_SCREENSHOTS+'/six-field-london.png',fullPage:true});
  await page.locator('#clarify-area').selectOption(catalogue.places.find(p=>p.name==='Greater London').id);
  await page.getByLabel('What food will you serve?',{exact:true}).selectOption('Thai');
  await page.getByLabel('How are your menu prices?',{exact:true}).selectOption('$$');
  await page.getByLabel('How much rent can you take on?',{exact:true}).selectOption('any');
  await page.getByRole('button',{name:'No other requirements',exact:true}).click();
  await page.getByRole('button',{name:'Show districts',exact:true}).click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(),/Thai.*Greater London/);
  assert.match(await page.locator('#confirmed-profile').innerText(),/Restaurant.*Mid-range/);
  assert.deepEqual(page.errors,[]);
});

test('absent area means England and a missing restaurant type is explicitly requested', async t => {
  const {page}=await openPage(t);
  await submit(page,'Thai food',{raw:true});
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#clarify-area').count(),0);
  assert.equal(await page.locator('#clarify-cuisine').count(),0);
  await page.getByLabel('What kind of place is it?',{exact:true}).selectOption('Restaurant');
  await page.locator('#clarify-price').selectOption('unknown');
  await page.locator('#clarify-rent').selectOption('any');
  await page.locator('#clarify-other').fill('vegan options, live music');
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(),/England/);
  assert.match(await page.locator('#confirmed-profile').innerText(),/Vegan options: Yes/);
  assert.match(await page.locator('#unused-details').innerText(),/live music/);
});

test('a malformed model reply offers all missing inputs and can be completed without another model call', async t => {
  const {page}=await openPage(t);
  await submit(page,'A broken restaurant in london',{raw:true});
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#clarify-venue').count(),1);
  await page.locator('#clarify-area').selectOption(catalogue.places.find(p=>p.name==='Greater London').id);
  await page.locator('#clarify-cuisine').selectOption('Thai');
  await page.locator('#clarify-venue').selectOption('Restaurant');
  await page.locator('#clarify-price').selectOption('$$');
  await page.locator('#clarify-rent').selectOption('any');
  await page.locator('#clarify-other').fill('None');
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(),/Thai.*Greater London/);
});

test('one description goes straight to scoped results, with no questions, pickers or review', async t => {
  const { page, sent } = await openPage(t);
  await submit(page, 'A Thai restaurant in SE1 with vegan options.');
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(), /Thai.*SE1/);
  assert.match(await page.locator('#confirmed-profile').innerText(), /Vegan options: Yes/);
  assert.match(await page.locator('#query-notes').innerText(), /Rent band: any/);
  assert.equal(await page.locator('#clarification').isHidden(), true);
  assert.equal(await page.locator('#profile-panel, #chips, #answer-options, #review').count(), 0);
  assert.deepEqual(await page.locator('.district-code').allInnerTexts(), ['SE1']);
  assert.equal(sent.some(s => /Thai restaurant|vegan options/.test(s)), false);
  assert.equal(await page.evaluate(()=>localStorage.length + sessionStorage.length), 0);
  assert.equal(new URL(page.url()).search, '');
  const confirmed = await page.locator('#confirmed-profile').innerText();
  await page.getByRole('button', { name:'Edit description', exact:true }).click();
  assert.equal(await page.locator('#description').inputValue(), completeText('A Thai restaurant in SE1 with vegan options.'));
  assert.equal(await page.locator('#confirmed-profile').innerText(), confirmed);
  assert.equal(await page.locator('#description').evaluate(e=>e===document.activeElement), true);
  assert.deepEqual(page.errors, []);
});

test('London and conflicting cuisine prompt only their unresolved fields before scoring', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai or Italian restaurant in London.');
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#results-screen').isHidden(), true);
  assert.deepEqual(await page.locator('#clarification-fields select').evaluateAll(els=>els.map(e=>e.id)), ['clarify-area','clarify-cuisine']);
  await page.locator('#clarify-cuisine').selectOption('Thai');
  const greater = catalogue.places.find(p=>p.name==='Greater London');
  await page.locator('#clarify-area').selectOption(greater.id);
  await page.getByRole('button', { name:'Show districts', exact:true }).click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(), /Greater London/);
  assert.ok((await page.locator('.district-code').allInnerTexts()).every(c=>greater.districts.includes(c)));
  assert.deepEqual(page.errors, []);
});

test('the exact mid Range prompt offers London clarification, then uses the stated menu price', async t => {
  const { page } = await openPage(t);
  await submit(page,'A mid Range thai restaurant in London');
  await page.waitForFunction(()=>!document.querySelector('#clarification').hidden || !document.querySelector('#description-error').hidden);
  assert.equal(await page.locator('#description-error').isHidden(),true);
  assert.equal(await page.locator('#clarification').isVisible(),true);
  assert.deepEqual(await page.locator('#clarification-fields select').evaluateAll(els=>els.map(e=>e.id)),['clarify-area']);
  await page.locator('#clarify-area').selectOption(catalogue.places.find(p=>p.name==='Greater London').id);
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#confirmed-profile').innerText(),/Mid-range/);
});

test('an invalid price prediction asks only for price and place, without replacing a previous result', async t => {
  const { page } = await openPage(t);
  await submit(page,'A Thai restaurant in SE1.');
  await page.locator('#results-screen').waitFor();
  const before=await page.locator('#ranked').textContent();
  await page.getByRole('button',{name:'Edit description',exact:true}).click();
  await submit(page,'A Thai restaurant in London with uncertain prices.',{omit:['price']});
  await page.waitForFunction(()=>!document.querySelector('#clarification').hidden || !document.querySelector('#description-error').hidden);
  assert.equal(await page.locator('#description-error').isHidden(),true);
  assert.ok(await page.locator('#clarify-price').count());
  assert.equal(await page.locator('#ranked').textContent(),before);
  await page.locator('#clarify-price').selectOption('$$');
  await page.locator('#clarify-area').selectOption(catalogue.places.find(p=>p.name==='Greater London').id);
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#confirmed-profile').innerText(),/Mid-range/);
});

test('a numeric rent budget prompts only its relative band', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant in SE1, rent GBP 2000 per month.',{omit:['rent']});
  await page.locator('#clarification').waitFor();
  assert.deepEqual(await page.locator('#clarification-fields select').evaluateAll(els=>els.map(e=>e.id)), ['clarify-rent']);
  await page.locator('#clarify-rent').selectOption('any');
  await page.getByRole('button', { name:'Show districts', exact:true }).click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#query-notes').innerText(), /24,000 per year/);
});

test('an invalid numeric rent asks for a budget correction alongside the rent band', async t => {
  const {page}=await openPage(t);
  await submit(page,'A Thai restaurant in SE1, bad budget rent GBP 2000 per month.');
  await page.locator('#clarify-budget').waitFor();
  await page.locator('#clarify-budget').fill('2000');
  await page.locator('#clarify-rent').selectOption('any');
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#query-notes').innerText(),/24,000 per year/);
});

test('explicit miles use local centroid filtering without a routine clarification', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant within 3 miles of Greater London.');
  await page.locator('#results-screen').waitFor();
  assert.match(await page.locator('#results-heading').innerText(), /Within 4.828 km/);
  assert.equal(await page.locator('#clarification').isHidden(), true);
});

test('invalid replies have three attempts, preserve results and allow an edited description', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant in SE1.');
  await page.locator('#results-screen').waitFor();
  const results = await page.locator('#ranked').textContent();
  await page.getByRole('button', { name:'Edit description', exact:true }).click();
  await page.locator('#description').fill('A broken Thai restaurant in SE1.');
  for (let i=0;i<3;i++) {
    await page.locator('#interpret').click();
    await page.locator('#clarification').waitFor();
    await page.waitForFunction(()=>document.querySelector('#description-form').getAttribute('aria-busy')==='false');
  }
  assert.equal(await page.locator('#interpret').isDisabled(), true);
  assert.match(await page.locator('#interpret-status').innerText(), /Three attempts/);
  assert.equal(await page.locator('#ranked').textContent(), results);
  await page.locator('#clarify-area').selectOption('SE1');
  await page.locator('#clarify-cuisine').selectOption('Thai');
  await page.locator('#clarify-venue').selectOption('Restaurant');
  await page.locator('#clarify-price').selectOption('$$');
  await page.locator('#clarify-rent').selectOption('any');
  await page.locator('#clarify-other').fill('None');
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  await page.getByRole('button',{name:'Edit description',exact:true}).click();
  await page.locator('#description').fill('A Thai restaurant in SE1.');
  assert.equal(await page.locator('#interpret').isEnabled(), true);
});

test('cancellation and edits prevent a late result from replacing the description or results', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A slow Thai restaurant in SE1.');
  await page.waitForFunction(()=>/Reading/.test(document.querySelector('#interpret-status').textContent));
  await page.getByRole('button', { name:'Cancel', exact:true }).click();
  await page.waitForTimeout(850);
  assert.equal(await page.locator('#results-screen').isHidden(), true);
  assert.match(await page.locator('#interpret-status').innerText(), /cancelled/);
  await submit(page, 'A slow Thai restaurant in SE1.');
  await page.waitForFunction(()=>/Reading/.test(document.querySelector('#interpret-status').textContent));
  await page.locator('#description').fill('A new description.');
  await page.waitForTimeout(850);
  assert.equal(await page.locator('#results-screen').isHidden(), true);
  assert.equal(await page.locator('#description').inputValue(), 'A new description.');
});

test('download cancellation, unsupported devices and over-limit text recover without inventing a query', async t => {
  const { page } = await openPage(t, { loads:false });
  await submit(page, 'A Thai restaurant.');
  await page.locator('#model-progress').waitFor();
  await page.getByRole('button', { name:'Cancel', exact:true }).click();
  assert.equal(await page.locator('#model-progress').isHidden(), true);
  const { page:unsupported } = await openPage(t, { gpu:false });
  await submit(unsupported, 'A Thai restaurant.');
  await unsupported.locator('#clarification').waitFor();
  assert.match(await unsupported.locator('#interpret-status').innerText(), /WebGPU/);
  assert.equal(await unsupported.locator('#results-screen').isHidden(), true);
  await submit(unsupported, 'x'.repeat(1001));
  assert.match(await unsupported.locator('#description-error').innerText(), /1,000 characters/);
});

test('description and clarification render without overflow and keep keyboard focus visible', async t => {
  const { page } = await openPage(t);
  await page.locator('#description').focus();
  assert.equal(await page.locator('#description').evaluate(e=>getComputedStyle(e).outlineStyle!=='none'), true);
  assert.equal(await page.locator('#interpret').evaluate(e=>getComputedStyle(e).color), 'rgb(255, 255, 255)');
  if (process.env.PLOTLUCK_SCREENSHOTS) await page.screenshot({path:process.env.PLOTLUCK_SCREENSHOTS+'/free-text-desktop.png'});
  await submit(page, 'A Thai restaurant in London.');
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#clarification-heading').evaluate(e=>e===document.activeElement), true);
  if (process.env.PLOTLUCK_SCREENSHOTS) await page.screenshot({path:process.env.PLOTLUCK_SCREENSHOTS+'/free-text-clarification.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), true);
});

test('map and list stay scoped; the keyboard threshold persists for the same query and resets for a new one', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant.');
  await page.locator('#results-screen').waitFor();
  assert.equal(await page.locator('#ranked li').count(), 10);
  assert.equal(await page.evaluate(()=>document.activeElement.id), 'results-heading');
  const slider = page.getByRole('slider', { name:'Score threshold', exact:true });
  const height = await page.locator('.map-panel').evaluate(e=>e.offsetHeight);
  await slider.press('Home');
  const total = await page.locator('#ranked li').count();
  assert.ok(total > 10);
  assert.equal(await page.locator('.map-panel').evaluate(e=>e.offsetHeight), height);
  await slider.press('End');
  assert.equal(await page.locator('#ranked li').count(), 0);
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.getByRole('button', { name:'Edit description', exact:true }).click();
  await page.locator('#interpret').click();
  await page.locator('#results-screen').waitFor();
  assert.equal(await page.locator('#ranked li').count(), 0);
  await page.getByRole('button', { name:'Edit description', exact:true }).click();
  await submit(page, 'A Thai restaurant with gluten free options.');
  await page.locator('#results-screen').waitFor();
  assert.equal(await page.locator('#ranked li').count(), 10);
  assert.match(await page.locator('#confirmed-profile').innerText(), /Gluten free: Yes/);
  await page.locator('#ranked button').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.leaflet-tooltip').isVisible(), true);
  if (process.env.PLOTLUCK_SCREENSHOTS) await page.screenshot({path:process.env.PLOTLUCK_SCREENSHOTS+'/free-text-results.png'});
  assert.deepEqual(page.errors, []);
});

test('district coverage circles and list rows remain linked after free-text interpretation', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant.');
  await page.locator('#results-screen').waitFor();
  const third = page.locator('#ranked li button').nth(2);
  const code = await third.locator('.district-code').innerText();
  await third.click();
  assert.match(await third.getAttribute('class'), /is-highlighted/);
  const tooltip = page.locator('.leaflet-tooltip');
  assert.match(await tooltip.innerText(), new RegExp(`^#3 · ${code} · \\d\\.\\d{2,4}$`));
  await page.locator('#map').scrollIntoViewIfNeeded();
  const box = await page.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-tooltip').length === 1);
  const hovered = (await tooltip.innerText()).split(' · ')[1];
  assert.equal(await page.locator('#ranked button.is-highlighted .district-code').innerText(), hovered);
  await page.mouse.move(box.x + box.width + 40, box.y + 10);
  await page.locator('#ranked button.is-highlighted').waitFor({state:'detached'});
  assert.deepEqual(page.errors, []);
});

test('unknown locations can be clarified, while empty boundaries preserve the previous results', async t => {
  const { page } = await openPage(t);
  await submit(page, 'A Thai restaurant in Atlantis.');
  await page.locator('#clarification').waitFor();
  assert.equal(await page.locator('#results-screen').isHidden(), true);
  await page.locator('#clarify-area-text').fill('SE1');
  await page.locator('#clarify-area').selectOption('district:SE1');
  await page.locator('#clarify-compare').click();
  await page.locator('#results-screen').waitFor();
  const before = await page.locator('#ranked').textContent();
  await page.getByRole('button', { name:'Edit description', exact:true }).click();
  await submit(page, 'A Thai restaurant in Hugh Town.');
  await page.locator('#description-error').waitFor();
  assert.match(await page.locator('#description-error').innerText(), /No district centres/);
  assert.equal(await page.locator('#ranked').textContent(), before);
});

test('dishes fly out on their own under reduced motion while the kitchen day turns, and hidden tabs pause it', async t => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser, { reducedMotion:'reduce' });
  await page.goto(url);
  await page.locator('#kitchen[data-kitchen]').waitFor();
  assert.equal(await page.locator('#kitchen').getAttribute('data-kitchen'), 'still');
  const frames = Number(await page.locator('#kitchen').getAttribute('data-frames'));
  // Waited for, not timed: building the first dish can hold up a frame or two.
  await page.waitForFunction(before => Number(document.querySelector('#kitchen').dataset.frames) > before, frames, { timeout:5000 });
  // No input: the first dish comes out about 1.5 s after the kitchen appears.
  // Checked every frame, so the 1.1 s flight is not missed on a busy machine.
  await page.waitForFunction(() => document.querySelector('#kitchen').dataset.flying === '1', null, { polling:'raf', timeout:15000 });
  assert.ok(Number(await page.locator('#kitchen').getAttribute('data-dishes')) >= 1);
  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#kitchen').getAttribute('data-kitchen'), 'paused');
});

test('sky overrides and the night light remain available on the description screen', async t => {
  const { browser, url } = await openSite(t);
  const page = await newPage(browser);
  const kitchen = page.locator('#kitchen');
  for (const [sky, weather, light] of [['night','snow','on'], ['sunset','rain','off'], ['day','hail','off']]) {
    await page.goto(`${url}?sky=${sky}&weather=${weather}`);
    await page.locator('#kitchen[data-sky]').waitFor({state:'attached'});
    assert.equal(await kitchen.getAttribute('data-sky'), sky);
    assert.equal(await kitchen.getAttribute('data-light'), light);
    if (weather !== 'hail') assert.equal(await kitchen.getAttribute('data-weather'), weather);
    else assert.match(await kitchen.getAttribute('data-weather'), /^(sun|cloud|rain|snow)$/);
  }
  assert.deepEqual(page.errors, []);
});
