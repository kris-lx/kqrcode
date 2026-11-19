/**
 * Benchmark: accuracy (decode rate) + latency for
 *   jsQR · ZXing-C++ WASM · kpay engine · kpay engine + WeChat SR · WeChat (OpenCV native C++)
 * on one deterministic synthetic dataset, plus an SR micro-benchmark (JS kernel vs ONNX Runtime).
 *
 *   npx tsx bench/run.mts            (needs the Python venv for the WeChat column, see BENCHMARK.md)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import jsQR from 'jsqr';
import { readBarcodes } from 'zxing-wasm/reader';
import * as ort from 'onnxruntime-node';
import { dataset, toRGBA, type Sample } from './dataset.ts';
import { analyze, type Decoder } from '../src/engine.ts';
import { createZXingDecoder } from '../src/decoder-zxing.ts';
import { jsSuperRes, createOnnxSuperRes } from '../src/sr-providers.ts';
import { superResolve } from '../src/sr.ts';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PY = process.env.KPAY_PY ?? 'C:/Users/Kailo/AppData/Local/Temp/kpay-venv/Scripts/python.exe';
mkdirSync(OUT + 'data', { recursive: true });

type Row = { ok: boolean; false: boolean; ms: number };
type Engine = { name: string; run: (s: Sample, rgba: Uint8ClampedArray) => Promise<string | null> };

const zx: Decoder = await createZXingDecoder();
const onnxSR = await createOnnxSuperRes(ort as never, ['cpu']);
const engines: Engine[] = [
  {
    name: 'jsQR',
    run: async (s, rgba) => jsQR(rgba, s.width, s.height, { inversionAttempts: 'dontInvert' })?.data ?? null,
  },
  {
    name: 'ZXing-C++ (WASM)',
    run: async (s, rgba) => {
      const r = await readBarcodes({ data: rgba, width: s.width, height: s.height, colorSpace: 'srgb' } as unknown as ImageData,
        { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 1 });
      return r[0]?.isValid ? r[0].text : null;
    },
  },
  {
    name: 'kpay (ZXing + locator + ROI)',
    run: async (s, rgba) => (await analyze({ data: rgba, width: s.width, height: s.height }, { sr: false }, zx)).text ?? null,
  },
  {
    name: 'kpay + WeChat SR (JS)',
    run: async (s, rgba) => (await analyze({ data: rgba, width: s.width, height: s.height }, {}, zx, jsSuperRes)).text ?? null,
  },
  {
    name: 'kpay + WeChat SR (ONNX Runtime)',
    run: async (s, rgba) => (await analyze({ data: rgba, width: s.width, height: s.height }, {}, zx, onnxSR)).text ?? null,
  },
];

// ---------------- dataset ----------------
console.log('generating dataset…');
const samples = [...dataset(4)];
const manifest = samples.map((s) => ({ id: s.id, text: s.text, module: s.module, blur: s.blur, contrast: s.contrast, empty: !!s.empty }));
for (const s of samples) {
  const head = Buffer.from(`P5\n${s.width} ${s.height}\n255\n`);
  writeFileSync(`${OUT}data/${s.id}.pgm`, Buffer.concat([head, Buffer.from(s.gray)]));
}
writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest));
console.log(samples.length, 'samples');

// ---------------- JS engines ----------------
const QUICK = process.argv.includes('--kpay-only'); // re-run only kpay rows, reuse the rest
const prev = QUICK && existsSync(OUT + 'results.json') ? JSON.parse(readFileSync(OUT + 'results.json', 'utf8')) : null;
const results: Record<string, Record<string, Row>> = {};
for (const e of engines) {
  if (QUICK && !e.name.startsWith('kpay') && prev?.results[e.name]) { results[e.name] = prev.results[e.name]; continue; }
  const rows: Record<string, Row> = {};
  // warm-up
  await e.run(samples[0], toRGBA(samples[0]));
  for (const s of samples) {
    const rgba = toRGBA(s);
    const t = performance.now();
    const text = await e.run(s, rgba);
    const ms = performance.now() - t;
    rows[s.id] = { ok: !!s.text && text === s.text, false: !s.text && text !== null, ms };
  }
  results[e.name] = rows;
  console.log('done', e.name);
}

// ---------------- WeChat native (OpenCV) ----------------
let wechatNote = '';
if (QUICK && prev) {
  for (const k of Object.keys(prev.results)) if (k.startsWith('WeChat')) results[k] = prev.results[k];
} else if (existsSync(PY)) {
  for (const t of [1, os.cpus().length]) {
    try {
      execFileSync(PY, [new URL('./wechat.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), OUT, String(t)], { stdio: 'inherit' });
      results[`WeChat (OpenCV C++, ${t} thr)`] = JSON.parse(readFileSync(`${OUT}wechat_t${t}.json`, 'utf8'));
    } catch (err) { wechatNote = 'WeChat run failed: ' + String(err); }
  }
} else wechatNote = 'Python venv with opencv-contrib-python<5 not found – WeChat column skipped.';

// ---------------- SR micro-benchmark ----------------
const sess = await createOnnxSuperRes(ort as never, ['cpu']);
const srBench: { side: number; js: number; onnx: number }[] = QUICK && prev ? prev.srBench : [];
for (const side of QUICK && prev ? [] : [64, 96, 128, 160, 240]) {
  const rgba = new Uint8ClampedArray(side * side * 4).map((_, i) => ((i * 2654435761) >>> 24));
  const x = new Float32Array(side * side).map(() => Math.random());
  superResolve(x, side, side); await sess({ data: rgba, width: side, height: side });
  const N = side > 128 ? 10 : 30;
  let t = performance.now();
  for (let i = 0; i < N; i++) superResolve(x, side, side);
  const js = (performance.now() - t) / N;
  t = performance.now();
  for (let i = 0; i < N; i++) await sess({ data: rgba, width: side, height: side });
  srBench.push({ side, js, onnx: (performance.now() - t) / N });
}

// ---------------- report ----------------
const names = Object.keys(results);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + '%' : '–');
const quant = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const codeSamples = manifest.filter((m) => !m.empty);
const emptySamples = manifest.filter((m) => m.empty);

let md = `# Benchmark\n\nGenerated by \`npx tsx bench/run.mts\` on ${new Date().toISOString().slice(0, 10)} · ${os.cpus()[0].model.trim()} · Node ${process.version} · ${os.platform()}\n\n`;
md += `Dataset: ${codeSamples.length} synthetic 1280×720 camera frames (perspective ±12 %, any rotation, Gaussian defocus σ∈{0,0.8,1.5}, noise σ=5, illumination gradient, high/low contrast, short URL + long EMV/LaoQR payload) + ${emptySamples.length} frames without a code. Every decoder sees identical pixels. A hit = exact text match.\n\n`;
md += `## Decode rate by module size (px per QR module)\n\n| engine | ${[1.5, 2, 2.5, 3, 4, 6].map((m) => m + ' px').join(' | ')} | **all** |\n|---|${'---|'.repeat(7)}\n`;
for (const n of names) {
  const cells = [1.5, 2, 2.5, 3, 4, 6].map((m) => { const g = codeSamples.filter((s) => s.module === m); return pct(g.filter((s) => results[n][s.id]?.ok).length, g.length); });
  md += `| ${n} | ${cells.join(' | ')} | **${pct(codeSamples.filter((s) => results[n][s.id]?.ok).length, codeSamples.length)}** |\n`;
}
md += `\n## Decode rate by condition\n\n| engine | sharp | blur σ0.8 | blur σ1.5 | high contrast | low contrast |\n|---|---|---|---|---|---|\n`;
for (const n of names) {
  const r = (f: (s: (typeof manifest)[0]) => boolean) => { const g = codeSamples.filter(f); return pct(g.filter((s) => results[n][s.id]?.ok).length, g.length); };
  md += `| ${n} | ${r((s) => s.blur === 0)} | ${r((s) => s.blur === 0.8)} | ${r((s) => s.blur === 1.5)} | ${r((s) => s.contrast === 'high')} | ${r((s) => s.contrast === 'low')} |\n`;
}
md += `\n## Latency per 1280×720 frame (ms)\n\n| engine | p50 | p95 | mean | p50 on hits | empty frame p50 | false positives |\n|---|---|---|---|---|---|---|\n`;
for (const n of names) {
  const all = codeSamples.map((s) => results[n][s.id].ms);
  const hits = codeSamples.filter((s) => results[n][s.id].ok).map((s) => results[n][s.id].ms);
  const empty = emptySamples.map((s) => results[n][s.id].ms);
  const fp = emptySamples.filter((s) => results[n][s.id].false).length;
  md += `| ${n} | ${quant(all, 0.5).toFixed(1)} | ${quant(all, 0.95).toFixed(1)} | ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(1)} | ${hits.length ? quant(hits, 0.5).toFixed(1) : '–'} | ${quant(empty, 0.5).toFixed(1)} | ${fp} |\n`;
}
md += `\n## Super-resolution model (WeChat CNN, 5,301 params) — ms per ROI\n\n| ROI | built-in JS kernel | ONNX Runtime (Node, CPU) |\n|---|---|---|\n`;
for (const r of srBench) md += `| ${r.side}×${r.side} | ${r.js.toFixed(1)} | ${r.onnx.toFixed(1)} |\n`;
if (wechatNote) md += `\n> ${wechatNote}\n`;
writeFileSync(OUT + 'results.json', JSON.stringify({ manifest, results, srBench }, null, 1));
writeFileSync(new URL('../BENCHMARK.generated.md', import.meta.url), md);
console.log(md);
