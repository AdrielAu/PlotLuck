import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {loadBundle} from '../../web/scoring.js';
import {validateProfileExtraction} from '../../web/profile-extraction.js';
import {descriptionQuery, confirmedDescription} from '../../web/description-query.js';

const bundle=await loadBundle(n=>readFile(new URL(`../../data/sample/${n}`,import.meta.url),'utf8'));
const place={id:'greater',name:'Greater London',aliases:['london'],type:'region',context:'England',lat:51.5,lon:-0.1,districts:['SE1']};
const catalogue={places:[place,{...place,id:'city',name:'City of London'}]};

test('A restaurant in london asks Erica\'s questions for every missing input',async()=>{
  const text='A restaurant in london';
  const result=validateProfileExtraction({region:'london',cuisine:null,price_band:'unknown',venue_type:'Restaurant',rent:null},text,bundle.vocabulary,catalogue);
  const q=await descriptionQuery(text,result,bundle,catalogue);
  assert.deepEqual(q.needs.map(n=>n.field),['area','cuisine','price','rent','other']);
  assert.deepEqual(q.needs.map(n=>n.message),['Where would you like to open?','What food will you serve?','How are your menu prices?','How much rent can you take on?','Anything else diners should know?']);
  assert.throws(()=>confirmedDescription(q,bundle,catalogue));
});

test('absent area now needs a city choice alongside the other missing fields',async()=>{
  const text='A restaurant';
  const result=validateProfileExtraction({region:null,cuisine:null,price_band:'unknown',venue_type:'Restaurant',rent:null},text,bundle.vocabulary,catalogue);
  const q=await descriptionQuery(text,result,bundle,catalogue);
  assert.equal(q.area,null);
  assert.deepEqual(q.needs.map(n=>n.field),['area','cuisine','price','rent','other']);
});

test('an invalid cuisine does not discard an independently valid restaurant type or location',()=>{
  const text='A restaurant in london';
  const result=validateProfileExtraction({region:'London',cuisine:'Italian',price_band:'unknown',venue_type:'Restaurant',rent:null,requirements:null},text,bundle.vocabulary,catalogue,{complete:true});
  assert.equal(result.draft.profile.cuisine,null);
  assert.equal(result.draft.profile.venue_type,'Restaurant');
  assert.equal(result.draft.location.text,'london');
});

test('a complete description scores directly and every missing completion blocks scoring',async()=>{
  const text='A mid-range Thai restaurant in England, any rent, no other requirements.';
  const result=validateProfileExtraction({region:'England',cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:null,requirements:'no other requirements'},text,bundle.vocabulary,catalogue,{complete:true});
  const q=await descriptionQuery(text,result,bundle,catalogue);
  assert.deepEqual(q.needs,[]);
  assert.equal(confirmedDescription(q,bundle,catalogue).searchArea.length,bundle.districts.length);
  for(const field of ['area','cuisine','price','rent','venue','other']) {
    q.completion[field]=false;
    assert.throws(()=>confirmedDescription(q,bundle,catalogue),/Please answer/);
    q.completion[field]=true;
  }
});

test('invented other requirements and unsupported rent never count as completed inputs',async()=>{
  const text='A mid-range Thai restaurant in England, any rent.';
  const result=validateProfileExtraction({region:'England',cuisine:'Thai',price_band:'$$',venue_type:'Restaurant',rent:{amount:500,period:'month',currency:'USD'},requirements:'vegan options'},text,bundle.vocabulary,catalogue,{complete:true});
  const q=await descriptionQuery(text,result,bundle,catalogue);
  assert.deepEqual(q.needs.map(n=>n.field),['rent','other']);
  assert.equal(q.rentBudget,null);
  assert.equal(q.rentBudgetNeedsReview,true);
  assert.equal(q.profile.vegan_options,false);
});
