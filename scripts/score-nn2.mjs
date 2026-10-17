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
  try {
    const draft = validateInterpretation(r.reply, r.description, vocabulary);
    const cuisine = draft.profile.cuisine === expected.expected.cuisine;
    const location = Object.entries(expected.expected.location).every(([k,v]) => draft.location[k] === v);
    const traits = Object.entries(expected.expected.traits).every(([k,v]) => draft.profile[k] === v);
    return { id: r.id, cuisine, location, traits, correct: cuisine && location && traits, seconds: r.seconds };
  } catch (error) { return { id: r.id, correct: false, error: error.message, seconds: r.seconds }; }
});
const seconds = results.map(r => r.seconds).sort((a,b) => a-b);
const summary = { label_status: benchmark.label_status, evaluated: results.length, correct: results.filter(r => r.correct).length,
  warm_p95_seconds: seconds[Math.max(0, Math.ceil(seconds.length * .95)-1)], results };
await writeFile(`${path}.scores.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
