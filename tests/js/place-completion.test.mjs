import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {loadBundle} from '../../web/scoring.js';
import {makeInterpreter} from '../../web/interpret.js';
import {validateProfileExtraction} from '../../web/profile-extraction.js';
import {descriptionQuery,unreadDescription} from '../../web/description-query.js';

const bundle=await loadBundle(n=>readFile(new URL('../../web/models/'+n,import.meta.url),'utf8'));
const catalogue=JSON.parse(await readFile(new URL('../../web/models/geography.json',import.meta.url)));
const extraction=(text,region)=>validateProfileExtraction({region,cuisine:'Italian',price_band:'unknown',venue_type:'Pub and bar',rent:null,rent_band:null,requirements:null},text,bundle.vocabulary,catalogue,{complete:true});

test('high end and high-end describe premium menu prices, not premises rent',()=>{
  for(const wording of ['high end','high-end']) {
    const text=`An ${wording} italian pub in hammersmith`;
    const r=extraction(text,'hammersmith');
    assert.equal(r.draft.profile.price_band,'$$$');
    assert.equal(r.draft.fields.venue_type.value,'Pub and bar');
    assert.equal(r.draft.fields.rent_band.provenance,'default');
  }
});

test('Hammersmith offers its labelled borough boundary without silently equating neighbourhood and borough',()=>{
  const reader=makeInterpreter(bundle,undefined,catalogue);
  assert.ok(reader.areaCandidates('hammersmith').some(a=>a.code==='E09000013' && /borough/.test(a.label)));
  assert.equal(reader.readArea('hammersmith'),null);
  assert.equal(reader.readArea('Hammersmith and Fulham borough').code,'E09000013');
  assert.ok(reader.areaCandidates('London').some(a=>a.code==='E12000007'));
  assert.ok(reader.areaCandidates('Borough Green').some(a=>a.label.startsWith('Borough Green ')));
});

test('an omitted or unresolved place asks for an English city or another resolution',async()=>{
  for(const region of [null,'Atlantis']) {
    const text='An high end Italian pub'+(region ? ' in Atlantis' : '');
    const q=await descriptionQuery(text,extraction(text,region),bundle,catalogue);
    assert.equal(q.area,null);
    const need=q.needs.find(n=>n.field==='area');
    assert.ok(need);
    assert.ok(need.options.some(p=>p.label.startsWith('Manchester ')));
    assert.ok(need.options.some(p=>p.label.startsWith('York ')));
    assert.ok(need.options.every(p=>catalogue.places.some(place=>place.id===p.code)));
  }
});

test('an explicitly requested England-wide search remains valid',async()=>{
  const text='An high end Italian pub in England';
  const q=await descriptionQuery(text,extraction(text,'England'),bundle,catalogue);
  assert.equal(q.area.kind,'england');
  assert.ok(!q.needs.some(n=>n.field==='area'));
});

test('the exact mid range Chinese prompt retains stated prices even after an unreadable model reply',async()=>{
  const text='A mid range chinese restaurant in hammersmith';
  const q=await unreadDescription(text,bundle,catalogue);
  assert.equal(q.profile.price_band,'$$');
  assert.ok(!q.needs.some(n=>n.field==='price'));
  assert.ok(q.needs.find(n=>n.field==='area').options.some(p=>p.code==='E09000013'));
});

test('near a city without a distance uses the city boundary rather than a default radius',async()=>{
  const text='A mid range Italian pub near York';
  const q=await descriptionQuery(text,extraction(text,'York'),bundle,catalogue);
  assert.equal(q.radius,null);
  assert.ok(q.needs.find(n=>n.field==='area').options.some(p=>p.code==='E06000014'));
});
