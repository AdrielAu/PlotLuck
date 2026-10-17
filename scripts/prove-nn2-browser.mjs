// Explicit operator invocation permits model download. No production user prompts.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch, release, totalmem } from 'node:os';
import { NN2 } from '../web/nn2-runtime.js';
const { chromium } = await import(process.env.PLOTLUCK_PLAYWRIGHT ?? 'playwright');
const root = new URL('../', import.meta.url);
const benchmark = JSON.parse(await readFile(new URL('tests/fixtures/nn2-benchmark.json', root)));
// Keep heldout descriptions AND expected labels outside the browser experiment.
const cases = benchmark.cases.filter(c => c.split === 'development').map(({id, description}) => ({id, description}));
const hashes = {};
for (const path of ['web/interpreter.js', 'web/nn2-worker.js', 'web/nn2-runtime.js', 'web/models/vocabulary.json',
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
  report = await page.evaluate(async ({cases}) => {
    const adapter = await navigator.gpu?.requestAdapter();
    const hardware = { userAgent: navigator.userAgent, adapter: adapter ? {vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description} : null };
    if (!adapter) return { hardware, error: 'WebGPU adapter unavailable', results: [] };
    const vocabulary = await (await fetch('/web/models/vocabulary.json')).json();
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
      await call({action:'load',vocabulary});
      const cold_load_seconds=(performance.now()-start)/1000;
      for (const c of cases) {
        const requestStart = performance.now();
        try {
          const r=await call({action:'interpret',description:c.description,vocabulary,syntheticProof:true});
          results.push({id:c.id,description:c.description,reply:r.reply,usage:r.usage,seconds:r.seconds});
        } catch(error) {
          results.push({id:c.id,description:c.description,reply:error.reply,error:error.message,seconds:error.seconds ?? (performance.now()-requestStart)/1000});
          if (error.message.includes('Proof timeout')) break;
        }
      }
      return {hardware,cold_load_seconds,results};
    } catch(error) {return {hardware,error:error.message,elapsed_seconds:(performance.now()-start)/1000,results};}
    finally {worker.terminate();}
  }, {cases});
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
report.download_note='Fresh browser context. Measured external response bodies, including redirects and runtime; not shard manifest sizes, wire bytes, or GPU memory. Download span overlaps initialization. No geography assets used.';
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
