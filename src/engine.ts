/**
 * Pure, DOM-free image analysis engine. Runs inside a Web Worker (preferred)
 * or on the main thread as a fallback.
 *
 *  1. decode  – pluggable decoder: ZXing-C++ (WASM, preferred) or jsQR (fallback)
 *  2. locate  – our own finder-pattern locator (1:1:3:1:1). It finds QR codes
 *               that are too small / blurry to decode and reports their
 *               module size so the zoom controller knows how far to zoom.
 *  3. refine  – decode again on an upscaled ROI around the located code.
 */

export interface Point {
  x: number;
  y: number;
}

/** Where a (possibly undecodable) QR code was seen, in frame pixels. */
export interface QRHint {
  cx: number;
  cy: number;
  /** Estimated side length of the whole code in pixels. */
  size: number;
  /** Estimated size of one module (one "dot") in pixels. */
  module: number;
  /** true when all three finder patterns were found (reliable), else a guess. */
  full: boolean;
}

import type { QRFormat } from './formats';
export type { QRFormat } from './formats';

export interface Decoded {
  text: string;
  bytes: Uint8Array;
  /** TL, TR, BR, BL */
  corners: Point[];
  /** default 'qr_code' */
  format?: QRFormat;
  /** Symbol version: '1'…'40', 'M1'…'M4' or 'R13x27' (empty when unknown). */
  version?: string;
  /** Error-correction level: 'L' | 'M' | 'Q' | 'H' (empty when unknown). */
  ecLevel?: string;
}

/** Width of a symbol in modules, from its format + version (rMQR: the long side). */
export function symbolModules(format: QRFormat | undefined, version: string | undefined): number {
  const v = version ?? '';
  if (format === 'micro_qr_code') {
    const n = parseInt(v.replace(/^M/i, ''), 10);
    return n >= 1 && n <= 4 ? 9 + 2 * n : 13;
  }
  if (format === 'rm_qr_code') {
    const m = /(\d+)\s*x\s*(\d+)/i.exec(v);
    return m ? Math.max(+m[1], +m[2]) : 43;
  }
  const n = parseInt(v, 10);
  return n >= 1 && n <= 40 ? 17 + 4 * n : 25;
}

export interface Decoder {
  /** true = too slow to run on every full frame (jsQR) */
  slow: boolean;
  /**
   * `invert`: also try white-on-black codes.
   * `formats`: QR-family members to accept (default: all of them).
   */
  decode(img: AnalyzeInput, invert: boolean, formats?: readonly QRFormat[]): Promise<Decoded | null>;
}

