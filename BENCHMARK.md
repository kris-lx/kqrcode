# Benchmark: kpay-qr-scanner vs jsQR, ZXing and the real WeChat engine

Machine: Intel Core Ultra 5 125U laptop (Intel Xe-LPG GPU), Windows 11, Node 26, Chrome 157. Run on 2026-11-19.
Reproduce: `npx tsx bench/run.mts` (accuracy + CPU latency) and `npx tsx bench/browser.mts` (Chrome / WebGPU).
Raw numbers: `BENCHMARK.generated.md`, `bench/out/results.json`, `bench/out/browser.json`.

## What is compared

| engine | what it is |
|---|---|
| jsQR | pure JS decoder, full frame |
| ZXing-C++ (WASM) | `zxing-wasm` reader, full frame, `tryHarder` |
| kpay | this library's engine, no super-resolution: ZXing full frame → finder-pattern locator + texture detector → upscaled ROI |
| kpay + WeChat SR | same, plus WeChat's super-resolution CNN on small ROIs that still fail (JS kernel or ONNX Runtime) |
| **WeChat (OpenCV C++)** | the real WeChat engine as published in OpenCV contrib `wechat_qrcode` 4.14 (CNN detector + CNN SR + decoder), **native C++**, run from Python |

Dataset: 144 synthetic 1280×720 "camera" frames plus 8 frames with no code. They include perspective (±12 %), any rotation, Gaussian defocus (σ 0, 0.8, 1.5), sensor noise (σ 5), an illumination gradient, high or low contrast, and two payloads: a short URL and a long EMVCo/LaoQR string. Every engine gets identical pixels. A hit means the decoded text matches exactly.

## Results

### Decode rate by module size (pixels per QR module, smaller = farther away)

| engine | 1.5 px | 2 px | 2.5 px | 3 px | 4 px | 6 px | **all** |
|---|---|---|---|---|---|---|---|
| jsQR | 0% | 25% | 25% | 46% | 67% | 88% | **42%** |
| ZXing-C++ (WASM) | 4% | 38% | 63% | 67% | 96% | 100% | **61%** |
| kpay | 8% | 42% | 63% | 67% | 96% | 100% | **63%** |
| kpay + WeChat SR (JS kernel) | 13% | 42% | 63% | 67% | 96% | 100% | **63%** |
| kpay + WeChat SR (ONNX Runtime) | 17% | 42% | 63% | 67% | 96% | 100% | **64%** |
| WeChat (OpenCV C++) | **29%** | 42% | 50% | 63% | 88% | 100% | **62%** |

### Decode rate by condition

| engine | sharp | blur σ0.8 | blur σ1.5 | high contrast | low contrast |
|---|---|---|---|---|---|
| jsQR | 67% | 46% | 13% | 39% | 44% |
| ZXing-C++ (WASM) | 85% | 67% | 31% | 63% | 60% |
| kpay | 88% | 69% | 31% | 64% | 61% |
| kpay + WeChat SR (ONNX Runtime) | 88% | 73% | 31% | 67% | 61% |
| WeChat (OpenCV C++) | 85% | 73% | 27% | **71%** | 53% |

### Latency per 1280×720 frame, CPU, single thread (ms)

| engine | p50 | p95 | frame without a code (p50) | false positives |
|---|---|---|---|---|
| jsQR | 33.7 | 48.3 | 98.4 | 0 |
| ZXing-C++ (WASM) | 7.6 | 12.4 | 4.9 | 0 |
| kpay | 9.7 – 17.2 ¹ | 28 – 38 ¹ | 17 – 37 ¹ | 0 |
| kpay + WeChat SR (JS kernel) | 14.3 | 167.9 | 25.8 | 0 |
| kpay + WeChat SR (ONNX Runtime) | 15.4 | 58.7 | 23.2 | 0 |
| WeChat (OpenCV C++, 1 thread) | 13.9 | 96.4 | **292.5** | 0 |
| WeChat (OpenCV C++, 14 threads) | 11.7 | 91.3 | 303.0 | 0 |

¹ Two runs of the same code on this laptop CPU. U-series thermal throttling makes absolute numbers move by about ±50 % between runs, so compare engines within one run (see `BENCHMARK.generated.md`).

### WeChat super-resolution model, real Chrome (ms per ROI)

| ROI | built-in JS kernel | ONNX Runtime Web – WASM | **ONNX Runtime Web – WebGPU** (Intel Xe-LPG) |
|---|---|---|---|
| 64×64 | 52.6 | 4.7 | 6.7 |
| 96×96 | 109.3 | 9.6 | 7.8 |
| 128×128 | 200.4 | 16.8 | **9.9** |
| 160×160 | 346.9 | 38.5 | 16.3 |
| 240×240 | 733.2 | 61.9 | **28.3** |

End-to-end check: in Chrome with a fake camera, the scanner with `superResolution: 'webgpu'` loaded ONNX Runtime inside its worker, picked the `onnx-webgpu` backend and decoded the code.

## What the numbers say

1. **Overall accuracy is on par with WeChat's open-source engine:** 64 % vs 62 %. kpay is better on mid-size codes (2.5–4 px) and low contrast. WeChat is clearly better on the farthest codes (1.5 px: 29 % vs 17 %) and on high contrast.
2. **WeChat's advantage at 1.5 px comes from its CNN detector, not from super-resolution.** `bench/diag.mts` crops codes at their known position and decodes them. With that crop, SR×2 decodes about as well as bilinear×2; the real loss is in *finding* tiny blurred codes. The locator found 0/8 codes at 1.5–2 px with blur σ0.8. SR still adds a little when applied as SR×2 followed by bilinear×2, which is how kpay uses it.
3. **The CNN detector is expensive on frames with no code:** WeChat spends ~290 ms per empty 720p frame on CPU. kpay spends 17–37 ms (ZXing alone: 5 ms). That matters for a live camera, which mostly sees frames with no code.
4. **For super-resolution in the browser, use WebGPU or WASM, not the JS kernel.** ONNX Runtime Web is 12–25× faster than the JS kernel. That is why the JS kernel only gets ROIs up to 112 px and ONNX up to 240 px.

## Limits of this benchmark

- **Synthetic data:** real camera frames have motion blur, JPEG/ISP artefacts, glare and curved surfaces. This set does not model them. The next step is a set of real phone photos.
- **Small sample:** 24 codes per module-size bucket, so one image is about 4 %. Differences under ~8 points are within noise.
- **Not like-for-like:** WeChat runs as native C++ here, while kpay runs as WASM/JS. Inside the WeChat app it likely runs on optimised mobile kernels; that pipeline is not public.
- **Not measured:** Alipay and TikTok (closed engines), iOS Safari and Android devices. Phone numbers will differ, so run `bench/browser.mts`-style pages on the target devices.
