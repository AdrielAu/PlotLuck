import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('proof scoring separates syntax, validation, semantics and runtime failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plotluck-proof-'));
  try {
    const path = join(directory, 'report.json');
    const description = 'A Thai restaurant in Camden.';
    const draft = { fields: { cuisine: { value: 'Thai', provenance: 'explicit', evidence: 'Thai' } },
      location: { text: 'Camden', near: false, distance: null, unit: null }, unused: [], clarifications: [] };
    const correct = { id: 'clear-002', description, reply: JSON.stringify(draft), seconds: 2 };
    const wrong = structuredClone(draft);
    wrong.location = { text: null, near: false, distance: null, unit: null };
    await writeFile(path, JSON.stringify({ results: [correct,
      { ...correct, reply: JSON.stringify(wrong), seconds: 3 },
      { ...correct, reply: '{', seconds: 4 },
      { ...correct, error: 'Interpretation was truncated.', seconds: undefined } ] }));
    execFileSync(process.execPath, ['scripts/score-nn2.mjs', path]);
    const summary = JSON.parse(await readFile(`${path}.scores.json`));
    assert.equal(summary.evaluated, 4);
    assert.equal(summary.json_valid, 3);
    assert.equal(summary.validated, 3);
    assert.equal(summary.correct, 1);
    assert.equal(summary.components.cuisine, 3);
    assert.equal(summary.components.location, 2);
    assert.equal(summary.latency_samples, 3);
    assert.equal(summary.warm_p95_seconds, 4);
    assert.equal(summary.release_evaluation, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