export interface AnalyzeInput {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

export interface AnalyzeOptions {
  /** Also look for inverted (white-on-black) codes. */
  invert?: boolean;
  /** The image is already a crop around a located code: just decode it (optionally upscaled). */
  roiOnly?: boolean;
  /** Upscale factor for roiOnly images. */
  upscale?: number;
  /** Allow CNN super-resolution on this frame (default: when a SuperRes is supplied). */
  sr?: boolean;
  /**
   * Also run the slow whole-frame jsQR pass even when the cheap locator saw
   * nothing. The caller sets this every few frames as a safety net.
   */
  thorough?: boolean;
  /** Where the code was last seen: decode there first (fast tracking path). */
  hint?: QRHint | null;
  /** QR-family members to accept (default: all of them). */
  formats?: readonly QRFormat[];
}

export interface AnalyzeResult {
  text?: string;
  bytes?: Uint8Array;
  /** TL, TR, BR, BL in frame pixels. */
  corners?: Point[];
  hint?: QRHint | null;
  format?: QRFormat;
  version?: string;
  ecLevel?: string;
  /** Mean luminance 0..255, used for the "too dark, turn on torch" hint. */
  luma: number;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

let grayBuf: Uint8Array | null = null;

function toGray(img: AnalyzeInput): { gray: Uint8Array; luma: number } {
  const n = img.width * img.height;
  if (!grayBuf || grayBuf.length !== n) grayBuf = new Uint8Array(n);
  const g = grayBuf;
  const d = img.data;
  let sum = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    g[i] = v;
    // sample luminance sparsely – good enough for a brightness estimate
    if ((i & 15) === 0) sum += v;
  }
  return { gray: g, luma: sum / Math.ceil(n / 16) };
}


/* ------------------------------------------------------------------ */
/* finder pattern locator                                              */
/* ------------------------------------------------------------------ */

interface Finder {
  x: number;
  y: number;
  m: number; // module size
  n: number; // votes
}

function ratioOk(r: number[], strict = false): boolean {
  const total = r[0] + r[1] + r[2] + r[3] + r[4];
  if (total < 7) return false;
  const m = total / 7;
  const tol = m * (strict ? 0.6 : 0.85);
  return (
    Math.abs(r[0] - m) < tol &&
    Math.abs(r[1] - m) < tol &&
    Math.abs(r[3] - m) < tol &&
    Math.abs(r[4] - m) < tol &&
    Math.abs(r[2] - 3 * m) < 3 * tol
  );
}

let thrBuf: Uint8Array | null = null;
let blockBuf: Float32Array | null = null;

/**
 * Per-pixel adaptive threshold map, built from 16×16 block means smoothed over a window of
 * about w/8 (same neighbourhood as a w/16-radius integral window, ~4× cheaper per lookup).
 * Returns the threshold *block* map; a pixel is "dark" when gray < thr[block].
 */
function blockThresholds(gray: Uint8Array, w: number, h: number, factor: number) {
  const B = 16;
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  if (!blockBuf || blockBuf.length !== bw * bh) blockBuf = new Float32Array(bw * bh);
  const mean = blockBuf;
  // block means (sampling every 2nd pixel/row is plenty for a local mean)
  for (let by = 0; by < bh; by++) {
    const y0 = by * B, y1 = Math.min(h, y0 + B);
    for (let bx = 0; bx < bw; bx++) {
      const x0 = bx * B, x1 = Math.min(w, x0 + B);
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        const row = y * w;
        for (let x = x0; x < x1; x += 2) { sum += gray[row + x]; n++; }
      }
      mean[by * bw + bx] = sum / n;
    }
  }
  // smooth over (2R+1)² blocks with a summed-area table on the (small) block grid
  const R = Math.max(2, Math.round(w / 16 / B));
  const SW = bw + 1;
  const S = new Float32Array(SW * (bh + 1));
  for (let by = 0; by < bh; by++) {
    let row = 0;
    for (let bx = 0; bx < bw; bx++) {
      row += mean[by * bw + bx];
      S[(by + 1) * SW + bx + 1] = S[by * SW + bx + 1] + row;
    }
  }
  if (!thrBuf || thrBuf.length !== bw * bh) thrBuf = new Uint8Array(bw * bh);
  const thr = thrBuf;
  for (let by = 0; by < bh; by++) {
    const y0 = Math.max(0, by - R), y1 = Math.min(bh, by + R + 1);
    for (let bx = 0; bx < bw; bx++) {
      const x0 = Math.max(0, bx - R), x1 = Math.min(bw, bx + R + 1);
      const sum = S[y1 * SW + x1] - S[y0 * SW + x1] - S[y1 * SW + x0] + S[y0 * SW + x0];
      thr[by * bw + bx] = Math.min(255, (sum / ((x1 - x0) * (y1 - y0))) * factor);
    }
  }
  return { thr, bw };
}

