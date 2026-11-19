// Browser benchmark (real Chrome): WeChat SR model via JS kernel vs ONNX Runtime Web (WASM, WebGPU),
// plus an end-to-end check that the scanner worker loads ORT for superResolution:'webgpu'.
import { ROOT, TMP, chromeOpts } from '../scripts/env.mts';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { render } from '../test/helpers.ts';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const types: Record<string, string> = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', html: 'text/html' };
const srv = createServer((req, res) => {
  let url = (req.url || '/').split('?')[0];
  if (url === '/') url = '/bench/browser.html';
  const f = root + url.slice(1);
  if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[f.split('.').pop()!] ?? 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(5198);

writeFileSync(root + 'bench/browser.html', `<!doctype html><body><script src="/node_modules/onnxruntime-web/dist/ort.webgpu.min.js"></script>
<script type="module">
import { superResolve, createOnnxSuperRes } from '/dist/sr.js';
ort.env.wasm.wasmPaths = '/node_modules/onnxruntime-web/dist/'; ort.env.wasm.numThreads = 1;
const out = { ua: navigator.userAgent, webgpu: false, adapter: null, rows: [] };
const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
out.webgpu = !!adapter; out.adapter = adapter?.info ? (adapter.info.vendor + ' ' + adapter.info.architecture + ' ' + (adapter.info.description||'')) : null;
const backs = { wasm: await createOnnxSuperRes(ort, ['wasm']) };
if (adapter) backs.webgpu = await createOnnxSuperRes(ort, ['webgpu']);
for (const side of [64, 96, 128, 160, 240]) {
  const rgba = new Uint8ClampedArray(side*side*4).map((_, i) => (i*2654435761)>>>24);
  const x = new Float32Array(side*side).map(() => Math.random());
  const N = side > 128 ? 10 : 25, row = { side };
  superResolve(x, side, side);
  let t = performance.now(); for (let i=0;i<N;i++) superResolve(x, side, side); row.js = (performance.now()-t)/N;
  for (const [k, f] of Object.entries(backs)) { await f({data: rgba, width: side, height: side}); await f({data: rgba, width: side, height: side});
    t = performance.now(); for (let i=0;i<N;i++) await f({data: rgba, width: side, height: side}); row[k] = (performance.now()-t)/N; }
  out.rows.push(row);
}
window.__out = out;
</script>`);

const fakeImg = render('https://pay.example.com/kpay?order=SR-WEBGPU', { module: 6, angle: 20, W: 1280, H: 720, cx: 640, cy: 360 });
const W = 1280, H = 720, y4m = TMP + 'fake2.y4m';
const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
for (let f = 0; f < 3; f++) { const Y = Buffer.alloc(W*H); for (let i=0;i<W*H;i++) Y[i]=fakeImg.data[i*4]; parts.push(Buffer.from('FRAME\n'), Y, Buffer.alloc(W*H/2, 128)); }
writeFileSync(y4m, Buffer.concat(parts));

const browser = await chromium.launch({
  ...chromeOpts(),
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5198/');
await page.waitForFunction(() => (window as any).__out, null, { timeout: 120000 });
const out = await page.evaluate(() => (window as any).__out);

// end-to-end: scanner worker with superResolution:'webgpu' (ORT loaded inside the worker)
const p2 = await browser.newPage();
p2.on('pageerror', (e) => console.log('[pageerror]', e.message));
writeFileSync(root + 'bench/e2e-sr.html', `<!doctype html><body><script type="module">
  import { QRScanner } from '/dist/index.js';
  const v = document.createElement('video'); document.body.append(v);
  const s = new QRScanner({ video: v, superResolution: 'webgpu', onnxRuntimeUrl: location.origin + '/node_modules/onnxruntime-web/dist/ort.webgpu.min.js' });
  s.on('result', r => { window.__e2e = { text: r.text }; });
  s.on('error', e => { window.__e2e = { err: e.code + ' ' + e.message }; });
  await s.start();
  window.__s = s;
</script>`);
await p2.goto('http://localhost:5198/bench/e2e-sr.html');
await p2.waitForFunction(() => (window as any).__e2e, null, { timeout: 30000 }).catch(() => {});
await p2.waitForTimeout(1500);
const e2e = await p2.evaluate(() => (window as any).__e2e ?? null);
const srAfter = await p2.evaluate(() => (window as any).__s?.superResolutionBackend);
await browser.close(); srv.close();
console.log(JSON.stringify({ ...out, e2e, srAfter }, null, 1));
writeFileSync(root + 'bench/out/browser.json', JSON.stringify({ ...out, e2e, srAfter }, null, 1));
