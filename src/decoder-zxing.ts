import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { Decoder } from './engine';

/** Injected by scripts/build.mjs for the worker bundle: base64 of the *gzip-compressed* zxing_reader.wasm. */
declare const __ZXING_WASM_GZ_B64__: string | undefined;

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** gunzip: native DecompressionStream where available, tiny fflate fallback (Safari < 16.4). */
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { gunzipSync } = await import('fflate');
  return gunzipSync(data);
}

/** ZXing-C++ compiled to WASM: handles blur, low contrast, perspective, damage. ~8 ms @1080p. */
export async function createZXingDecoder(): Promise<Decoder> {
  if (typeof __ZXING_WASM_GZ_B64__ !== 'undefined') {
    const wasm = await gunzip(fromBase64(__ZXING_WASM_GZ_B64__));
    await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer as ArrayBuffer }, fireImmediately: true });
  } else {
    await prepareZXingModule({ fireImmediately: true }); // Node / tests
  }
  return {
    slow: false,
    async decode(img, invert) {
      const res = await readBarcodes(
        { data: img.data, width: img.width, height: img.height, colorSpace: 'srgb' } as unknown as ImageData,
        { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: invert, tryDownscale: true, maxNumberOfSymbols: 1 },
      );
      const r = res[0];
      if (!r || !r.isValid) return null;
      const p = r.position;
      return { text: r.text, bytes: Uint8Array.from(r.bytes), corners: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft] };
    },
  };
}