export function locate(gray: Uint8Array, w: number, h: number, invert = false): QRHint | null {
  // dark: clearly darker than the neighbourhood (0.9×); inverted codes: clearly brighter (1.1×)
  const { thr, bw } = blockThresholds(gray, w, h, invert ? 1.1 : 0.9);
  const black = invert
    ? (x: number, y: number): boolean => gray[y * w + x] > thr[(y >> 4) * bw + (x >> 4)]
    : (x: number, y: number): boolean => gray[y * w + x] < thr[(y >> 4) * bw + (x >> 4)];

  /** count runs along a direction through (cx,cy); returns centre & total length */
  const cross = (cx: number, cy: number, dx: number, dy: number, expected: number) => {
    const limit = Math.ceil(expected * 2);
    const walk = (sx: number, sy: number, sd: number) => {
      // returns [blackRunInCentre, white, black]
      const out = [0, 0, 0];
      let x = sx;
      let y = sy;
      let state = 0; // 0 centre black,1 white,2 outer black
      for (let i = 0; i < limit; i++) {
        x += dx * sd;
        y += dy * sd;
        if (x < 0 || y < 0 || x >= w || y >= h) return null;
        const b = black(x, y);
        if (state === 0) {
          if (b) out[0]++;
          else { state = 1; out[1]++; }
        } else if (state === 1) {
          if (!b) out[1]++;
          else { state = 2; out[2]++; }
        } else {
          if (b) out[2]++;
          else return out;
        }
      }
      return null;
    };
    const a = walk(cx, cy, -1);
    const b = walk(cx, cy, 1);
    if (!a || !b || a[2] === 0 || b[2] === 0) return null;
    const centre = a[0] + b[0] + 1;
    const runs = [a[2], a[1], centre, b[1], b[2]];
    if (!ratioOk(runs)) return null;
    const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
    // centre offset along the axis
    const off = (b[0] - a[0]) / 2;
    return { total, ox: dx * off, oy: dy * off };
  };

  const finders: Finder[] = [];
  const addFinder = (x: number, y: number, m: number) => {
    for (const f of finders) {
      const lim = Math.max(f.m, m) * 2.5;
      if (Math.abs(f.x - x) < lim && Math.abs(f.y - y) < lim && Math.abs(f.m - m) < Math.max(f.m, m) * 0.5) {
        const k = f.n;
        f.x = (f.x * k + x) / (k + 1);
        f.y = (f.y * k + y) / (k + 1);
        f.m = (f.m * k + m) / (k + 1);
        f.n++;
        return;
      }
    }
    if (finders.length < 200) finders.push({ x, y, m, n: 1 });
  };

  const runs = [0, 0, 0, 0, 0];
  const step = 2;
  for (let y = step >> 1; y < h; y += step) {
    let run = 0;
    let cur = black(0, y);
    let ri = 0; // number of runs recorded in ring
    runs[0] = runs[1] = runs[2] = runs[3] = runs[4] = 0;
    for (let x = 1; x <= w; x++) {
      const b = x < w ? black(x, y) : !cur;
      run++;
      if (b !== cur || x === w) {
        // run ended at x-1; push
        runs[0] = runs[1]; runs[1] = runs[2]; runs[2] = runs[3]; runs[3] = runs[4]; runs[4] = run;
        ri++;
        if (cur && ri >= 5 && ratioOk(runs)) {
          const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
          const cx = x - runs[4] - runs[3] - runs[2] / 2;
          const m = total / 7;
          const cxi = Math.round(cx - 0.5);
          const v = cross(cxi, y, 0, 1, total);
          if (v) {
            const cy = y + v.oy;
            const hz = cross(cxi, Math.round(cy), 1, 0, total);
            if (hz) addFinder(cxi + hz.ox, cy, (m + v.total / 7) / 2);
          }
        }
        cur = b;
        run = 0;
      }
    }
  }

  const good = finders.filter((f) => f.n >= 2).sort((a, b) => b.n - a.n).slice(0, 14);
  if (!good.length) return null;

  // look for three finders forming a right isosceles triangle
  let best: { err: number; hint: QRHint } | null = null;
  for (let i = 0; i < good.length; i++) {
    for (let j = i + 1; j < good.length; j++) {
      for (let k = j + 1; k < good.length; k++) {
        const t = [good[i], good[j], good[k]];
        const ms = t.map((f) => f.m);
        if (Math.max(...ms) / Math.min(...ms) > 1.8) continue;
        const d = (a: Finder, b: Finder) => Math.hypot(a.x - b.x, a.y - b.y);
        const pairs: [number, number, number][] = [
          [d(t[0], t[1]), 0, 1],
          [d(t[0], t[2]), 0, 2],
          [d(t[1], t[2]), 1, 2],
        ];
        pairs.sort((p, q) => q[0] - p[0]);
        const hyp = pairs[0];
        const l1 = pairs[1][0];
        const l2 = pairs[2][0];
        const legErr = Math.abs(l1 - l2) / Math.max(l1, l2);
        const hypErr = Math.abs(hyp[0] - Math.SQRT2 * ((l1 + l2) / 2)) / hyp[0];
        if (legErr > 0.4 || hypErr > 0.3) continue;
        const m = (ms[0] + ms[1] + ms[2]) / 3;
        const leg = (l1 + l2) / 2;
        if (leg < m * 6) continue; // finders cannot be closer than that
        const err = legErr + hypErr;
        if (!best || err < best.err) {
          const a = t[hyp[1]];
          const b = t[hyp[2]];
          best = {
            err,
            hint: {
              cx: (a.x + b.x) / 2,
              cy: (a.y + b.y) / 2,
              size: leg + 7 * m,
              module: m,
              full: true,
            },
          };
        }
      }
    }
  }
  if (best) return best.hint;

  // partial evidence: 1–2 finders. Position is a guess; module size is real.
  const f = good[0];
  if (good.length >= 2) {
    const g = good[1];
    const dist = Math.hypot(f.x - g.x, f.y - g.y);
    return {
      cx: (f.x + g.x) / 2,
      cy: (f.y + g.y) / 2,
      size: dist * 1.3 + 7 * f.m,
      module: (f.m + g.m) / 2,
      full: false,
    };
  }
  return { cx: f.x, cy: f.y, size: f.m * 29, module: f.m, full: false };
}

