import QRCode from 'qrcode';
import { writeBarcode } from 'zxing-wasm/full';

export interface RenderOpts {
  module: number; angle?: number; W?: number; H?: number; cx?: number; cy?: number; blur?: boolean; invert?: boolean;
  /** Film a display: lower contrast plus the screen's pixel grid beating against the sensor (0–1). */
  screen?: number;
}

/** Render a QR with rotation, module size, and a perspective-free affine placement. */
export function render(text: string, opts: RenderOpts) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  return renderMatrix((u, v) => !!qr.modules.get(v, u), n, n, opts);
}

/** Render any QR-family symbol (QR Code, Micro QR, rMQR) created by ZXing's writer. */
export async function renderSymbol(format: 'QRCode' | 'MicroQRCode' | 'RMQRCode', text: string, opts: RenderOpts) {
  const w = await writeBarcode(text, { format });
  if (!w.symbol) throw new Error(w.error || 'writeBarcode failed');
  const { data, width, height } = w.symbol;
  return renderMatrix((u, v) => data[v * width + u] < 128, width, height, opts);
}

export function renderMatrix(dark: (u: number, v: number) => boolean, nw: number, nh: number, opts: RenderOpts) {
  const W = opts.W ?? 1280;
  const H = opts.H ?? 720;
  const cx = opts.cx ?? W / 2;
  const cy = opts.cy ?? H / 2;
  const a = ((opts.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const data = new Uint8ClampedArray(W * H * 4);
  const scr = opts.screen ?? 0;
  const bg = scr ? 185 : opts.invert ? 20 : 235;
  const fg = scr ? 75 : opts.invert ? 235 : 20;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // inverse transform to symbol space (in modules)
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * cos + dy * sin) / opts.module + nw / 2;
      const v = (-dx * sin + dy * cos) / opts.module + nh / 2;
      let val = bg;
      const ui = Math.floor(u);
      const vi = Math.floor(v);
      if (ui >= 0 && vi >= 0 && ui < nw && vi < nh && dark(ui, vi)) val = fg;
      // moiré: LCD pixel grid (periods ~2.4 / 3.3 px) sampled by the camera
      if (scr) val *= 1 - scr * (0.5 + 0.5 * Math.cos((2 * Math.PI * x) / 2.37 + y * 0.02)) * (0.6 + 0.4 * Math.cos((2 * Math.PI * y) / 3.31));
      // mild deterministic noise
      val += ((x * 7 + y * 13) % 9) - 4;
      const o = (y * W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = val;
      data[o + 3] = 255;
    }
  }
  if (opts.blur) boxBlur(data, W, H);
  return { data, width: W, height: H };
}

function boxBlur(d: Uint8ClampedArray, w: number, h: number) {
  const src = Uint8ClampedArray.from(d);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += src[((y + j) * w + x + i) * 4];
      const o = (y * w + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = s / 9;
    }
}

