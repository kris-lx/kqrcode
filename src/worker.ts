/// <reference lib="webworker" />
import { analyze, type AnalyzeOptions, type Decoder, type SuperRes } from './engine';
import { createZXingDecoder } from './decoder-zxing';
import { createOnnxSuperRes, jsSuperRes, type OrtLike } from './sr-providers';

export type SRMode = 'js' | 'webgpu' | 'off';
type Config = { type: 'config'; sr: SRMode; ortUrl: string };
type Req = { id: number; opts: AnalyzeOptions } & (
  | { bitmap: ImageBitmap }
  | { pixels: ArrayBuffer; width: number; height: number }
);

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

// If WASM cannot start (CSP without 'wasm-unsafe-eval', very old engine) the main thread falls back
// to jsQR – jsQR is not bundled here, which keeps the engine ~130 kB smaller.
const decoderP: Promise<Decoder | null> = createZXingDecoder().catch(() => null);
// tell the host when WASM is compiled (QRScanner.preload() waits for this)
decoderP.then((d) => post({ type: 'ready', wasm: !!d }));
let srP: Promise<SuperRes | null> = Promise.resolve(jsSuperRes);
let srName = 'js';

async function loadOnnx(url: string): Promise<SuperRes> {
  (self as unknown as { importScripts(u: string): void }).importScripts(url);
  const ort = (self as unknown as { ort: OrtLike & { env: { wasm: { wasmPaths: string; numThreads: number } } } }).ort;
  ort.env.wasm.wasmPaths = url.slice(0, url.lastIndexOf('/') + 1);
  ort.env.wasm.numThreads = 1;
  const hasGPU = 'gpu' in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  srName = hasGPU ? 'onnx-webgpu' : 'onnx-wasm';
  return createOnnxSuperRes(ort, hasGPU ? ['webgpu', 'wasm'] : ['wasm']);
}

self.onmessage = async (e: MessageEvent<Req | Config>) => {
  const m = e.data;
  if ('type' in m && m.type === 'config') {
    if (m.sr === 'off') { srP = Promise.resolve(null); srName = 'off'; }
    else if (m.sr === 'webgpu') srP = loadOnnx(m.ortUrl).catch(() => { srName = 'js'; return jsSuperRes; });
    else { srP = Promise.resolve(jsSuperRes); srName = 'js'; }
    srP.then(() => post({ type: 'config-done', sr: srName }));
    return;
  }
  const r = m as Req;
  try {
    let data: Uint8ClampedArray, width: number, height: number;
    if ('bitmap' in r) {
      const b = r.bitmap;
      if (!canvas || canvas.width !== b.width || canvas.height !== b.height) {
        canvas = new OffscreenCanvas(b.width, b.height);
        ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      }
      ctx!.drawImage(b, 0, 0);
      b.close();
      const img = ctx!.getImageData(0, 0, canvas.width, canvas.height);
      ({ data, width, height } = img);
    } else {
      data = new Uint8ClampedArray(r.pixels);
      width = r.width;
      height = r.height;
    }
    const [dec, sr] = await Promise.all([decoderP, srP]);
    if (!dec) { post({ id: r.id, error: 'no-wasm' }); return; }
    const result = await analyze({ data, width, height }, r.opts, dec, sr);
    post({ id: r.id, result, sr: srName });
  } catch (err) {
    post({ id: r.id, error: String(err) });
  }
};