/* ------------------------------------------------------------------ */
/* texture detector (blur-tolerant second opinion)                     */
/* ------------------------------------------------------------------ */

/**
 * Finds compact, square-ish patches of dense edges – what a QR looks like even when it is too
 * blurred for finder patterns to survive (the job WeChat gives its CNN detector).
 * ~3 ms @720p. Returns up to `max` candidates, best first.
 */
export function textureCandidates(gray: Uint8Array, w: number, h: number, max = 3): QRHint[] {
  const C = 8;
  const gw = Math.floor(w / C), gh = Math.floor(h / C);
  const E = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let e = 0;
      const x0 = cx * C, y0 = cy * C;
      for (let y = y0; y < y0 + C; y += 2) {
        const row = y * w;
        for (let x = x0; x < x0 + C; x += 2) {
          const v = gray[row + x];
          e += Math.abs(v - gray[row + x + 1]) + Math.abs(v - gray[row + w + x]);
        }
      }
      E[cy * gw + cx] = e / 16;
    }
  }
  const sorted = Float32Array.from(E).sort();
  const median = sorted[sorted.length >> 1];
  const thr = Math.max(7, median * 2.5, sorted[Math.floor(sorted.length * 0.6)] * 1.5);
  const label = new Int32Array(gw * gh).fill(-1);
  const out: { hint: QRHint; score: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (label[i] !== -1 || E[i] < thr) continue;
    let n = 0, sumE = 0, minx = gw, miny = gh, maxx = 0, maxy = 0;
    stack.push(i);
    label[i] = i;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % gw, y = (j / gw) | 0;
      n++; sumE += E[j];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      const nb = [x > 0 ? j - 1 : -1, x < gw - 1 ? j + 1 : -1, y > 0 ? j - gw : -1, y < gh - 1 ? j + gw : -1];
      for (const k of nb) if (k >= 0 && label[k] === -1 && E[k] >= thr) { label[k] = i; stack.push(k); }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    const fill = n / (bw * bh);
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);
    if (n < 4 || Math.max(bw, bh) * C > Math.min(w, h) * 0.9 || aspect > 2.2 || fill < 0.4) continue;
    const size = Math.max(bw, bh) * C;
    out.push({
      hint: { cx: (minx + maxx + 1) * C / 2, cy: (miny + maxy + 1) * C / 2, size, module: size / 29, full: false },
      score: fill * (sumE / n) * Math.min(1, n / 9) / aspect,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max).map((o) => o.hint);
}

