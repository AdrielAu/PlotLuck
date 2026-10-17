// Explicit operator invocation permits model download. No production user prompts.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch, release, totalmem } from 'node:os';
import { NN2 } from '../web/nn2-runtime.js';
const { chromium } = await import(process.env.PLOTLUCK_PLAYWRIGHT ?? 'playwright');
const root = new URL('../', import.meta.url);
const mode = process.env.PLOTLUCK_NN2_MODE ?? 'baseline';
if (!['baseline','grounded','focused'].includes(mode)) throw new Error('Use baseline, grounded or focused mode.');
const benchmark = JSON.parse(await readFile(new URL('tests/fixtures/nn2-benchmark.json', root)));
// Keep heldout descriptions AND expected labels outside the browser experiment.
const cases = benchmark.cases.filter(c => c.split === 'development').map(({id, description}) => ({id, description}));
const hashes = {};
for (const path of ['web/interpreter.js', 'web/grounded-interpreter.js', 'web/profile-extraction.js', 'web/models/geography.json', 'web/nn2-worker.js', 'web/nn2-runtime.js', 'web/models/vocabulary.json',
  'tests/fixtures/nn2-benchmark.json', 'scripts/prove-nn2-browser.mjs', 'scripts/score-nn2.mjs']) {
  hashes[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
}
const server = createServer(async (request, response) => {
  const file = new URL(`.${new URL(request.url, 'http://localhost').pathname}`, root);
  if (!file.href.startsWith(root.href)) return response.writeHead(403).end();
  try { const body = await readFile(file); response.writeHead(200, {'Content-Type': file.pathname.endsWith('.js') ? 'text/javascript' : 'application/json'}).end(body); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLOTLUCK_BROWSER ? {executablePath:process.env.PLOTLUCK_BROWSER} : {}) });
let report;
const transfers=[];
const measurements=[];
const transferFailures=[];
try {
  const page = await browser.newPage();
  page.context().on('requestfinished', request => {
    if (!request.url().startsWith('http://127.0.0.1:')) measurements.push(request.sizes().then(s => {
      const timing = request.timing();
      transfers.push({url:request.url().split('?')[0],body_bytes:s.responseBodySize,
        started_at_ms:timing.startTime,finished_at_ms:timing.responseEnd < 0 ? null : timing.startTime + timing.responseEnd});
    }).catch(error=>transferFailures.push({url:request.url().split('?')[0],error:error.message})));
  });
  page.context().on('requestfailed', request => transferFailures.push({url:request.url().split('?')[0],error:request.failure()?.errorText}));
  await page.goto(`http://127.0.0.1:${server.address().port}/web/models/vocabulary.json`);
  report = await page.evaluate(async ({cases,mode}) => {
    const adapter = await navigator.gpu?.requestAdapter();
    const hardware = { userAgent: navigator.userAgent, adapter: adapter ? {vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description} : null };
    if (!adapter) return { hardware, error: 'WebGPU adapter unavailable', results: [] };
    const vocabulary = await (await fetch('/web/models/vocabulary.json')).json();
    const catalogueStart = performance.now();
    const catalogueBytes = mode !== 'baseline' ? await (await fetch('/web/models/geography.json')).arrayBuffer() : null;
    const catalogue = catalogueBytes ? JSON.parse(new TextDecoder().decode(catalogueBytes)) : null;
    const catalogue_load_seconds = (performance.now()-catalogueStart)/1000;
    const worker = new Worker('/web/nn2-worker.js', {type:'module'});
    let id = 0;
    const call = data => new Promise((resolve,reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {cleanup(); worker.terminate(); reject(new Error('Proof timeout (5 minutes)'));}, 300000);
      const failure = e => {cleanup(); reject(new Error(e.message));};
      const cleanup = () => {clearTimeout(timer); worker.removeEventListener('message', listener); worker.removeEventListener('error', failure);};
      const listener = ({data:r}) => {
        if (r.id !== requestId || r.progress) return;
        cleanup();
        r.error ? reject(Object.assign(new Error(r.error),r)) : resolve(r);
      };
      worker.addEventListener('message', listener);
      worker.addEventListener('error', failure, {once:true});
      worker.postMessage({id:requestId,...data});
    });
    const start=performance.now(); const results=[];
    try {
      await call({action:'load',vocabulary,mode});
      const cold_load_seconds=(performance.now()-start)/1000;
      for (const c of cases) {
        const requestStart = performance.now();
        try {
          const r=await call({action:'interpret',description:c.description,vocabulary,mode,catalogue,syntheticProof:true});
          results.push({id:c.id,description:c.description,reply:r.reply,raw_reply:r.raw_reply,
            ...(mode==='focused' ? {rentBudget:r.rentBudget,rentNeedsReview:r.rentNeedsReview} : {}),
            ...(r.candidates ? {place_candidates:r.candidates.map(({id,name,type,context})=>({id,name,type,context}))} : {}),usage:r.usage,seconds:r.seconds});
        } catch(error) {
          results.push({id:c.id,description:c.description,reply:error.reply,raw_reply:error.raw_reply,error:error.message,seconds:error.seconds ?? (performance.now()-requestStart)/1000});
          if (error.message.includes('Proof timeout')) break;
        }
      }
      return {hardware,cold_load_seconds,catalogue_load_seconds,catalogue_response_body_bytes:catalogueBytes?.byteLength ?? 0,results};
    } catch(error) {return {hardware,error:error.message,elapsed_seconds:(performance.now()-start)/1000,results};}
    finally {worker.terminate();}
  }, {cases,mode});
  report.browser_version = browser.version();
} finally {await Promise.all(measurements); await browser.close(); await new Promise(resolve=>server.close(resolve));}
report.transfers=transfers;
report.transfer_failures=transferFailures;
report.download_measurement_complete=transferFailures.length === 0 && !report.error;
const starts = transfers.map(t=>t.started_at_ms).filter(Number.isFinite);
const finishes = transfers.map(t=>t.finished_at_ms).filter(Number.isFinite);
report.external_download_span_seconds = starts.length && finishes.length ? (Math.max(...finishes)-Math.min(...starts))/1000 : null;
report.total_transfer_body_bytes=transfers.reduce((n,t)=>n+t.body_bytes,0);
report.model_transfer_body_bytes=transfers.filter(t=>t.url.includes('huggingface.co')||t.url.includes('hf.co')||t.url.includes('xethub')||t.url.endsWith('.wasm')).reduce((n,t)=>n+t.body_bytes,0);
report.supporting_transfer_body_bytes=report.total_transfer_body_bytes-report.model_transfer_body_bytes;
report.within_download_budget=report.download_measurement_complete ? report.total_transfer_body_bytes <= NN2.downloadBudget : null;
report.download_note='Fresh browser context. Measured external response bodies, including redirects and runtime; not shard manifest sizes, wire bytes, or GPU memory. Download span overlaps initialization. Local geography response-body bytes are reported separately.';
report.mode=mode;
report.candidate=NN2;
report.source_sha256=hashes;
report.label_status=benchmark.label_status;
report.split='development';
report.planned_cases=cases.map(c=>c.id);
report.unexecuted_cases=cases.filter(c=>!report.results.some(r=>r.id===c.id)).map(c=>c.id);
report.environment={platform:platform(),arch:arch(),os_release:release(),cpu:cpus()[0]?.model,logical_cpus:cpus().length,memory_bytes:totalmem(),node:process.version,headless:true,fresh_context:true};
report.recorded_at=new Date().toISOString();
const output=process.argv[2] ?? 'nn2-browser-proof.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
