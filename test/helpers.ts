import QRCode from 'qrcode';

/** Render a QR with rotation, module size, and a perspective-free affine placement. */
export function render(text: string, opts: { module: number; angle?: number; W?: number; H?: number; cx?: number; cy?: number; blur?: boolean; invert?: boolean }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const W = opts.W ?? 1280;
  const H = opts.H ?? 720;
  const cx = opts.cx ?? W / 2;
  const cy = opts.cy ?? H / 2;
  const a = ((opts.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const data = new Uint8ClampedArray(W * H * 4);
  const bg = opts.invert ? 20 : 235;
  const fg = opts.invert ? 235 : 20;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // inverse transform to QR space (in modules)
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * cos + dy * sin) / opts.module + n / 2;
      const v = (-dx * sin + dy * cos) / opts.module + n / 2;
      let val = bg;
      const ui = Math.floor(u);
      const vi = Math.floor(v);
      if (ui >= 0 && vi >= 0 && ui < n && vi < n && qr.modules.get(vi, ui)) val = fg;
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

