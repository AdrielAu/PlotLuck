// Replay only synthetic approved development reports; no new model inference.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateInterpretation } from '../web/interpreter.js';
import { placeCandidates } from '../web/grounded-interpreter.js';
const root = new URL('../',import.meta.url);
const input = process.argv[2];
if (!input) throw new Error('Provide the synthetic baseline report path.');
const bytes = await readFile(input);
const report = JSON.parse(bytes);
const vocabulary = JSON.parse(await readFile(new URL('web/models/vocabulary.json',root)));
const catalogueBytes = await readFile(new URL('web/models/geography.json',root));
const catalogue = JSON.parse(catalogueBytes);
const benchmark = JSON.parse(await readFile(new URL('tests/fixtures/nn2-benchmark.json',root)));
const results = report.results.map(r=>{
  const expected = benchmark.cases.find(c=>c.split==='development' && c.id===r.id && c.description===r.description);
  if (!expected) throw new Error('Use unchanged approved development cases only.');
  try {
    if (r.error) throw new Error(r.error);
    const draft = validateInterpretation(r.reply,r.description,vocabulary);
    const candidates = placeCandidates(draft.location.text,catalogue);
    const correct = draft.profile.cuisine===expected.expected.cuisine &&
      Object.entries(expected.expected.location).every(([k,v])=>draft.location[k]===v) &&
      Object.entries(expected.expected.traits).every(([k,v])=>draft.profile[k]===v);
    return {id:r.id,validated:true,correct,candidates:candidates.map(({id,name,type})=>({id,name,type})),
      correct_with_candidates:correct && (draft.location.text===null || candidates.length>0)};
  } catch(error) {return {id:r.id,validated:false,correct:false,correct_with_candidates:false,error:error.message};}
});
const summary = {baseline_sha256:createHash('sha256').update(bytes).digest('hex'),
  catalogue_sha256:createHash('sha256').update(catalogueBytes).digest('hex'),evaluated:results.length,
  correct_before_lookup:results.filter(r=>r.correct).length,
  correct_with_candidates:results.filter(r=>r.correct_with_candidates).length,
  note:'Lookup provides catalogue candidates without changing any extracted value or repairing failures. Candidate availability is not confirmed/resolved location correctness. Replay is not a new model run or latency measurement.',results};
await writeFile(`${input}.lookup.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
