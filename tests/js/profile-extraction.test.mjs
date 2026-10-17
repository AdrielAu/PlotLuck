import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {profileSchema,validateProfileExtraction} from '../../web/profile-extraction.js';
const vocabulary=JSON.parse(await readFile(new URL('../../web/models/vocabulary.json',import.meta.url)));
const catalogue=JSON.parse(await readFile(new URL('../../web/models/geography.json',import.meta.url)));
const description='An inexpensive Thai cafe in London, rent budget £2,000 per month.';
const reply=()=>({region:'London',cuisine:'Thai',price_band:'$',venue_type:'Café',rent:{amount:2000,period:'month',currency:'GBP'}});

test('five extracted inputs adapt to the shipped profile and preserve total rent budget separately',()=>{
  const result=validateProfileExtraction(reply(),description,vocabulary,catalogue);
  assert.equal(result.draft.profile.price_band,'$');
  assert.equal(result.draft.profile.venue_type,'Café');
  assert.equal(result.rentBudget.annualGBP,24000);
  assert.equal(result.rentBand,'any');
  assert.equal(result.rentNeedsReview,true);
  assert.equal(Object.hasOwn(result.draft.profile,'commercial_rent_index'),false);
  assert.ok(result.candidates.some(p=>p.name==='Greater London'));
  assert.deepEqual(Object.keys(profileSchema(vocabulary).properties),['region','cuisine','price_band','venue_type','rent']);
});

test('the reported mid Range wording preserves literal evidence and reaches London choices',()=>{
  for (const phrase of ['mid Range', 'mid-range', 'midrange']) {
    const text=`A ${phrase} thai restaurant in London`;
    const r={region:'London',cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null};
    const result=validateProfileExtraction(r,text,vocabulary,catalogue);
    assert.equal(result.draft.profile.price_band,'$$');
    assert.equal(result.draft.fields.price_band.evidence,phrase);
    assert.ok(result.candidates.some(p=>p.name==='Greater London'));
    assert.ok(result.candidates.some(p=>p.name==='City of London'));
  }
});

test('the product can clarify a rejected price without accepting it or weakening proof validation',()=>{
  const text='A mid Range thai restaurant in London';
  const r={region:'London',cuisine:'Thai',price_band:'$',venue_type:'Restaurant',rent:null};
  assert.throws(()=>validateProfileExtraction(r,text,vocabulary,catalogue),/price band/);
  const result=validateProfileExtraction(r,text,vocabulary,catalogue,{clarifyInvalidPrice:true});
  assert.equal(result.priceNeedsReview,true);
  assert.equal(result.draft.profile.price_band,'unknown');
  assert.equal(result.draft.profile.cuisine,'Thai');
  assert.equal(result.draft.location.text,'London');
});

test('menu prices and relative rent have separate evidence in the reported description',()=>{
  const text='i want to open a thai restaurant in greater manchester that serves mid price range food. i want as cheap rent as possible';
  const r={region:'Greater Manchester',cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null,requirements:null,rent_band:'low'};
  const result=validateProfileExtraction(r,text,vocabulary,catalogue,{complete:true});
  assert.equal(result.draft.profile.price_band,'$$');
  assert.equal(result.rentBand,'low');
  assert.equal(result.rentNeedsReview,false);
  assert.ok(result.candidates.some(p=>p.name==='Greater Manchester'));
});

test('cheap rent cannot validate cheap menu prices and expensive menus cannot validate high rent',()=>{
  for(const text of ['Thai restaurant with cheap rent.','Thai restaurant, rent as cheap as possible.']) {
    const r={region:null,cuisine:'Thai',price_band:'$',venue_type:'Restaurant',rent:null,requirements:null};
    const result=validateProfileExtraction(r,text,vocabulary,catalogue,{complete:true});
    assert.equal(result.priceNeedsReview,true,text);
    assert.equal(result.draft.profile.price_band,'unknown');
  }
  const text='Thai restaurant with expensive menu prices and cheap rent.';
  const result=validateProfileExtraction({region:null,cuisine:'Thai',price_band:'$$$',venue_type:'Restaurant',rent:null,requirements:null,rent_band:'high'},text,vocabulary,catalogue,{complete:true});
  assert.equal(result.draft.profile.price_band,'$$$');
  assert.equal(result.rentBand,'low');
  assert.equal(result.draft.fields.rent_band.evidence,'cheap');
});

test('literal source wording corrects wrong model costs and omitted acknowledgements without inventing missing inputs',()=>{
  const text='A premium Thai restaurant with cheap rent. No other requirements.';
  const result=validateProfileExtraction({region:null,cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null,rent_band:'high',requirements:'none'},text,vocabulary,catalogue,{complete:true});
  assert.equal(result.draft.profile.price_band,'$$$');
  assert.equal(result.rentBand,'low');
  assert.equal(result.requirementsText,'No other requirements');
  const numeric='A Thai restaurant with rent budget GBP 2000 per month.';
  const budget=validateProfileExtraction({region:null,cuisine:'Thai',price_band:'unknown',venue_type:'Restaurant',rent:{amount:2000,period:'month',currency:'GBP'},rent_band:null,requirements:null},numeric,vocabulary,catalogue,{complete:true});
  assert.equal(budget.draft.fields.rent_band.provenance,'default');
  assert.equal(budget.draft.fields.price_band.provenance,'default');
});

