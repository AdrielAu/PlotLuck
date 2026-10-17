// NN2 preview recovery through the current MVP results/confirmation surface.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {answerQuestions,newPage,openSite} from './site.mjs';

test('experimental NN2 preserves MVP answers and offers bounded manual recovery',async(t)=>{
  const {browser,url}=await openSite(t);
  const page=await newPage(browser);
  await page.goto(url+'?nn2=1');
  const cuisine=page.getByRole('combobox',{name:'Cuisine',exact:true});
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
          if (data.description === 'Italian restaurant in London with vegan options.' || data.description === 'Slow Italian restaurant in London.') {
            const profile = {cuisine:'Italian',venue_type:'Restaurant',price_band:'unknown',chain:false,vegetarian_friendly:false,vegan_options:false,gluten_free:false};
            const fields = Object.fromEntries(Object.entries(profile).map(([name,value])=>[name,{value,provenance:'default',evidence:null}]));
            fields.cuisine={value:'Italian',provenance:'explicit',evidence:'Italian'};
            const success=()=>this.onmessage?.({data:{id:data.id,draft:{profile,fields,location:{text:'London',near:false,distance:null,unit:null},unused:[],clarifications:[]},
              candidates:data.catalogue.places.filter(p=>p.name==='Greater London' || p.name==='City of London')}});
            if (data.description.startsWith('Slow')) setTimeout(success,300);else queueMicrotask(success);
            return;
          }
          const deliver = () => this.onmessage?.({data:{id:data.id,error:'Invalid synthetic model output.'}});
          if (data.description.startsWith('Slow')) setTimeout(deliver,300);
          else queueMicrotask(deliver);
        }
        terminate() {} // Deliberately deliver late replies to exercise stale-response protection.
      };
    });
    await page.goto(`${page.url().split('?')[0]}?nn2=1`);
    await answerQuestions(page, ['anywhere','Thai','','','','vegan options']);
    await page.locator('#review-compare').click();
    await page.locator('#results-screen').waitFor();
    // The pickers panel starts collapsed; open it once and it stays open for the later steps.
    await page.getByText('Edit your restaurant',{exact:true}).click();
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
      await page.setViewportSize({width:1280,height:1000});
      await page.locator('#profile-controls').screenshot({path:`${process.env.PLOTLUCK_SCREENSHOTS}/plotluck-recovery-desktop.png`});
    }
    await page.getByRole('button',{name:'Enter details myself'}).click();
    assert.equal(await cuisine.evaluate(element=>element===document.activeElement),true);
    await cuisine.fill('Italian');await cuisine.press('Enter');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#results-heading').innerText(),/Italian/);
    assert.match(await page.locator('#confirmed-profile').innerText(),/Vegan options: Yes/);

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
    assert.match(await page.locator('#results-heading').innerText(),/Italian.*City of London/);
    assert.match(await page.locator('#confirmed-profile').innerText(),/Vegan options: Yes/);
  });

  await t.test("an explicit unresolved area blocks comparison and a chosen place scopes results", async () => {
    const confirmed = await page.locator('#confirmed-profile').innerText();
    await page.getByLabel('Place name',{exact:true}).fill('Atlantis');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Choose a valid search area/);
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    await page.getByLabel('Place name',{exact:true}).fill('London');
    await page.locator('#place-choice:not([disabled])').waitFor();
    assert.equal(await page.locator('#place-choice').inputValue(),'');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Choose a valid search area/);
    await page.locator('#place-choice').selectOption('E09000001');
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#results-heading').innerText(),/City of London/);
    const visible = await page.locator('#ranked .district-code').allTextContents();
    const catalogue = JSON.parse(await readFile(new URL('../../web/models/geography.json',import.meta.url)));
    const allowed = new Set(catalogue.places.find(p=>p.id==='E09000001').districts);
    assert.ok(visible.length>0 && visible.every(code=>allowed.has(code)));

  });

  await t.test('a total rent budget preserves period and annual value without overwriting NN1 district rent',async()=>{
    const confirmed=await page.locator('#confirmed-profile').innerText();
    await page.getByLabel('Place name',{exact:true}).fill('');
    await page.getByLabel('Total rent budget (£)',{exact:true}).fill('2000');
    await page.getByLabel('Rent budget period',{exact:true}).selectOption('month');
    await page.getByLabel('Total rent budget (£)',{exact:true}).press('Tab');
    assert.match(await page.locator('#rent-summary').innerText(),/24,000 per year/);
    assert.match(await page.locator('#rent-summary').innerText(),/not used in scoring/);
    assert.equal(await page.locator('#confirmed-profile').innerText(),confirmed);
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#profile-error').innerText(),/Confirm a rent band/);
    await page.getByRole('radio',{name:'Low',exact:true}).check();
    await page.getByRole('button',{name:'Compare districts',exact:true}).click();
    assert.match(await page.locator('#confirmed-profile').innerText(),/24,000\/year \(not used in scoring\)/);
    assert.match(await page.locator('#confirmed-profile').innerText(),/Rent band: Low/);
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

  await t.test('changing area cancels a slow successful interpretation before opening manual questions',async()=>{
    const area=await page.locator('#area-label').innerText();
    const requests=await page.evaluate(()=>window.__interpretRequests);
    await page.getByLabel('Restaurant description',{exact:true}).fill('Slow Italian restaurant in London.');
    await page.locator('#interpret').click();
    await page.waitForFunction(before=>window.__interpretRequests>before,requests);
    await page.locator('#change-area').click();
    assert.equal(await page.locator('#questions-screen').isVisible(),true);
    assert.equal(await page.locator('#compare').isEnabled(),true);
    await page.locator('#answer').fill('SE1');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#answer').inputValue(),'SE1');
    assert.equal(await page.locator('#area-label').innerText(),area);
    assert.match(await page.locator('#interpret-status').innerText(),/cancelled/);
  });

  await t.test('a delayed place lookup cannot replace an area confirmed through the questions',async()=>{
    const delayed=await newPage(browser);
    let release,requested;
    const gate=new Promise(resolve=>{release=resolve;});
    const started=new Promise(resolve=>{requested=resolve;});
    await delayed.route('**/models/geography.json',async route=>{requested();await gate;await route.continue();});
    try {
      await delayed.goto(url+'?nn2=1');
      await answerQuestions(delayed,['anywhere','Thai','','','','']);
      await delayed.locator('#review-compare').click();
      await delayed.getByText('Edit your restaurant',{exact:true}).click();
      await delayed.getByLabel('Place name',{exact:true}).fill('London');
      await started;
      await delayed.locator('#change-area').click();
      await answerQuestions(delayed,['SE1','Thai','','','','']);
      await delayed.locator('#review-compare').click();
      assert.match(await delayed.locator('#results-heading').innerText(),/Thai · SE1/);
      const response=delayed.waitForResponse('**/models/geography.json');
      release();await (await response).finished();
      await delayed.waitForTimeout(200);
      await delayed.locator('#compare').click();
      assert.equal(await delayed.locator('#profile-error').isHidden(),true);
      assert.match(await delayed.locator('#results-heading').innerText(),/Thai · SE1/);
      assert.match(await delayed.locator('#profile-status').innerText(),/Results match/);
      assert.deepEqual(delayed.errors,[]);
    } finally {release();await delayed.close();}
  });
  assert.deepEqual(page.errors,[]);
});
