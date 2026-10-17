// The user's narrowed five-input contract. Never rewrite the original full-trait scores.
import {readFile,writeFile} from 'node:fs/promises';
import {validateInterpretation} from '../web/interpreter.js';
const root=new URL('../',import.meta.url);
const vocabulary=JSON.parse(await readFile(new URL('web/models/vocabulary.json',root)));
const benchmark=JSON.parse(await readFile(new URL('tests/fixtures/nn2-benchmark.json',root)));
const path=process.argv[2];
if (!path) throw new Error('Provide a synthetic development report.');
const report=JSON.parse(await readFile(path));
const results=report.results.map(r=>{
  const c=benchmark.cases.find(c=>c.split==='development' && c.id===r.id && c.description===r.description);
  if (!c) throw new Error('Use unchanged approved development descriptions.');
  // This fixture covers cuisine/location/type and omitted menu price/rent only.
  if (/\brent\b|£|\bGBP\b/i.test(c.description)) throw new Error('Explicit rent needs separately approved expected labels.');
  try {
    if (r.error) throw new Error(r.error);
    const draft=validateInterpretation(r.reply,r.description,vocabulary);
    const cuisine=draft.profile.cuisine===c.expected.cuisine;
    const region=Object.entries(c.expected.location).every(([k,v])=>draft.location[k]===v);
    const venue_type=draft.profile.venue_type===c.expected.traits.venue_type;
    const price_default=draft.profile.price_band===vocabulary.traits.find(t=>t.name==='price_band').default;
    const rent_absence=r.rentBudget==null;
    return {id:r.id,validated:true,cuisine,region,venue_type,price_default,rent_absence,
      correct:cuisine && region && venue_type && price_default && rent_absence,seconds:r.seconds};
  } catch(error) {return {id:r.id,validated:false,correct:false,error:error.message,seconds:r.seconds};}
});
const summary={contract:'User clarification: search area, cuisine, menu price band, restaurant type, total rent budget.',
  evaluated:results.length,correct:results.filter(r=>r.correct).length,
  coverage:'Approved cases have no explicit menu prices or rent budgets. Those two inputs are tested for absence/defaults only; explicit extraction quality remains unmeasured. Dietary flags are outside this narrowed metric.',
  components:Object.fromEntries(['cuisine','region','venue_type','price_default','rent_absence'].map(k=>[k,results.filter(r=>r[k]).length])),
  release_evaluation:false,results};
await writeFile(`${path}.profile-inputs.scores.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
