/**
 * WeChat QR super-resolution CNN (from OpenCV `wechat_qrcode`, Apache-2.0), re-implemented
 * as a dependency-free float32 kernel. 5.3k parameters, ×2 upscale (H×W → (2H-1)×(2W-1)).
 *
 *   conv3x3(1→32) → 2 × dense block [1x1 reduce → depthwise 3x3 → 1x1 expand, concat]
 *   → 1x1(96→32) → depthwise deconv ×2 → 1x1(32→1)  +  nearest ×2 of the input (residual)
 *
 * Verified against OpenCV DNN output in test/sr.test.ts.
 */
import { SR_LAYOUT, SR_WEIGHTS_B64 } from './sr-weights.generated';

const SLOPE = 0.05000000074505806;

let W: Float32Array | null = null;
function weights(): Float32Array {
  if (W) return W;
  const bin = atob(SR_WEIGHTS_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  W = new Float32Array(u8.buffer);
  return W;
}
const param = (name: string): Float32Array => {
  const [off, n] = SR_LAYOUT[name];
  return weights().subarray(off, off + n);
};

function leaky(a: Float32Array) {
  for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] *= SLOPE;
}

/** 1x1 convolution: in [ci,HW] → out [co,HW] */
function conv1x1(inp: Float32Array, ci: number, hw: number, name: string, co: number, out?: Float32Array, outOff = 0) {
  const w = param(name + ':0');
  const b = param(name + ':1');
  const o = out ?? new Float32Array(co * hw);
  for (let c = 0; c < co; c++) {
    const dst = outOff + c * hw;
    const bias = b[c];
    for (let p = 0; p < hw; p++) o[dst + p] = bias;
    for (let k = 0; k < ci; k++) {
      const wk = w[c * ci + k];
      if (wk === 0) continue;
      const src = k * hw;
      for (let p = 0; p < hw; p++) o[dst + p] += wk * inp[src + p];
    }
  }
  return o;
}

/** 3x3 conv, stride 1, pad 1. depthwise when `depthwise` (ci == co), else ci must be 1. */
function conv3x3(inp: Float32Array, c: number, h: number, w: number, name: string, co: number, depthwise: boolean, out?: Float32Array) {
  const wt = param(name + ':0');
  const b = param(name + ':1');
  const hw = h * w;
  const o = out ?? new Float32Array(co * hw);
  for (let oc = 0; oc < co; oc++) {
    const src = depthwise ? oc * hw : 0;
    const k = wt.subarray(oc * 9, oc * 9 + 9);
    const dst = oc * hw;
    const bias = b[oc];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = bias;
        for (let ky = -1; ky <= 1; ky++) {
          const yy = y + ky;
          if (yy < 0 || yy >= h) continue;
          const row = src + yy * w;
          const kr = (ky + 1) * 3;
          for (let kx = -1; kx <= 1; kx++) {
            const xx = x + kx;
            if (xx < 0 || xx >= w) continue;
            s += k[kr + kx + 1] * inp[row + xx];
          }
        }
        o[dst + y * w + x] = s;
      }
    }
  }
  void c;
  return o;
}

/** depthwise transposed conv, k3 s2 p1: [c,h,w] → [c,2h-1,2w-1] */
function deconvDW(inp: Float32Array, c: number, h: number, w: number, name: string) {
  const wt = param(name + ':0');
  const b = param(name + ':1');
  const oh = 2 * h - 1, ow = 2 * w - 1;
  const o = new Float32Array(c * oh * ow);
  for (let ch = 0; ch < c; ch++) {
    const k = wt.subarray(ch * 9, ch * 9 + 9);
    const dst = ch * oh * ow;
    o.fill(b[ch], dst, dst + oh * ow);
    const src = ch * h * w;
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const v = inp[src + iy * w + ix];
        if (v === 0) continue;
        for (let ky = 0; ky < 3; ky++) {
          const oy = iy * 2 - 1 + ky;
          if (oy < 0 || oy >= oh) continue;
          for (let kx = 0; kx < 3; kx++) {
            const ox = ix * 2 - 1 + kx;
            if (ox < 0 || ox >= ow) continue;
            o[dst + oy * ow + ox] += v * k[ky * 3 + kx];
          }
        }
      }
    }
  }
  return o;
}

/**
 * Run the network. `x`: grayscale in [0,1], row-major h×w.
 * Returns float output in [0,1]-ish of size (2h-1)×(2w-1).
 */
export function superResolve(x: Float32Array, h: number, w: number): { data: Float32Array; width: number; height: number } {
  const hw = h * w;
  const c0 = conv3x3(x, 1, h, w, 'conv0', 32, false);
  leaky(c0);

  // dense block 1: concat [conv0 (32), db1 (32)] → 64
  const cat1 = new Float32Array(64 * hw);
  cat1.set(c0);
  let r = conv1x1(c0, 32, hw, 'db1/reduce', 8); leaky(r);
  let d = conv3x3(r, 8, h, w, 'db1/3x3', 8, true); leaky(d);
  conv1x1(d, 8, hw, 'db1/1x1', 32, cat1, 32 * hw);
  leaky(cat1.subarray(32 * hw));

  // dense block 2: concat [cat1 (64), db2 (32)] → 96
  const cat2 = new Float32Array(96 * hw);
  cat2.set(cat1);
  r = conv1x1(cat1, 64, hw, 'db2/reduce', 8); leaky(r);
  d = conv3x3(r, 8, h, w, 'db2/3x3', 8, true); leaky(d);
  conv1x1(d, 8, hw, 'db2/1x1', 32, cat2, 64 * hw);
  leaky(cat2.subarray(64 * hw));

  const red = conv1x1(cat2, 96, hw, 'upsample/reduce', 32); leaky(red);
  const up = deconvDW(red, 32, h, w, 'upsample/deconv'); leaky(up);
  const oh = 2 * h - 1, ow = 2 * w - 1;
  const rec = conv1x1(up, 32, oh * ow, 'upsample/rec', 1);

  // residual: nearest ×2 (fixed 2x2 deconv weights) cropped to (2h-1)×(2w-1)
  const nw = param('nearest:0');
  for (let y = 0; y < oh; y++) {
    const iy = y >> 1, ky = y & 1;
    for (let xx = 0; xx < ow; xx++) {
      rec[y * ow + xx] += x[iy * w + (xx >> 1)] * nw[ky * 2 + (xx & 1)];
    }
  }
  return { data: rec, width: ow, height: oh };
}

/** Convenience: RGBA/gray-in → RGBA-out ×2 upscale for the decoder. */
export function superResolveRGBA(img: { data: Uint8ClampedArray; width: number; height: number }) {
  const { width: w, height: h, data } = img;
  const x = new Float32Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) x[i] = ((data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8) / 255;
  const y = superResolve(x, h, w);
  const out = new Uint8ClampedArray(y.width * y.height * 4);
  for (let i = 0, j = 0; i < y.data.length; i++, j += 4) {
    const v = y.data[i] * 255;
    out[j] = out[j + 1] = out[j + 2] = v;
    out[j + 3] = 255;
  }
  return { data: out, width: y.width, height: y.height };
}
