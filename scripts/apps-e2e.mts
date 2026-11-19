// Runs each generated app's *production* server and checks it in real Chrome with a fake camera:
//   SSR HTML ok · no page errors · slotted content rendered · QR actually scanned.
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = process.argv[2];
const Y4M = 'C:/Users/Kailo/AppData/Local/Temp/kpay-code.y4m'; // from scripts/themes.mts
const EXPECT = 'https://pay.example.com/kpay?order=THEME';
const apps: { name: string; cmd: string; port: number; ssr: boolean }[] = [
  { name: 'react-vite', cmd: 'npm run preview', port: 4101, ssr: false },
  { name: 'next', cmd: 'npm run start', port: 4102, ssr: true },
  { name: 'nuxt', cmd: 'npm run start', port: 4103, ssr: true },
  { name: 'sveltekit', cmd: 'npm run start', port: 4104, ssr: true },
  { name: 'angular', cmd: 'npm run start', port: 4105, ssr: false },
];

const waitPort = async (port: number, ms = 60000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.status < 500) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start on ' + port);
};
const kill = (p: ChildProcess) => { try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ } };

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`],
});
const rows: string[] = [];
for (const a of apps) {
  const proc = spawn(a.cmd, { cwd: `${ROOT}/${a.name}`, shell: true, env: { ...process.env, PORT: String(a.port), NODE_ENV: 'production' }, stdio: 'ignore' });
  const row: Record<string, string> = { app: a.name };
  try {
    await waitPort(a.port);
    const html = await (await fetch(`http://localhost:${a.port}/`)).text();
    row.ssr = a.ssr ? (html.includes('SSR ok') ? 'ok' : 'MISSING') : 'n/a (SPA)';
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`http://localhost:${a.port}/`);
    await page.waitForFunction((exp) => document.querySelector('#result')?.textContent === exp, EXPECT, { timeout: 20000 })
      .then(() => { row.scan = `ok (${Date.now() - t0} ms from navigation)`; })
      .catch(() => { row.scan = 'FAILED'; });
    row.slotSeen = 'n/a';
    row.errors = errors.length ? errors.slice(0, 2).join(' | ') : 'none';
    await page.close();
    // slot check on a fresh load before the scan completes is racy; instead check the element is upgraded & slotted in DOM
    const p2 = await browser.newPage();
    await p2.route('**/*', (r) => r.continue());
    await p2.goto(`http://localhost:${a.port}/`);
    row.slotSeen = await p2.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        const el = document.querySelector('kpay-qr-scanner') as HTMLElement | null;
        const b = el?.querySelector('[slot="actions-left"]');
        if (el?.shadowRoot && b) {
          const slot = el.shadowRoot.querySelector('slot[name="actions-left"]') as HTMLSlotElement;
          return slot.assignedElements().length ? 'ok' : 'not assigned';
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return document.querySelector('#result')?.textContent ? 'scanned before check' : 'element not found';
    });
    await p2.close();
  } catch (e) {
    row.error = String(e);
  } finally {
    kill(proc);
  }
  rows.push(JSON.stringify(row));
  console.log(JSON.stringify(row));
}
await browser.close();
