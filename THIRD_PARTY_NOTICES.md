# Third-party notices

| Component | Used for | License |
|---|---|---|
| [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) via [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) | main decoder (WASM, inlined in the worker) | Apache-2.0 (ZXing-C++), MIT (zxing-wasm) |
| [jsQR](https://github.com/cozmo/jsQR) | fallback decoder when WASM/workers are blocked | Apache-2.0 |
| WeChat QR super-resolution model `sr.caffemodel` from [WeChatCV/opencv_3rdparty](https://github.com/WeChatCV/opencv_3rdparty/tree/wechat_qrcode), used by OpenCV contrib [`wechat_qrcode`](https://docs.opencv.org/5.0/extra_modules/wechat_qrcode.html) | weights converted by `scripts/convert-sr.py` into `models/wechat_sr.onnx` and `src/sr-weights.generated.ts` | **Apache-2.0**, © 2021 THL A29 Limited (Tencent). Verified against the upstream LICENSE on 2026-11-19, copy in `licenses/WECHAT_QRCODE-Apache-2.0.txt`. Converted to ONNX/JS without changing weights (see NOTICE) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | optional, loaded at runtime from a CDN only when `superResolution: 'webgpu'` | MIT |

Full license texts are in [`licenses/`](licenses/), and attribution and modification notes are in [`NOTICE`](NOTICE). Both ship in the npm package.
