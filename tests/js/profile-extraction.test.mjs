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
