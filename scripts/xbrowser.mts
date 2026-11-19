// Cross-browser + stress test: Chromium (Chrome), Firefox, WebKit (Safari engine).
// Camera is simulated with canvas.captureStream() drawing moving/rotating QR codes, so the full
// pipeline (getUserMedia → video → grab → worker/WASM → result) runs identically in every engine.
import { chromium, firefox, webkit, type Browser } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

const root = 'd:/kailo/codes/kpay/';
const CODES = [
  'https://pay.example.com/kpay?o=1',
  'https://pay.example.com/kpay?o=2&amt=50000',
  '00020101021238670016A00526628466257701082771041802030020324LAOQR000000000000000000000000520458125303418540512500',
  'KPAY-ORDER-0004',
  'https://example.com/very/long/path/for/testing/qr/version/size?x=12345678901234567890',
];
const pngs = await Promise.all(CODES.map((t) => QRCode.toBuffer(t, { margin: 2, scale: 8, errorCorrectionLevel: 'M' })));

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="module">
import { QRScanner, scanQR } from '/dist/index.js';
// --- leak accounting
let alive = 0; const W = window.Worker;
window.Worker = class extends W { constructor(...a) { super(...a); alive++; } terminate() { alive--; super.terminate(); } };
window.__alive = () => alive;
// --- simulated camera
const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
const ctx = canvas.getContext('2d');
const imgs = await Promise.all([0,1,2,3,4].map((i) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = '/qr-' + i + '.png'; })));
const scene = { idx: 0, show: true, x: 640, y: 360, size: 320, angle: 0.3, spin: 0 };
let t = 0;
function draw() {
  t++;
  const g = ctx.createLinearGradient(0, 0, 1280, 720); g.addColorStop(0, '#6a6a6a'); g.addColorStop(1, '#2c2c2c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = '#888'; for (let i = 0; i < 20; i++) ctx.fillRect((i * 97 + t) % 1280, (i * 53) % 720, 40, 12); // clutter
  if (scene.show) {
    ctx.save(); ctx.translate(scene.x, scene.y); ctx.rotate(scene.angle + scene.spin * t * 0.02);
    ctx.drawImage(imgs[scene.idx], -scene.size / 2, -scene.size / 2, scene.size, scene.size); ctx.restore();
  }
}
setInterval(draw, 33); draw();
const tracks = [];
window.__cam = !!(navigator.mediaDevices && canvas.captureStream);
if (window.__cam) navigator.mediaDevices.getUserMedia = async () => { const s = canvas.captureStream(30); tracks.push(...s.getVideoTracks()); return s; };
window.__liveTracks = () => tracks.filter((x) => x.readyState === 'live').length;
window.__scene = (s) => Object.assign(scene, s);
window.QRScanner = QRScanner; window.scanQR = scanQR;
window.__ready = true;
</script>`;

const srv = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  const m = url.match(/^\/qr-(\d)\.png$/);
  if (m) { res.setHeader('content-type', 'image/png'); return res.end(pngs[+m[1]]); }
  const f = root + url.slice(1);
  if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  res.end(readFileSync(f));
}).listen(5196);

type R = Record<string, unknown>;
async function run(name: string, b: Browser): Promise<R> {
  const out: R = { browser: name, version: b.version() };
  const page = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:5196/');
  await page.waitForFunction(() => (window as any).__ready, null, { timeout: 30000 });
  const ev = <T,>(fn: string, arg?: unknown) => page.evaluate(new Function('arg', `return (async () => { ${fn} })()`) as (a: unknown) => Promise<T>, arg);
  out.osc = await page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
  if (!(await page.evaluate(() => (window as any).__cam))) {
    // engine without camera APIs (e.g. WebKit on Windows): gallery decode + graceful 'unsupported' UI
    out.camera = 'no camera API in this build – camera tests skipped';
    out.gallery = await ev<string>(`
      const res = [];
      for (const i of [0, 1, 2, 3, 4]) {
        const blob = await (await fetch('/qr-' + i + '.png')).blob();
        const s = new QRScanner({ video: document.createElement('video') }); const t0 = performance.now();
        const r = await s.scanImage(blob); s.stop();
        res.push((r && r.text === ${JSON.stringify(CODES)}[i] ? 'ok' : 'FAIL') + ' ' + (performance.now() - t0).toFixed(0) + 'ms');
      }
      return res.join(', ');`).catch((e) => 'FAIL ' + e);
    out.unsupportedFlow = await ev<string>(`
      try { await Promise.race([scanQR({ locale: 'lo' }), new Promise((_, j) => setTimeout(() => j('timeout'), 8000))]); return 'UNEXPECTED resolve'; }
      catch (e) {
        const el = document.querySelector('kpay-qr-scanner');
        return 'rejected ' + (e.code || e) + ', element shows: ' + (el && el.getAttribute('error')) + ' / "' + (el && el.shadowRoot.querySelector('.et').textContent) + '"';
      }`).catch((e) => 'FAIL ' + e);
    out.workersAlive = await page.evaluate(() => (window as any).__alive());
    out.pageErrors = errs.length ? errs.slice(0, 3).join(' | ') : 'none';
    await page.close();
    return out;
  }

  // 1) first scan (cold: includes engine download + WASM compile)
  out.firstScan = await ev<string>(`
    __scene({ idx: 0, show: true, size: 320, x: 640, y: 360, angle: 0.3, spin: 0 });
    const v = document.createElement('video'); document.body.append(v);
    const s = new QRScanner({ video: v }); const t0 = performance.now();
    const r = await new Promise((res, rej) => { s.on('result', res); s.on('error', rej); s.start().catch(rej); setTimeout(() => rej('timeout'), 20000); });
    const ms = performance.now() - t0; s.stop(); v.remove();
    return (r.text === ${JSON.stringify(CODES[0])} ? 'ok ' : 'WRONG ') + ms.toFixed(0) + ' ms';`).catch((e) => 'FAIL ' + e);

  // 2) warm scans across sizes/angles (time to result, engine already cached)
  const cases = [[320, 0.3], [200, 1.2], [140, 2.4], [110, 0.8], [90, 3.9]];
  const warm: string[] = [];
  for (const [size, angle] of cases) {
    warm.push(await ev<string>(`
      __scene({ idx: 1, show: true, size: ${size}, x: 420, y: 300, angle: ${angle}, spin: 0 });
      const v = document.createElement('video'); document.body.append(v);
      const s = new QRScanner({ video: v }); const t0 = performance.now();
      try {
        const r = await new Promise((res, rej) => { s.on('result', res); s.start().catch(rej); setTimeout(() => rej('timeout'), 8000); });
        return '${size}px:' + (r.text === ${JSON.stringify(CODES[1])} ? '' : 'WRONG ') + (performance.now() - t0).toFixed(0) + 'ms';
      } catch (e) { return '${size}px:FAIL'; } finally { s.stop(); v.remove(); }`));
  }
  out.warmScans = warm.join(' ');

  // 3) gallery image without camera
  out.gallery = await ev<string>(`
    const blob = await (await fetch('/qr-2.png')).blob();
    const s = new QRScanner({ video: document.createElement('video') });
    const r = await s.scanImage(blob); s.stop();
    return r && r.text === ${JSON.stringify(CODES[2])} ? 'ok' : 'FAIL ' + (r && r.text);`).catch((e) => 'FAIL ' + e);

  // 4) one-liner element flow
  out.scanQR = await ev<string>(`
    __scene({ idx: 3, show: true, size: 300, x: 640, y: 360, angle: 0.5, spin: 0 });
    const r = await Promise.race([scanQR({ theme: 'alipay', locale: 'lo' }), new Promise((_, j) => setTimeout(() => j('timeout'), 15000))]);
    return (r.text === ${JSON.stringify(CODES[3])} ? 'ok' : 'WRONG') + ', elements left=' + document.querySelectorAll('kpay-qr-scanner').length;`).catch((e) => 'FAIL ' + e);

  // 5) stress: continuous scanning for 20 s while codes move, spin, change and disappear
  out.stress = await ev<string>(`
    const v = document.createElement('video'); document.body.append(v);
    const s = new QRScanner({ video: v, continuous: true });
    const seen = new Set(); let results = 0, wrong = 0, frames = 0;
    const valid = new Set(${JSON.stringify(CODES)});
    s.on('result', (r) => { results++; seen.add(r.text); if (!valid.has(r.text)) wrong++; });
    s.on('hint', () => frames++);
    await s.start();
    const t0 = performance.now(); let k = 0;
    const timer = setInterval(() => { k++;
      __scene({ idx: k % 5, show: k % 4 !== 0, size: 120 + (k * 37) % 260, x: 300 + (k * 131) % 680, y: 200 + (k * 71) % 320, angle: k * 0.7, spin: k % 3 === 0 ? 1 : 0 });
    }, 700);
    const mem0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    await new Promise((r) => setTimeout(r, 20000));
    clearInterval(timer); s.stop(); v.remove();
    const secs = (performance.now() - t0) / 1000;
    const mem1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return 'analysed ' + (frames / secs).toFixed(1) + ' fps, results ' + results + ', distinct ' + seen.size + '/5, wrong ' + wrong +
      (mem0 ? ', main heap ' + (mem0 / 1e6).toFixed(1) + '→' + (mem1 / 1e6).toFixed(1) + ' MB' : '');`).catch((e) => 'FAIL ' + e);

  // 6) 20 start/stop cycles → workers & camera tracks must all be released
  out.cycles = await ev<string>(`
    const v = document.createElement('video'); document.body.append(v);
    __scene({ show: false });
    for (let i = 0; i < 20; i++) { const s = new QRScanner({ video: v }); await s.start(); await new Promise((r) => setTimeout(r, 80)); s.stop(); }
    await new Promise((r) => setTimeout(r, 300));
    return 'workers alive=' + __alive() + ', live camera tracks=' + __liveTracks();`).catch((e) => 'FAIL ' + e);

  out.pageErrors = errs.length ? errs.slice(0, 3).join(' | ') : 'none';
  await page.close();
  return out;
}

const results: R[] = [];
const targets: [string, () => Promise<Browser>][] = [
  ['chrome', () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-precise-memory-info'] })],
  ['firefox', () => firefox.launch()],
  ['webkit', () => webkit.launch()],
];
const only = process.argv[2];
for (const [name, launch] of targets) {
  if (only && name !== only) continue;
  const b = await launch();
  try { const r = await run(name, b); results.push(r); console.log(JSON.stringify(r, null, 1)); }
  catch (e) { console.log(name, 'CRASH', e); results.push({ browser: name, crash: String(e) }); }
  await b.close();
}
writeFileSync(root + 'bench/out/xbrowser.json', JSON.stringify(results, null, 1));
srv.close();
