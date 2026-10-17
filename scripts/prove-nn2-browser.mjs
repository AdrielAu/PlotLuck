// Explicit operator invocation permits model download. No production user prompts.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLOTLUCK_PLAYWRIGHT ?? 'playwright');
const root = new URL('../', import.meta.url);
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
try {
  const page = await browser.newPage();
  page.context().on('requestfinished', request => {
    if (!request.url().startsWith('http://127.0.0.1:')) measurements.push(request.sizes().then(s=>transfers.push({url:request.url().split('?')[0],body_bytes:s.responseBodySize})).catch(()=>{}));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/web/models/vocabulary.json`);
  report = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const hardware = { userAgent: navigator.userAgent, adapter: adapter ? {vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description} : null };
    if (!adapter) return { hardware, error: 'WebGPU adapter unavailable', results: [] };
    const vocabulary = await (await fetch('/web/models/vocabulary.json')).json();
    const benchmark = await (await fetch('/tests/fixtures/nn2-benchmark.json')).json();
    const worker = new Worker('/web/nn2-worker.js', {type:'module'});
    let id = 0;
    const call = data => new Promise((resolve,reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {worker.terminate(); reject(new Error('Proof timeout (5 minutes)'));}, 300000);
      const listener = ({data:r}) => {
        if (r.id !== requestId || r.progress) return;
        clearTimeout(timer); worker.removeEventListener('message', listener);
        r.error ? reject(Object.assign(new Error(r.error),r)) : resolve(r);
      };
      worker.addEventListener('message', listener);
      worker.addEventListener('error', e => {clearTimeout(timer); reject(new Error(e.message));}, {once:true});
      worker.postMessage({id:requestId,...data});
    });
    const start=performance.now(); const results=[];
    try {
      await call({action:'load'});
      const cold_load_seconds=(performance.now()-start)/1000;
      for (const c of benchmark.cases.filter(c=>c.split==='development').slice(0,3)) {
        try {
          const r=await call({action:'interpret',description:c.description,vocabulary,syntheticProof:true});
          const {profile,...raw}=r.draft;
          results.push({id:c.id,description:c.description,reply:JSON.stringify(raw),seconds:r.seconds});
        } catch(error) {results.push({id:c.id,description:c.description,reply:error.reply,error:error.message,seconds:error.seconds});}
      }
      return {hardware,cold_load_seconds,label_status:benchmark.label_status,results};
    } catch(error) {return {hardware,error:error.message,elapsed_seconds:(performance.now()-start)/1000,results};}
    finally {worker.terminate();}
  });
} finally {await Promise.all(measurements); await browser.close(); await new Promise(resolve=>server.close(resolve));}
report.transfers=transfers;
report.total_transfer_body_bytes=transfers.reduce((n,t)=>n+t.body_bytes,0);
report.model_transfer_body_bytes=transfers.filter(t=>t.url.includes('huggingface.co')||t.url.includes('hf.co')||t.url.includes('xethub')||t.url.endsWith('.wasm')).reduce((n,t)=>n+t.body_bytes,0);
const output=process.argv[2] ?? 'nn2-browser-proof.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
