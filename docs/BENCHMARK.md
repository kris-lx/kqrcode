# Benchmark

How k-qr-scanner compares with jsQR, ZXing and the real WeChat engine, how the numbers were measured, and what they don't cover.

> The latest numbers are generated into [`bench/results.md`](../bench/results.md) by `npm run bench`. Decode rates below are from the 2026-11-21 run (version 0.3.0). The WeChat rows and all times are from the 2026-11-19 run on the laptop below, the only machine with the WeChat engine installed; decode rates don't depend on the machine.

## Setup

| | |
| :--- | :--- |
| machine | Intel Core Ultra 5 125U laptop (Intel Xe-LPG GPU), Windows 11 |
| software | Node 26, Chrome 157 |
| reproduce | `npx tsx bench/run.mts` (accuracy and CPU latency), `npx tsx bench/browser.mts` (Chrome and WebGPU) |
| raw output | `bench/results.md`, and `bench/out/*.json` after a local run |

### Engines

| engine | what it is |
| :--- | :--- |
| jsQR | a pure JavaScript decoder, on the full frame |
| ZXing-C++ (WASM) | the `zxing-wasm` reader on the full frame, with `tryHarder` |
| k-qr-scanner | this library without super-resolution: ZXing on the full frame, then the finder-pattern locator and texture detector, then decoding of an upscaled region |
| k-qr-scanner + WeChat SR | the same, plus WeChat's super-resolution network on small regions that still fail (JS kernel or ONNX Runtime) |
| **WeChat (OpenCV C++)** | the real WeChat engine as published in OpenCV contrib `wechat_qrcode` 4.14: CNN detector, CNN super-resolution and decoder, as **native C++** called from Python |

### Dataset

144 synthetic 1280×720 camera frames, plus 8 frames with no code. They combine:

- perspective (±12 %) and any rotation;
- Gaussian defocus (σ 0, 0.8 or 1.5);
- sensor noise (σ 5) and an illumination gradient;
- high or low contrast;
- two payloads: a short URL and a long EMVCo / LaoQR payment string.

Every engine gets identical pixels. A frame counts as a hit only when the decoded text matches exactly.

## Results

### Decode rate by module size

The module size is how many pixels one QR module covers; smaller means farther away.

| engine | 1.5 px | 2 px | 2.5 px | 3 px | 4 px | 6 px | **all** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| jsQR | 0% | 25% | 25% | 46% | 67% | 88% | **42%** |
| ZXing-C++ (WASM) | 4% | 38% | 63% | 67% | 96% | 100% | **61%** |
| k-qr-scanner | 25% | 42% | 63% | 67% | 100% | 100% | **66%** |
| k-qr-scanner + WeChat SR (JS kernel) | 25% | 42% | 63% | 67% | 100% | 100% | **66%** |
| k-qr-scanner + WeChat SR (ONNX Runtime) | **38%** | **46%** | 63% | 67% | 100% | 100% | **69%** |
| WeChat (OpenCV C++) | 29% | 42% | 50% | 63% | 88% | 100% | **62%** |

### Decode rate by condition

| engine | sharp | blur σ 0.8 | blur σ 1.5 | high contrast | low contrast |
| :--- | :---: | :---: | :---: | :---: | :---: |
| jsQR | 67% | 46% | 13% | 39% | 44% |
| ZXing-C++ (WASM) | 85% | 67% | 31% | 63% | 60% |
| k-qr-scanner | 96% | 69% | 33% | 68% | 64% |
| k-qr-scanner + WeChat SR (ONNX Runtime) | **96%** | **77%** | **33%** | **74%** | **64%** |
| WeChat (OpenCV C++) | 85% | 73% | 27% | 71% | 53% |

### Time per 1280×720 frame (CPU, one thread, ms)

From the 2026-11-19 run. The 2026-11-21 run on a desktop Ryzen 5 2600 gave 13.3 ms (p50) and 17.6 ms for a frame without a code, against 9.9 ms and 7.3 ms for ZXing alone on that machine: the same ratios as before.

