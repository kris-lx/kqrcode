// End-to-end: real Chrome + fake camera fed with a rotated QR (y4m), loads dist/ build.
import { ROOT, TMP, chromeOpts } from './env.mts';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { render } from '../test/helpers.ts';

const W = 1280, H = 720, TEXT = 'https://pay.example.com/kpay?order=E2E-42';
const img = render(TEXT, { module: 6, angle: 33, W, H, cx: 420, cy: 300 });
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
  if (url === '/scanqr') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><body><script type="module">
    import { scanQR, QRScanner } from '/dist/index.js';
    QRScanner.preload();
    try { const r = await scanQR({ theme: 'alipay', locale: 'lo', style: { '--kqr-accent': '#e60012' } });
      window.__q = { text: r.text, left: document.querySelectorAll('kqr-scanner').length }; }
    catch (e) { window.__q = { err: String(e) }; }
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
if (process.argv.includes('--scanqr')) {
  const p3 = await browser.newPage();
  p3.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p3.goto('http://localhost:5199/scanqr');
  await p3.waitForFunction(() => (window as any).__q, null, { timeout: 15000 }).catch(() => {});
  console.log('scanQR:', JSON.stringify(await p3.evaluate(() => (window as any).__q ?? null)));
}
await browser.close(); srv.close();
