# Security policy

## Supported versions

Security fixes go into the latest minor release.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead: [Report a vulnerability](https://github.com/kris-lx/kqrcode/security/advisories/new). You should get an answer within 7 days.

## Notes for integrators

- k-qr-scanner decodes on the device. Camera frames and photos never leave the browser.
- **Treat scanned text as untrusted input.** Validate URLs and payment payloads before acting on them, and never insert the result into the page as HTML.
- The decoder runs in a `blob:` worker using WebAssembly. A strict Content-Security-Policy needs `worker-src blob:` and `script-src 'wasm-unsafe-eval'`.
- `superResolution: 'webgpu'` loads ONNX Runtime Web from `onnxRuntimeUrl` (jsDelivr by default). Self-host it, and allow it in your CSP, if you do not want third-party script loads.
