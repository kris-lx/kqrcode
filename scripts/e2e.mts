// End-to-end: real Chrome + fake camera fed with a rotated QR (y4m), loads dist/ build.
import { ROOT, TMP, chromeOpts } from './env.mts';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { render, renderSymbol } from '../test/helpers.ts';

const W = 1280, H = 720, TEXT = 'https://pay.example.com/kpay?order=E2E-42';
// --micro: feed a Micro QR instead (checks the whole QR family end-to-end)
const img = process.argv.includes('--micro')
  ? await renderSymbol('MicroQRCode', 'KPAY:E2E-42', { module: 10, angle: 33, W, H, cx: 420, cy: 300 })
  : render(TEXT, { module: 6, angle: 33, W, H, cx: 420, cy: 300 });
// write y4m (gray → I420)
const frames = 5;
const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`);
const parts = [head];
for (let f = 0; f < frames; f++) {
  const Y = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) Y[i] = img.data[i * 4];
  parts.push(Buffer.from('FRAME\n'), Y, Buffer.alloc((W / 2) * (H / 2) * 2, 128));
}
const y4m = TMP + 'fake.y4m';
writeFileSync(y4m, Buffer.concat(parts));

const root = ROOT;
const srv = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/global') { // <script> build: engine fetched from kqrcode.engine.js next to it
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><body><script src="/dist/kqrcode.global.js"></script><script>
      KQRCode.scanQR({ theme: 'grid' }).then((r) => { window.__g = { text: r.text }; }, (e) => { window.__g = { err: String(e) }; });
    </script>`); return; }
  if (url === '/csp') { // strict CSP without 'wasm-unsafe-eval' → worker can't compile WASM → jsQR fallback
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src blob:; img-src 'self' blob: data:; media-src 'self' blob: mediastream:");
    res.end(`<!doctype html><body><script type="module">
      import { scanQR } from '/dist/index.js';
      scanQR().then((r) => { window.__c = { text: r.text }; }, (e) => { window.__c = { err: String(e) }; });
    </script>`); return; }
  if (url === '/scanqr') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><body><script type="module">
    import { scanQR, QRScanner } from '/dist/index.js';
    QRScanner.preload();
    try { const r = await scanQR({ theme: 'alipay', locale: 'lo', style: { '--kqr-accent': '#e60012' } });
      window.__q = { text: r.text, left: document.querySelectorAll('kqr-scanner').length }; }
    catch (e) { window.__q = { err: String(e) }; }
  </script>`); return; }
  if (url === '/accept') { // accept() turns the code down twice (once with a message), then accepts
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><body><script type="module">
      import { scanQR } from '/dist/index.js';
      const seen = []; let calls = 0;
      scanQR({
        accept: async (r) => { calls++; await new Promise((z) => setTimeout(z, 50)); return window.__allow ? true : 'Not our code'; },
        onReject: (r, m) => seen.push(m),
      }).then((r) => { window.__a = { text: r.text, format: r.format, version: r.version, calls, seen,
        hint: null }; }, (e) => { window.__a = { err: String(e) }; });
      setTimeout(() => {
        const el = document.querySelector('kqr-scanner');
        window.__mid = { calls, seen: [...seen], hint: el.shadowRoot.querySelector('.msg').textContent };
        window.__allow = true;
        el.scanner.resume(); // forget the cooldown so the code is offered again
      }, 3000);
    </script>`); return; }
  if (url === '/el') { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0"><script type="module">
    import '/dist/index.js';
    const el = document.createElement('kqr-scanner'); el.setAttribute('locale','lo'); el.setAttribute('keep-camera','');
    el.addEventListener('scan', e => { window.__scan = e.detail.text; });
    el.addEventListener('error', e => { window.__err = e.detail.code; });
    document.body.append(el);
  </script>`); return; }
  if (url === '/') { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><body><script type="module">
    import { QRScanner } from '/dist/index.js';
    const v = document.createElement('video'); document.body.append(v);
    const s = new QRScanner({ video: v });
    window.__t0 = performance.now();
    s.on('result', r => { window.__res = { text: r.text, ms: performance.now() - window.__t0, corners: r.corners.length }; });
    s.on('zoom', z => { window.__zoom = JSON.stringify(z); });
    s.on('error', e => { window.__err = e.code + ':' + e.message; });
    await s.start();
  </script>`); return; }
  const f = root + url.slice(1);
  if (existsSync(f)) { res.setHeader('content-type', 'text/javascript'); res.end(readFileSync(f)); } else { res.statusCode = 404; res.end(); }
}).listen(5199);

