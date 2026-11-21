# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, minor versions may contain breaking changes.

## [Unreleased]

## [0.2.0] – 2026-11-21

### Changed

- **New package name: `k-qr-scanner`** (was `kqr-scanner`). Imports become `k-qr-scanner`, `k-qr-scanner/react` and so on, and the CLI is `npx k-qr-scanner`. The `<kqr-scanner>` element, the `KQRCode` global and the `kqrcode.*.js` file names are unchanged.
- Documentation rewritten.
- **Smaller engine**: 631 → 458 kB gzip (−27 %), 1.5 MB → 648 kB raw. The WebAssembly is gzip-compressed inside the engine and inflated with `DecompressionStream`; jsQR is no longer bundled in the worker; the super-resolution weights are read from the ONNX model instead of being shipped twice.
- **Smaller `<script>` build**: `kqrcode.global.js` 63 → 17 kB gzip. The engine loads from `kqrcode.engine.js` next to it on first use.
- **Smaller package**: 2.4 → 1.8 MB tarball. CJS entries share a single engine file.
- **Faster**: the finder-pattern locator is 2.5× faster (block thresholds). Frames without a code take 24 ms instead of 34 ms at 1080p, and live analysis runs at ~19 fps instead of ~13 fps in Chrome.
- **Faster restarts**: one decoding worker is shared and kept warm (`QRScanner.engineIdleTimeout`, default 30 s). `QRScanner.preload()` now also compiles the WebAssembly.

### Added

- **React Native** (`k-qr-scanner/react-native`): a `<QRScanner>` component for iOS, Android and Expo. It runs the same scanner in `react-native-webview` with the engine bundled (works offline), and carries over every prop, `accept`, `formats` and events. Extras: `cssVars`, HTML `slots` with `onSlotPress`, `keepCamera`, `scriptUrl`, and ref methods. The component asks for the Android camera permission itself, releases the camera while the app is in the background, and reloads if the OS kills the WebView process.
- **Expo config plugin**: `"plugins": ["k-qr-scanner"]` adds the iOS and Android camera permission entries (`cameraPermission` sets the iOS text).
- `npx k-qr-scanner init` for React Native / Expo installs `react-native-webview`, writes the camera permission entries (the Expo plugin in app.json, or Info.plist + AndroidManifest.xml) and a starter component; `doctor` checks them.
- `<kqr-scanner>`: read-only `active` property; `resume()` reopens the camera when it was already stopped.
- **Every QR format**: Micro QR (M1–M4) and rMQR are read alongside QR Code (Model 1 and 2). `ScanResult.format` is now `'qr_code' | 'micro_qr_code' | 'rm_qr_code'`, and results carry `version` and `ecLevel`. Auto-zoom and tracking use the real module count of each symbol.
- `formats` option (`scanQR`, `QRScanner`, wrappers) and `formats` attribute to limit which QR-family members are read. `QR_FORMATS` lists them.
- **`accept` callback**: check a code before it counts. Return `true` to accept, `false` to ignore it and keep scanning, or a string to ignore it and show that message. May be async. A turned-down code is not re-checked while it stays in view. Also applies to album photos. New `reject` event / `onReject` everywhere; `QRScanner.setFormats()` and `setAccept()`.
- `QRScanner.dispose()` and `QRScanner.engineIdleTimeout`.

### Fixed

- iOS: the camera came back black after the app or tab was in the background; the scanner now reopens it.

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
- `npx kqr-scanner init` and `npx kqr-scanner doctor` CLI.
- English, Lao and Chinese labels.

[Unreleased]: https://github.com/kris-lx/kqrcode/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kris-lx/kqrcode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kris-lx/kqrcode/releases/tag/v0.1.0