/* ------------------------------------------------------------------ */
/* decoding                                                            */
/* ------------------------------------------------------------------ */

/** Crop (and optionally upscale with bilinear filtering) an RGBA region. */
function cropScale(img: AnalyzeInput, rx: number, ry: number, rw: number, rh: number, k: number) {
  const ow = Math.round(rw * k);
  const oh = Math.round(rh * k);
  const out = new Uint8ClampedArray(ow * oh * 4);
  const src = img.data;
  const sw = img.width;
  for (let y = 0; y < oh; y++) {
    const fy = ry + (y + 0.5) / k - 0.5;
    const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < ow; x++) {
      const fx = rx + (x + 0.5) / k - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const o = (y * ow + x) * 4;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[a + ch] + (src[b + ch] - src[a + ch]) * tx;
        const bot = src[c + ch] + (src[d + ch] - src[c + ch]) * tx;
        out[o + ch] = top + (bot - top) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ow, height: oh };
}

/** ×2 super-resolution hook (WeChat CNN). Output may be (2h-1)×(2w-1). */
export type SuperRes = ((img: AnalyzeInput) => Promise<AnalyzeInput>) & {
  /** largest ROI side worth sending to this backend (JS kernel is ~10× slower than ONNX/WebGPU) */
  maxSide?: number;
};

/** SR is only worth it on small crops of small codes (cost ∝ pixels, ~5k MAC/px). */
const SR_MAX_SIDE = 160;

/** CNN ×2, then bilinear ×2 – measured best combination for ZXing (bench/diag.mts). */
async function decodeWithSR(
  roi: AnalyzeInput, invert: boolean, dec: Decoder, sr: SuperRes, formats?: readonly QRFormat[],
): Promise<{ r: Decoded; k: number } | null> {
  const up = await sr(roi);
  const up2 = cropScale(up, 0, 0, up.width, up.height, 2);
  const k = up2.width / roi.width;
  const r = await dec.decode(up2, invert, formats);
  return r ? { r, k } : null;
}

async function decodeRoi(
  img: AnalyzeInput, hint: QRHint, invert: boolean, dec: Decoder, sr?: SuperRes | null, formats?: readonly QRFormat[],
): Promise<AnalyzeResult | null> {
  const pad = hint.full ? 0.3 : 0.45;
  const side = hint.size * (1 + pad);
  const x0 = Math.max(0, Math.floor(hint.cx - side / 2));
  const y0 = Math.max(0, Math.floor(hint.cy - side / 2));
  const x1 = Math.min(img.width, Math.ceil(hint.cx + side / 2));
  const y1 = Math.min(img.height, Math.ceil(hint.cy + side / 2));
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 24 || rh < 24) return null;
  // aim for ~4 px per module after upscaling, never above 4x or ~1600 px
  let k = Math.min(4, Math.max(1, 4 / Math.max(1, hint.module)), 1600 / Math.max(rw, rh));
  k = Math.round(k * 2) / 2;
  const roi = k === 1 && rw === img.width && rh === img.height ? img : cropScale(img, x0, y0, rw, rh, k);
  const r = await dec.decode(roi, invert, formats);
  if (r) {
    const map = (p: Point): Point => ({ x: x0 + p.x / k, y: y0 + p.y / k });
    return { ...meta(r), corners: r.corners.map(map), luma: 0 };
  }
  // WeChat-style: small code that bilinear upscaling could not rescue → CNN super-resolution
  if (sr && hint.module < 4.5 && Math.max(rw, rh) <= (sr.maxSide ?? SR_MAX_SIDE)) {
    const crop = cropScale(img, x0, y0, rw, rh, 1);
    const s = await decodeWithSR(crop, invert, dec, sr, formats);
    if (s) {
      const map = (p: Point): Point => ({ x: x0 + p.x / s.k, y: y0 + p.y / s.k });
      return { ...meta(s.r), corners: s.r.corners.map(map), luma: 0 };
    }
  }
  return null;
}