| engine | p50 | p95 | frame without a code (p50) | false positives |
| :--- | :---: | :---: | :---: | :---: |
| jsQR | 33.7 | 48.3 | 98.4 | 0 |
| ZXing-C++ (WASM) | 7.6 | 12.4 | 4.9 | 0 |
| k-qr-scanner | 9.7 – 17.2 ¹ | 28 – 38 ¹ | 17 – 37 ¹ | 0 |
| k-qr-scanner + WeChat SR (JS kernel) | 14.3 | 167.9 | 25.8 | 0 |
| k-qr-scanner + WeChat SR (ONNX Runtime) | 15.4 | 58.7 | 23.2 | 0 |
| WeChat (OpenCV C++, 1 thread) | 13.9 | 96.4 | **292.5** | 0 |
| WeChat (OpenCV C++, 14 threads) | 11.7 | 91.3 | 303.0 | 0 |

¹ The range of two runs of the same code. This laptop's CPU throttles under heat, so absolute times can move by about ±50 % between runs; compare engines within one run (see `bench/results.md`).

### Super-resolution in Chrome (ms per region)

| region | built-in JS kernel | ONNX Runtime Web, WebAssembly | **ONNX Runtime Web, WebGPU** (Intel Xe-LPG) |
| :--- | :---: | :---: | :---: |
| 64×64 | 52.6 | 4.7 | 6.7 |
| 96×96 | 109.3 | 9.6 | 7.8 |
| 128×128 | 200.4 | 16.8 | **9.9** |
| 160×160 | 346.9 | 38.5 | 16.3 |
| 240×240 | 733.2 | 61.9 | **28.3** |

End to end: in Chrome with a fake camera, a scanner with `superResolution: 'webgpu'` loaded ONNX Runtime in its worker, chose the `onnx-webgpu` backend and read the code.

## What the numbers say

1. **k-qr-scanner now reads more codes than WeChat's open-source engine in every bucket**: 69 % against 62 % overall, and 38 % against 29 % on the farthest codes (1.5 px). Until version 0.2.0, WeChat led on the farthest codes (29 % against 17 %).
2. **The gap closed with a better crop, not a bigger model.** When the locator finds a code that the full-frame pass can't read, the engine decodes an upscaled crop around it. That crop used to be sized for an upright code, so a rotated code lost its corners. Sizing it for any rotation plus the quiet zone took the farthest codes from 17 % to 38 %. `bench/diag.mts` had already shown that WeChat's lead came from *finding* tiny codes rather than from super-resolution.
3. **That detector is expensive on frames with no code.** WeChat spends about 290 ms on each empty 720p frame on the CPU; k-qr-scanner spends 17–37 ms (ZXing alone: 5 ms). A live camera mostly sees frames without a code, so this decides battery use and responsiveness.
4. **In the browser, run super-resolution on WebGPU or WebAssembly, not the JS kernel.** ONNX Runtime Web is 12–25× faster. That is why the JS kernel only gets regions up to 112 px, and ONNX Runtime up to 240 px.

## Codes filmed off a screen

A display filmed up close shows its pixel grid, which beats against the camera sensor as moiré and breaks binarization. This set doesn't include it, so a unit test does (`test/engine.test.ts`): a 201-character EMV payment code (QR version 9) with a simulated pixel grid. With strong moiré, before and after the screen pass in 0.3.0:

| module size | 2.5 px | 3 px | 4 px | 5 px |
| :--- | :---: | :---: | :---: | :---: |
| before | 0/8 | 2/8 | 2/8 | 6/8 |
| after | 5/8 | 8/8 | 8/8 | 8/8 |

The engine scores each frame's fine high-frequency energy; real scenes score about 5–10 and filmed screens 20 or more. Above 18, or when a located code fails, it decodes a lightly smoothed copy of the frame. Frames without a code and without moiré cost nothing extra.

## Limits

- **Synthetic frames.** Real camera frames also have motion blur, compression and image-processing artifacts, glare and curved surfaces, which this set does not model. A set of real phone photos is the next step.
- **A small sample.** Each module-size column has 24 codes, so one frame is about 4 points. Differences under about 8 points are within noise.
- **Not like for like.** WeChat runs as native C++ here, while k-qr-scanner runs as WebAssembly and JavaScript. Inside the WeChat app it probably runs on optimized mobile kernels; that pipeline is not public.
- **Not measured.** Alipay and TikTok (closed engines), and iOS and Android devices. Phones will give different numbers, so measure on your target devices with a page like `bench/browser.mts`.
