import jsQR from 'jsqr';
import type { Decoder } from './engine';

/** Pure-JS fallback decoder (used when WASM / workers are unavailable). */
export const jsqrDecoder: Decoder = {
  slow: true,
  async decode(img, invert) {
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
    if (!r) return null;
    const l = r.location;
    return {
      text: r.data,
      bytes: Uint8Array.from(r.binaryData),
      corners: [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner],
    };
  },
};