const browser = await chromium.launch({
  ...chromeOpts(),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
});
const page = await browser.newPage();
if (process.argv.includes('--ios')) {
  // emulate Safari: no OffscreenCanvas, no zoom capability, no BarcodeDetector
  await page.addInitScript(() => {
    delete (window as any).OffscreenCanvas;
    delete (window as any).BarcodeDetector;
    const gc = MediaStreamTrack.prototype.getCapabilities;
    MediaStreamTrack.prototype.getCapabilities = function () { const c: any = gc.call(this); delete c.zoom; delete c.torch; return c; };
  });
}
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/');
try {
  await page.waitForFunction(() => (window as any).__res || (window as any).__err, null, { timeout: 15000 });
  console.log(await page.evaluate(() => JSON.stringify({ res: (window as any).__res, err: (window as any).__err, zoom: (window as any).__zoom })));
} catch (e) { console.log('TIMEOUT'); }
if (process.argv.includes('--el')) {
  const p2 = await browser.newPage({ viewport: { width: 390, height: 780 } });
  p2.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p2.goto('http://localhost:5199/el');
  await p2.waitForTimeout(500);
  await p2.screenshot({ path: TMP + 'el1.png' });
  await p2.waitForFunction(() => (window as any).__scan || (window as any).__err, null, { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: TMP + 'el2.png' });
  console.log('element scan:', await p2.evaluate(() => (window as any).__scan || (window as any).__err));
}
for (const [flag, path, key] of [['--global', '/global', '__g'], ['--csp', '/csp', '__c']] as const) {
  if (!process.argv.includes(flag)) continue;
  const pg = await browser.newPage();
  pg.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const t0 = Date.now();
  await pg.goto('http://localhost:5199' + path);
  await pg.waitForFunction((k) => (window as any)[k], key, { timeout: 20000 }).catch(() => {});
  console.log(flag.slice(2) + ':', JSON.stringify(await pg.evaluate((k) => (window as any)[k] ?? null, key)), (Date.now() - t0) + ' ms');
}
if (process.argv.includes('--scanqr')) {
  const p3 = await browser.newPage();
  p3.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p3.goto('http://localhost:5199/scanqr');
  await p3.waitForFunction(() => (window as any).__q, null, { timeout: 15000 }).catch(() => {});
  console.log('scanQR:', JSON.stringify(await p3.evaluate(() => (window as any).__q ?? null)));
}
if (process.argv.includes('--accept')) {
  const p4 = await browser.newPage();
  p4.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p4.goto('http://localhost:5199/accept');
  await p4.waitForFunction(() => (window as any).__a, null, { timeout: 20000 }).catch(() => {});
  console.log('accept:', JSON.stringify(await p4.evaluate(() => ({ mid: (window as any).__mid, done: (window as any).__a ?? null }))));
}
if (process.argv.includes('--rn')) {
  // React Native page (what react-native-webview loads), served at the same https origin, with a
  // stand-in for window.ReactNativeWebView that answers accept requests like the RN side does.
  const { buildPage } = await import('../src/rn-bridge.ts');
  const { default: runtime } = await import('../src/rn-runtime.generated.ts');
  const html = buildPage({ locale: 'lo', accept: true, cssVars: { '--kqr-accent': '#e60012' } }, { runtime });
  const p5 = await browser.newPage({ viewport: { width: 390, height: 780 } });
  p5.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p5.addInitScript(() => {
    const w = window as any;
    w.__rn = [];
    let asked = 0;
    w.ReactNativeWebView = { postMessage(s: string) {
      const m = JSON.parse(s);
      w.__rn.push(m.type + (m.message ? ':' + m.message : '') + (m.result ? ':' + m.result.format : ''));
      if (m.type === 'accept') setTimeout(() => w.__kqrAccept(m.id, ++asked === 1 ? 'Not ours' : true), 20);
    } };
  });
  await p5.route('https://kqrcode.local/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await p5.goto('https://kqrcode.local/');
  // app goes to the background → camera released; back to the foreground → camera reopened
  await p5.waitForFunction(() => (window as any).__rn.includes('ready'), null, { timeout: 20000 });
  const bg = await p5.evaluate(() => {
    (window as any).__kqrApp(false);
    const el = document.querySelector('kqr-scanner') as any;
    return { active: el.active, stream: !!el.shadowRoot.querySelector('video').srcObject };
  });
  await p5.evaluate(() => (window as any).__kqrApp(true));
  await p5.waitForFunction(() => (window as any).__rn.filter((t: string) => t === 'ready').length >= 2, null, { timeout: 20000 }).catch(() => {});
  console.log('rn background:', JSON.stringify(bg), 'readies:', await p5.evaluate(() => (window as any).__rn.filter((t: string) => t === 'ready').length));
  // first accept says no → wait for the cooldown, then resume so the code is offered again
  await p5.waitForFunction(() => (window as any).__rn.some((t: string) => t.startsWith('reject')), null, { timeout: 20000 }).catch(() => {});
  await p5.evaluate(() => (window as any).__kqrCall('resume'));
  await p5.waitForFunction(() => (window as any).__rn.some((t: string) => t.startsWith('scan')), null, { timeout: 20000 }).catch(() => {});
  await p5.screenshot({ path: TMP + 'rn.png' });
  console.log('rn:', JSON.stringify(await p5.evaluate(() => (window as any).__rn)), 'secure:', await p5.evaluate(() => isSecureContext));
}
await browser.close(); srv.close();
