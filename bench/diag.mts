// Is the bottleneck SR quality, or localisation? Use ground-truth crops around the code.
import { makeSample, PAYLOADS, toRGBA } from './dataset.ts';
import { locate } from '../src/engine.ts';
import { createZXingDecoder } from '../src/decoder-zxing.ts';
import { superResolveRGBA } from '../src/sr.ts';
const zx = await createZXingDecoder();
function cropScale(img: any, x0: number, y0: number, w: number, h: number, k: number) {
  const ow = Math.round(w * k), oh = Math.round(h * k), out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const fx = x0 + (x + 0.5) / k - 0.5, fy = y0 + (y + 0.5) / k - 0.5;
    const ix = Math.max(0, Math.min(img.width - 2, Math.floor(fx))), iy = Math.max(0, Math.min(img.height - 2, Math.floor(fy)));
    const tx = fx - ix, ty = fy - iy; const g = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 4];
    const v = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
    const o = (y * ow + x) * 4; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  return { data: out, width: ow, height: oh };
}
for (const module of [1.5, 2, 2.5]) for (const blur of [0, 0.8, 1.5]) {
  let loc = 0, gtBil = 0, gtSR = 0, gtSRbil = 0, n = 0;
  for (let i = 0; i < 8; i++) {
    const text = PAYLOADS[i % 2];
    const s = makeSample({ seed: 5000 + i * 7 + Math.round(module * 10) + blur * 3, text, module, blur, contrast: 'high' });
    const img = { data: toRGBA(s), width: s.width, height: s.height };
    // ground-truth: brute-force find code bbox by darkest region is hard; re-render without noise isn't possible → use locate on a clean high-contrast render
    const clean = makeSample({ seed: 5000 + i * 7 + Math.round(module * 10) + blur * 3, text, module: module * 1, blur: 0, contrast: 'high' });
    const h = locate(clean.gray, clean.width, clean.height);
    const hl = locate(s.gray, s.width, s.height);
    n++;
    if (hl) loc++;
    if (!h) continue;
    const side = h.size * 1.5, x0 = Math.max(0, h.cx - side / 2), y0 = Math.max(0, h.cy - side / 2);
    const roi = cropScale(img, x0, y0, side, side, 1);
    if (await zx.decode(cropScale(img, x0, y0, side, side, 2), false)) gtBil++;
    const sr = superResolveRGBA(roi);
    if (await zx.decode(sr, false)) gtSR++;
    if (await zx.decode(cropScale(sr, 0, 0, sr.width, sr.height, 2), false)) gtSRbil++;
  }
  console.log(`m=${module} blur=${blur}: locator found ${loc}/${n} | GT-crop decode: bilinear×2 ${gtBil}, SR×2 ${gtSR}, SR×2+bilinear×2 ${gtSRbil}`);
}
