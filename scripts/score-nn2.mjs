// Only synthetic operator reports. Validation errors remain failures in the denominator.
import { readFile, writeFile } from 'node:fs/promises';
import { validateInterpretation } from '../web/interpreter.js';
const root = new URL('../', import.meta.url);
const vocabulary = JSON.parse(await readFile(new URL('web/models/vocabulary.json', root)));
const benchmark = JSON.parse(await readFile(new URL('tests/fixtures/nn2-benchmark.json', root)));
const path = process.argv[2];
if (!path) throw new Error('Provide the synthetic runtime report JSON path.');
const report = JSON.parse(await readFile(path));
const results = report.results.map(r => {
  const expected = benchmark.cases.find(c => c.id === r.id);
  if (!expected || expected.description !== r.description) throw new Error('Unknown or modified benchmark case.');
  let json;
  try { json = JSON.parse(r.reply); }
  catch (error) { return { id: r.id, json_valid: false, validated: false, correct: false, error: r.error ?? error.message, seconds: r.seconds }; }
  try {
    const draft = validateInterpretation(json, r.description, vocabulary);
    const cuisine = draft.profile.cuisine === expected.expected.cuisine;
    const location = Object.entries(expected.expected.location).every(([k,v]) => draft.location[k] === v);
    const traits = Object.entries(expected.expected.traits).every(([k,v]) => draft.profile[k] === v);
    return { id: r.id, json_valid: true, validated: true, cuisine, location, traits,
      correct: !r.error && cuisine && location && traits, ...(r.error ? { error: r.error } : {}), seconds: r.seconds };
  } catch (error) { return { id: r.id, json_valid: true, validated: false, correct: false, error: r.error ?? error.message, seconds: r.seconds }; }
});
const seconds = results.map(r => r.seconds).filter(s => Number.isFinite(s) && s >= 0).sort((a,b) => a-b);
const summary = { label_status: benchmark.label_status, evaluated: results.length, correct: results.filter(r => r.correct).length,
  json_valid: results.filter(r => r.json_valid).length, validated: results.filter(r => r.validated).length,
  components: Object.fromEntries(['cuisine', 'location', 'traits'].map(k => [k, results.filter(r => r[k]).length])),
  latency_samples: seconds.length, warm_p95_seconds: seconds.length ? seconds[Math.ceil(seconds.length * .95)-1] : null,
  latency_statistic: 'Nearest-rank sample p95, including timed failures; missing timings excluded and counted separately.',
  release_evaluation: false,
  release_note: 'Diagnostic report only. Development cases, repeated cases or a small sample do not establish the 100-case release gates. Inferred-proposal acceptability requires separate human review.',
  results };
await writeFile(`${path}.scores.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