const meta = (r: Decoded) => ({
  text: r.text, bytes: r.bytes, format: r.format ?? 'qr_code', version: r.version ?? '', ecLevel: r.ecLevel ?? '',
});

function fromDecoded(r: Decoded, luma: number): AnalyzeResult {
  const c = r.corners;
  // TL→TR is the long side of an rMQR symbol, matching symbolModules()
  const size = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
  return {
    ...meta(r),
    corners: c,
    hint: { cx: (c[0].x + c[2].x) / 2, cy: (c[0].y + c[2].y) / 2, size, module: size / symbolModules(r.format, r.version), full: true },
    luma,
  };
}

export async function analyze(img: AnalyzeInput, opts: AnalyzeOptions, dec: Decoder, sr?: SuperRes | null): Promise<AnalyzeResult> {
  const invert = !!opts.invert;
  const useSR = opts.sr === false ? null : sr ?? null;
  const { gray, luma } = toGray(img);

  // crop already centred on a code (native-resolution "digital zoom" pass)
  if (opts.roiOnly) {
    const k = opts.upscale && opts.upscale > 1 ? opts.upscale : 1;
    const src = k > 1 ? cropScale(img, 0, 0, img.width, img.height, k) : img;
    const r = await dec.decode(src, invert, opts.formats);
    if (r) return fromDecoded({ ...r, corners: r.corners.map((p) => ({ x: p.x / k, y: p.y / k })) }, luma);
    if (useSR && k > 1 && Math.max(img.width, img.height) <= (useSR.maxSide ?? SR_MAX_SIDE)) {
      const s = await decodeWithSR(img, invert, dec, useSR, opts.formats);
      if (s) return fromDecoded({ ...s.r, corners: s.r.corners.map((p) => ({ x: p.x / s.k, y: p.y / s.k })) }, luma);
    }
    return { luma };
  }

  // 1) tracking path: look where the code was last frame
  if (opts.hint) {
    const r = await decodeRoi(img, opts.hint, invert, dec, useSR, opts.formats);
    if (r) return { ...r, hint: opts.hint, luma };
  }

  // 2) whole frame. ZXing-C++ does 1080p in ~8 ms so it runs every frame;
  //    the slow jsQR fallback only runs now and then.
  if (!dec.slow || opts.thorough) {
    const full = await dec.decode(img, invert, opts.formats);
    if (full) return fromDecoded(full, luma);
  }

  // 3) codes too small / blurry to decode: finder-pattern locator + texture detector,
  //    each candidate retried on an upscaled ROI; CNN super-resolution for at most one per frame
  const hint = locate(gray, img.width, img.height, invert);
  const cands: QRHint[] = hint ? [hint] : [];
  for (const t of textureCandidates(gray, img.width, img.height)) {
    if (cands.length >= 3) break;
    if (!cands.some((c) => Math.hypot(c.cx - t.cx, c.cy - t.cy) < Math.max(c.size, t.size) * 0.6)) cands.push(t);
  }
  let srBudget = useSR;
  for (const c of cands) {
    const r = await decodeRoi(img, c, invert, dec, srBudget, opts.formats);
    if (r) return { ...r, hint: c, luma };
    if (srBudget && c.module < 4.5) srBudget = null;
  }
  return { hint: hint ?? cands[0] ?? null, luma };
}

