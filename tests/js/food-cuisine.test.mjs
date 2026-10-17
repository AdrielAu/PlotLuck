import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {loadBundle} from '../../web/scoring.js';
import {validateProfileExtraction} from '../../web/profile-extraction.js';
import {descriptionQuery,unreadDescription} from '../../web/description-query.js';

const bundle=await loadBundle(n=>readFile(new URL('../../web/models/'+n,import.meta.url),'utf8'));
const catalogue=JSON.parse(await readFile(new URL('../../web/models/geography.json',import.meta.url)));
const extract=(text,cuisine)=>validateProfileExtraction({region:'England',cuisine,price_band:'$$',venue_type:'Restaurant',rent:null,rent_band:'any',requirements:'no other requirements'},text,bundle.vocabulary,catalogue,{complete:true});
const description=food=>`A mid-range ${food} restaurant in England, any rent, no other requirements.`;

test('clear food names and literal cuisines survive absent or wrong model cuisine predictions',async()=>{
  for(const [food,cuisine] of [['dimsum','Chinese'],['dim sum','Chinese'],['dim-sum','Chinese'],['DIM  SUM','Chinese'],['Chinese','Chinese'],['Thai curry','Thai'],['sushi','Japanese'],['pizza','Italian'],['tacos','Mexican']]) {
    const text=description(food);
    const extraction=extract(text,'Italian');
    const query=await descriptionQuery(text,extraction,bundle,catalogue);
    assert.equal(query.profile.cuisine,cuisine,food);
    assert.ok(!query.needs.some(n=>n.field==='cuisine'),food);
    assert.ok(text.includes(query.fields.cuisine.evidence),food);
    const recovered=await unreadDescription(text,bundle,catalogue);
    assert.equal(recovered.profile.cuisine,cuisine,food);
  }
});

test('shared foods ask for relevant supported cuisines even if the model guesses one',async()=>{
  for(const guessed of [null,'Turkish','Middle Eastern']) {
    const text=description('kebab');
    const q=await descriptionQuery(text,extract(text,guessed),bundle,catalogue);
    assert.equal(q.profile.cuisine,null);
    const options=q.needs.find(n=>n.field==='cuisine').options;
    assert.ok(options.includes('Turkish'));
    assert.ok(options.includes('Middle Eastern'));
    assert.ok(options.length<=8);
    assert.ok(!options.includes('Chinese'));
    assert.ok(options.every(name=>bundle.vocabulary.cuisines.some(c=>c.cuisine===name)));
  }
  const text=description('Thai kebab');
  const q=await descriptionQuery(text,extract(text,null),bundle,catalogue);
  assert.equal(q.profile.cuisine,'Thai');
});

test('negated foods, unrelated substrings and mixed foods never silently choose a cuisine',async()=>{
  for(const food of ['not dim sum','no sushi','without pizza','sushilicious','dim sum or sushi','dim sum and sushi','curry']) {
    const text=description(food);
    const q=await descriptionQuery(text,extract(text,null),bundle,catalogue);
    assert.equal(q.profile.cuisine,null,food);
    assert.ok(q.needs.some(n=>n.field==='cuisine'),food);
  }
  const text=description('not Chinese but dim sum');
  const q=await descriptionQuery(text,extract(text,'Chinese'),bundle,catalogue);
  assert.equal(q.profile.cuisine,null);
  assert.ok(!q.needs.find(n=>n.field==='cuisine').options.includes('Chinese'));
});

test('the historical five-field proof still requires literal cuisine evidence',()=>{
  assert.throws(()=>validateProfileExtraction({region:'England',cuisine:'Chinese',price_band:'$$',venue_type:'Restaurant',rent:null},description('dim sum'),bundle.vocabulary,catalogue),/cuisine/);
});
