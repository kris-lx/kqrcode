/**
 * Deterministic synthetic "camera" dataset: QR codes with perspective, rotation,
 * Gaussian blur (defocus), sensor noise, low contrast and an illumination gradient,
 * anti-aliased by 3×3 supersampling. Same images are fed to every decoder.
 */
import QRCode from 'qrcode';

export interface Sample {
  id: string;
  text: string;
  module: number; // px per module (code side / module count)
  blur: number; // gaussian sigma px
  contrast: 'high' | 'low';
  empty?: boolean;
  width: number;
  height: number;
  gray: Uint8Array;
}

export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PAYLOADS = [
  'https://pay.example.com/kpay?o=8f3a2c&amt=125000',
  // EMVCo merchant-presented QR (LaoQR-style) – long payload → higher QR version, smaller modules
  '00020101021238670016A00526628466257701082771041802030020324LAOQR0000000000000000000000005204581253034185405125005802LA5909KPAY SHOP6009VIENTIANE62180714KPAY-ORD-0001630446C1',
];

/** solve 8×8 linear system (Gauss-Jordan) for homography */
function homography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return src;
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = a;
  }
  return out;
}

export function makeSample(o: {
  seed: number; text: string; module: number; blur: number; contrast: 'high' | 'low'; empty?: boolean; W?: number; H?: number;
}): Sample {
  const W = o.W ?? 1280, H = o.H ?? 720;
  const R = rng(o.seed);
  const qr = o.empty ? null : QRCode.create(o.text, { errorCorrectionLevel: 'M' });
  const n = qr ? qr.modules.size : 21;
  const L = n * o.module;
  const cx = W * (0.3 + 0.4 * R()), cy = H * (0.3 + 0.4 * R());
  const ang = R() * Math.PI * 2;
  const persp = 0.12 * L;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = (sx * L) / 2, y = (sy * L) / 2;
    return [
      cx + x * Math.cos(ang) - y * Math.sin(ang) + (R() - 0.5) * persp,
      cy + x * Math.sin(ang) + y * Math.cos(ang) + (R() - 0.5) * persp,
    ];
  });
  // image → module space
  const Hm = homography(corners, [[0, 0], [n, 0], [n, n], [0, n]]);
  const [bg, fg] = o.contrast === 'high' ? [225, 30] : [165, 95];
  const img = new Float32Array(W * H);
  const gx = (R() - 0.5) * 60, gy = (R() - 0.5) * 60; // illumination gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let dark = 0;
      if (!o.empty) {
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;
          const d = Hm[6] * px + Hm[7] * py + 1;
          const u = (Hm[0] * px + Hm[1] * py + Hm[2]) / d;
          const v = (Hm[3] * px + Hm[4] * py + Hm[5]) / d;
          if (u >= 0 && v >= 0 && u < n && v < n && qr!.modules.get(Math.floor(v), Math.floor(u))) dark++;
        }
      } else if (((x >> 5) + (y >> 5)) % 7 === 0) dark = 4; // some texture so empty frames aren't trivial
      const base = bg + gx * (x / W - 0.5) + gy * (y / H - 0.5);
      img[y * W + x] = base + ((fg - bg) * dark) / 9;
    }
  }
  const blurred = gaussianBlur(img, W, H, o.blur);
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    // Box–Muller noise σ=5
    const u1 = R() || 1e-9, u2 = R();
    const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 5;
    gray[i] = Math.max(0, Math.min(255, Math.round(blurred[i] + noise)));
  }
  return {
    id: `${o.empty ? 'empty' : 'm' + o.module}_b${o.blur}_${o.contrast}_${o.seed}`,
    text: o.text, module: o.module, blur: o.blur, contrast: o.contrast, empty: o.empty, width: W, height: H, gray,
  };
}

export function* dataset(perCell = 4): Generator<Sample> {
  let seed = 1000;
  for (const module of [1.5, 2, 2.5, 3, 4, 6])
    for (const blur of [0, 0.8, 1.5])
      for (const contrast of ['high', 'low'] as const)
        for (let i = 0; i < perCell; i++) {
          seed++;
          yield makeSample({ seed, text: PAYLOADS[i % 2], module, blur, contrast });
        }
  for (let i = 0; i < 8; i++) yield makeSample({ seed: 9000 + i, text: '', module: 0, blur: 0.8, contrast: 'high', empty: true });
}

export function toRGBA(s: Sample): Uint8ClampedArray {
  const out = new Uint8ClampedArray(s.width * s.height * 4);
  for (let i = 0, j = 0; i < s.gray.length; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = s.gray[i]; out[j + 3] = 255; }
  return out;
}
