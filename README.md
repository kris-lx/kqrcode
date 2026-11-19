# kqrcode

npm package: `kpay-qr-scanner`

Full-screen QR scanner in the style of Alipay / WeChat. Framework-agnostic web component with React and Vue wrappers.

- **Decoder: ZXing-C++ (WASM)**: a 720p frame takes ~8 ms (jsQR ~34 ms) and it decodes far more blurred/low-contrast codes. jsQR is the automatic fallback when WASM or workers are blocked.
- **WeChat super-resolution CNN** (from OpenCV `wechat_qrcode`, 5.3k params), checked against OpenCV DNN output to within 1e-4. It runs on small ROIs that still fail, with three backends: built-in JS, **ONNX Runtime Web with WebGPU** (~10 ms for a 128 px ROI on an Intel iGPU), or ONNX WASM. `models/wechat_sr.onnx` is included.
- **Two detectors:** a finder-pattern locator (1:1:3:1:1) and a blur-tolerant texture detector. They find codes too small to decode and drive the auto-zoom.
- **Any angle**: rotated, skewed, inverted codes.
- **Any distance**:
  - Android/Chrome: **hardware auto-zoom** until the modules are readable, without pushing the code off-screen. When nothing is in view it sweeps the zoom levels.
  - **iOS Safari (no zoom API): digital zoom on real sensor pixels.** It asks for a 4K stream, re-grabs the located code at native resolution and animates a matching zoom on the video.
- **Fast**: all work runs in a Web Worker (inline blob plus inline WASM, no asset config). It uses the native `BarcodeDetector` where available and tracks the ROI between frames.
- **Benchmarked against the real WeChat engine**: overall decode rate 64 % vs 62 % on the same frames, with 10–20× less work on frames without a code. WeChat is still better on the farthest codes. See [BENCHMARK.md](BENCHMARK.md).
- Pinch-to-zoom, tap-to-focus, flashlight, album import, "too dark" hint, beep + vibrate, EN / ລາວ / 中文
- **Works with every framework**: React, Next.js (`'use client'` included), Vue, Nuxt, Svelte/SvelteKit (action), Angular (custom element), Solid, Astro, plain `<script>`. SSR-safe imports. Guide: [docs/FRAMEWORKS.md](docs/FRAMEWORKS.md)

## Use

```ts
import { scanQR } from 'kpay-qr-scanner';
const { text } = await scanQR({ theme: 'wechat', locale: 'lo' });   // that's it
```

```html
<kpay-qr-scanner theme="alipay" locale="lo"></kpay-qr-scanner>       <!-- or as an element -->
```

- **Looks:** themes `wechat` · `alipay` · `grid` · `frame` · `none`. Restyle with CSS variables (`--kqr-accent`…) and `::part()`. Add your own buttons and tabs through slots (`actions-left`, `footer`, …). Full guide: [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)
- **Frameworks** (React/Next, Vue/Nuxt, Svelte/SvelteKit, Angular, plain HTML): [docs/FRAMEWORKS.md](docs/FRAMEWORKS.md)
- **Size:** ~14 KB gzip on import. The ~640 KB engine downloads on first `start()`, or earlier with `QRScanner.preload()`.
- **Headless:** `new QRScanner({ video })` with `.on('result' | 'hint' | 'zoom' | 'dark' | 'error')`.

## Limits (honest)

- Needs **HTTPS** or localhost.
- **Not the Alipay or TikTok engines**, which are closed. From WeChat's open engine ([OpenCV `wechat_qrcode`](https://docs.opencv.org/5.0/extra_modules/wechat_qrcode.html)) this library uses the **super-resolution CNN**, but not the CNN *detector*. The benchmark shows that detector is why WeChat still wins on the farthest codes (1.5 px modules: 29 % vs 17 %), at ~290 ms per 720p frame on CPU. Porting it to WebGPU is the next step.
- Benchmarks use synthetic frames on one laptop. Measure on your target phones (see [BENCHMARK.md](BENCHMARK.md) → limits).
- iOS Safari: the `zoom` constraint is not relied on; digital zoom is limited by what the camera delivers (4K → up to 4×, 1080p → 2×). Tap-to-focus and torch are only available where Safari exposes them.
- **Not verified on a real iPhone/Android.** Verified: unit tests (rotation, blur, far, inverted, native-crop path), and Chrome e2e with a fake camera in both normal mode and an emulated-Safari mode (`npx tsx scripts/e2e.mts [--ios] [--el]`). Tune `TARGET_MODULE` / dwell times in `src/autozoom.ts` on devices.
- Bundle is ~1.6 MB raw (the WASM is inlined in the worker string); lazy-load the scanner route.

## Dev

`npm test` · `npm run build` (generates the inline worker, bundles ESM/CJS/IIFE, emits types).
