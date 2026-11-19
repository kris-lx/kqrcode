# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, minor versions may contain breaking changes.

## [Unreleased]

### Changed

- **Smaller engine**: 631 → 458 kB gzip (−27 %), 1.5 MB → 648 kB raw. The WebAssembly is gzip-compressed inside the engine and inflated with `DecompressionStream`; jsQR is no longer bundled in the worker; the super-resolution weights are read from the ONNX model instead of being shipped twice.
- **Smaller `<script>` build**: `kqrcode.global.js` 63 → 17 kB gzip. The engine loads from `kqrcode.engine.js` next to it on first use.
- **Smaller package**: 2.4 → 1.8 MB tarball. CJS entries share a single engine file.
- **Faster**: the finder-pattern locator is 2.5× faster (block thresholds). Frames without a code take 24 ms instead of 34 ms at 1080p, and live analysis runs at ~19 fps instead of ~13 fps in Chrome.
- **Faster restarts**: one decoding worker is shared and kept warm (`QRScanner.engineIdleTimeout`, default 30 s). `QRScanner.preload()` now also compiles the WebAssembly.

### Added

- `QRScanner.dispose()` and `QRScanner.engineIdleTimeout`.

### Removed

- The undocumented `decodeFrame` export.

## [0.1.0] – 2026-11-19

First public release.

### Added

- `<kqr-scanner>`: a full-screen scanner custom element that scans anywhere in the camera view, at any angle.
- Decoder: ZXing-C++ (WebAssembly) in a Web Worker, with jsQR as a fallback when workers or WASM are blocked.
- Detection of codes that are too small to decode (a finder-pattern locator and a texture detector), driving auto-zoom.
- Auto-zoom with hardware zoom where available; on iOS Safari, digital zoom on a 4K stream.
- Optional super-resolution with WeChat's CNN: built-in kernel, or ONNX Runtime Web (WebGPU / WASM).
- Themes `wechat`, `alipay`, `grid`, `frame` and `none`, plus CSS variables, `::part()` and slots.
- `scanQR()` one-call API and the headless `QRScanner` class.
- React, Vue and Svelte wrappers; Angular and plain HTML through the custom element; SSR-safe imports.
- `npx kqrcode init` and `npx kqrcode doctor` CLI.
- English, Lao and Chinese labels.

[Unreleased]: https://github.com/kris-lx/kqrcode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kris-lx/kqrcode/releases/tag/v0.1.0
