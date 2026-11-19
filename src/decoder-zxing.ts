import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { Decoder } from './engine';

/** Injected by scripts/build.mjs for the worker bundle (base64 of zxing_reader.wasm). */
declare const __ZXING_WASM_B64__: string | undefined;

/** ZXing-C++ compiled to WASM: handles blur, low contrast, perspective, damage. ~8 ms @1080p. */
export async function createZXingDecoder(): Promise<Decoder> {
  if (typeof __ZXING_WASM_B64__ !== 'undefined') {
    const bin = atob(__ZXING_WASM_B64__);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await prepareZXingModule({ overrides: { wasmBinary: bytes.buffer as ArrayBuffer }, fireImmediately: true });
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
