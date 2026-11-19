import type { AnalyzeInput, SuperRes } from './engine';
import { superResolveRGBA } from './sr';
import { SR_ONNX_B64 } from './sr-model.generated';

/** Built-in, dependency-free float32 kernel (runs in the worker). */
export const jsSuperRes: SuperRes = Object.assign(async (img: AnalyzeInput) => superResolveRGBA(img), { maxSide: 112 });

export function srModelBytes(): Uint8Array {
  const bin = atob(SR_ONNX_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** Minimal surface of onnxruntime (web or node) that we use. */
export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array, opts?: object): Promise<OrtSession> };
}
export interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;
}

/** ONNX Runtime session (WebGPU / WASM in browsers, CPU in Node) → SuperRes. */
export async function createOnnxSuperRes(ort: OrtLike, executionProviders: string[]): Promise<SuperRes> {
  const session = await ort.InferenceSession.create(srModelBytes(), { executionProviders, graphOptimizationLevel: 'all' });
  const fn = async (img: AnalyzeInput) => {
    const { width: w, height: h, data } = img;
    const x = new Float32Array(w * h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) x[i] = ((data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8) / 255;
    const out = (await session.run({ data: new ort.Tensor('float32', x, [1, 1, h, w]) })).output;
    const oh = out.dims[2], ow = out.dims[3];
    const rgba = new Uint8ClampedArray(ow * oh * 4);
    const y = out.data;
    for (let i = 0, j = 0; i < ow * oh; i++, j += 4) {
      const v = y[i] * 255;
      rgba[j] = rgba[j + 1] = rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
    return { data: rgba, width: ow, height: oh };
  };
  return Object.assign(fn, { maxSide: 240 });
}
