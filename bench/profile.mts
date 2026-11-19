// Per-stage timing of the engine on 1080p frames (best of N) – guides optimisation.
import { makeSample, toRGBA, PAYLOADS } from './dataset.ts';
import { analyze, locate, textureCandidates } from '../src/engine.ts';
import { createZXingDecoder } from '../src/decoder-zxing.ts';
const zx = await createZXingDecoder();
const best = async (f: () => unknown, n = 7) => { let b = 1e9; for (let i = 0; i < n; i++) { const t = performance.now(); await f(); b = Math.min(b, performance.now() - t); } return b; };
const frames = {
  empty: makeSample({ seed: 1, text: '', module: 0, blur: 0.8, contrast: 'high', empty: true, W: 1920, H: 1080 }),
  near: makeSample({ seed: 2, text: PAYLOADS[1], module: 6, blur: 0, contrast: 'high', W: 1920, H: 1080 }),
  far: makeSample({ seed: 3, text: PAYLOADS[1], module: 2, blur: 0.8, contrast: 'high', W: 1920, H: 1080 }),
};
const rows: string[] = [];
for (const [name, s] of Object.entries(frames)) {
  const img = { data: toRGBA(s), width: s.width, height: s.height };
  const gray = s.gray;
  const tGray = await best(() => { const g = new Uint8Array(img.width * img.height); const d = img.data; for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; });
  const tZx = await best(() => zx.decode(img, false));
  const tLoc = await best(() => locate(gray, img.width, img.height));
  const tTex = await best(() => textureCandidates(gray, img.width, img.height));
  const tAll = await best(() => analyze(img, {}, zx));
  const r = await analyze(img, {}, zx);
  rows.push(`${name.padEnd(6)} gray ${tGray.toFixed(1).padStart(5)} | zxing ${tZx.toFixed(1).padStart(5)} | locate ${tLoc.toFixed(1).padStart(5)} | texture ${tTex.toFixed(1).padStart(5)} | analyze ${tAll.toFixed(1).padStart(5)} ms  → ${r.text ? 'decoded' : 'no'}`);
}
console.log(rows.join('\n'));