test('conflicting cost descriptions cannot be resolved by selecting a convenient model prediction',()=>{
  const text='Thai restaurant with cheap or premium food and low or high rent.';
  const result=validateProfileExtraction({region:null,cuisine:'Thai',price_band:'$',venue_type:'Restaurant',rent:null,rent_band:'low',requirements:null},text,vocabulary,catalogue,{complete:true});
  assert.equal(result.priceNeedsReview,true);
  assert.equal(result.draft.fields.rent_band.provenance,'default');
  assert.ok(result.unresolvedFields.includes('rent_band'));
});

test('opposite menu and rent preferences stay independent, including negated rent',()=>{
  for(const [food,rent,price,band] of [['cheap','premium','$','high'],['premium','cheap','$$$','low'],['mid price range','moderate','$$','mid']]) {
    const text=`Thai restaurant with ${food} food and ${rent} rent.`;
    const result=validateProfileExtraction({region:null,cuisine:'Thai',price_band:price,venue_type:'Restaurant',rent:null,rent_band:band,requirements:null},text,vocabulary,catalogue,{complete:true});
    assert.equal(result.draft.profile.price_band,price);
    assert.equal(result.rentBand,band);
    assert.equal(result.rentNeedsReview,false);
  }
  const text='Thai restaurant with mid-range food and not cheap rent.';
  const result=validateProfileExtraction({region:null,cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null,rent_band:'low',requirements:null},text,vocabulary,catalogue,{complete:true});
  assert.ok(result.unresolvedFields.includes('rent_band'));
});

test('unmentioned rent remains absent and extra model features never enter the profile',()=>{
  const r={region:'London',cuisine:'Thai',price_band:'unknown',venue_type:'Restaurant',rent:null};
  const result=validateProfileExtraction(r,'Thai restaurant in London with vegan options.',vocabulary,catalogue);
  assert.equal(result.rentBudget,null);
  assert.equal(result.draft.fields.vegan_options.provenance,'default');
  assert.throws(()=>validateProfileExtraction({...r,vegan_options:true},'Thai restaurant in London',vocabulary,catalogue));
});

test('fabricated values, wrong currencies and unstated rent periods are rejected',()=>{
  for (const change of [r=>{r.cuisine='Italian';},r=>{r.region='Cambridge';},r=>{r.rent.amount=3000;},
    r=>{r.rent.currency='USD';},r=>{r.rent.period='year';},r=>{r.price_band='$$$$';}]) {
    const r=reply();change(r);assert.throws(()=>validateProfileExtraction(r,description,vocabulary,catalogue));
  }
  assert.throws(()=>validateProfileExtraction({...reply(),rent:null},description,vocabulary,catalogue),/rent budget/i);
});

test('rent amount and period must belong to the premises rent rather than unrelated menu text',()=>{
  for (const [description,amount,period] of [
    ['Thai restaurant in London. Menu £20; rent £2000 per month.',20,'month'],
    ['Thai restaurant in London with a £20 menu and a new menu each month.',20,'month'],
    ['Thai restaurant in London. Rent not specified, menu £20 per month.',20,'month'],
    ['Thai restaurant in London, rent £2000 per month; the menu changes yearly.',2000,'year'],
  ]) {
    assert.throws(()=>validateProfileExtraction({region:'London',cuisine:'Thai',price_band:'unknown',venue_type:'Restaurant',rent:{amount,period,currency:'GBP'}},description,vocabulary,catalogue));
  }
});

test('narrowed metrics stay separate from the original full-trait benchmark',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'plotluck-profile-'));
  try {
    const description='A Thai restaurant within 3 km of London with vegan options.';
    const result=validateProfileExtraction({region:'London',cuisine:'Thai',price_band:'unknown',venue_type:'Restaurant',rent:null},description,vocabulary,catalogue);
    const {profile,...normalized}=result.draft;
    const path=join(directory,'report.json');
    await writeFile(path,JSON.stringify({results:[{id:'clear-001',description,reply:JSON.stringify(normalized),rentBudget:null,seconds:2}]}));
    execFileSync(process.execPath,['scripts/score-profile-inputs.mjs',path]);
    execFileSync(process.execPath,['scripts/score-nn2.mjs',path]);
    assert.equal(JSON.parse(await readFile(`${path}.profile-inputs.scores.json`)).correct,1);
    assert.equal(JSON.parse(await readFile(`${path}.scores.json`)).correct,0);
  } finally {await rm(directory,{recursive:true,force:true});}
});
