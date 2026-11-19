// Screenshot every theme in real Chrome (fake camera showing a code-free "desk" scene), plus a found-state shot.
import { ROOT, TMP, chromeOpts } from './env.mts';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { render } from '../test/helpers.ts';

const root = ROOT;
const OUT = TMP + 'themes/';
import('node:fs').then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const W = 1280, H = 720;
function y4m(path: string, withCode: boolean) {
  const img = render('https://pay.example.com/kpay?order=THEME', { module: 7, angle: 12, W, H, cx: 640, cy: 330 });
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  const Y = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const scene = 60 + 50 * Math.sin(x / 90) * Math.cos(y / 70) + (y > 560 ? 40 : 0); // monitor-ish gradient
    Y[i] = withCode ? img.data[i * 4] : Math.max(0, Math.min(255, scene));
  }
  parts.push(Buffer.from('FRAME\n'), Y, Buffer.alloc(W * H / 2, 128));
  writeFileSync(path, Buffer.concat(parts));
}
const sceneY4m = TMP + 'scene.y4m';
const codeY4m = TMP + 'code.y4m';
y4m(sceneY4m, false); y4m(codeY4m, true);

const srv = createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  if (u.pathname === '/') {
    const theme = u.searchParams.get('theme') ?? 'wechat';
    const extra = u.searchParams.get('extra') ?? '';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0">
      <script type="module">import '/dist/index.js';</script>
      <kqr-scanner theme="${theme}" locale="${u.searchParams.get('locale') ?? 'zh'}" keep-camera torch="always" ${extra}>
        ${u.searchParams.get('slots') ? `
        <button slot="actions-left" style="all:unset;display:flex;align-items:center;gap:10px;background:rgba(60,60,60,.6);color:#fff;border-radius:40px;padding:12px 18px;font:15px system-ui">
          <span style="font-size:22px">▦</span><span>我的二维码<br><small style="opacity:.7">添加朋友, 收照片</small></span></button>
        <nav slot="footer" style="display:flex;gap:48px;color:#fff;font:17px system-ui;background:#111;width:100vw;justify-content:center;padding:14px 0;margin:0 -22px -18px">
          <b style="color:var(--kqr-accent,#1677ff)">扫码</b><span style="opacity:.6">识物</span><span style="opacity:.6">AR</span></nav>` : ''}
      </kqr-scanner>
      <script>document.querySelector('kqr-scanner').addEventListener('scan', e => window.__scan = e.detail.text)</script>`);
    return;
  }
  const f = root + u.pathname.slice(1);
  if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', 'text/javascript');
  res.end(readFileSync(f));
}).listen(5197);

async function shoot(y4mPath: string, shots: [string, string][], wait: number) {
  const browser = await chromium.launch({
    ...chromeOpts(),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4mPath}`],
  });
  for (const [name, query] of shots) {
    const p = await browser.newPage({ viewport: { width: 390, height: 800 } });
    p.on('pageerror', (e) => console.log('[pageerror]', name, e.message));
    await p.goto('http://localhost:5197/?' + query);
    await p.waitForTimeout(wait);
    await p.screenshot({ path: OUT + name + '.png' });
    console.log(name, await p.evaluate(() => (window as any).__scan ?? ''));
    await p.close();
  }
  await browser.close();
}
await shoot(sceneY4m, [
  ['wechat', 'theme=wechat&slots=1'],
  ['alipay', 'theme=alipay&slots=1'],
  ['grid', 'theme=grid&locale=lo'],
  ['frame', 'theme=frame&locale=en&extra=heading%3D%22Scan%20to%20pay%22%20zoom-control%3D%22slider%22'],
  ['custom', 'theme=wechat&locale=lo&extra=style%3D%22--kqr-accent%3A%23e60012%3B--kqr-line-width%3A5px%22'],
], 1300);
await shoot(codeY4m, [['found', 'theme=alipay&slots=1']], 1500);
srv.close();
