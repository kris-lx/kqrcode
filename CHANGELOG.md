# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, minor versions may contain breaking changes.

## [Unreleased]

## [0.3.0] – 2026-11-21

### Added

- **Payment QR codes (EMV)**: `parseEMV()` reads LAO QR, PromptPay, VietQR, DuitNow, QRIS, UnionPay and other EMVCo merchant codes into fields (merchant, amount, currency, accounts, bill number…) and checks the CRC. `acceptEMV({ currency, country, accounts, dynamicOnly, message, check })` is a ready-made `accept` callback that lets only intact payment codes through. `emvCRC()` computes the checksum. Exported from the main entry and from `k-qr-scanner/react-native`; tree-shakeable.
- **`layout="bar"`** (`layout` prop and option everywhere): flashlight on the left, a large album button in the middle and your own button on the right, in one row, as in many banking apps.
- Slots `banner` (under the top bar, e.g. a "supported QR" strip) and `actions-center`; part `banner`.
- **Capacitor**: `npx k-qr-scanner init` and `doctor` add and check the camera permissions in the native iOS and Android projects. New guide `docs/MOBILE.md` for PWAs, Capacitor, native `WKWebView` and Android `WebView`, and Flutter.
- CSS variables `--kqr-frame-border` and `--kqr-gallery-bg`, `--kqr-gallery-size`, `--kqr-gallery-radius`. `--kqr-corner-width: 0` hides the frame corners.

### Changed

- **Package 2.4 MB → 750 kB** (unpacked 4.4 → 1.4 MB, 89 → 50 files). The ESM, CJS, `<script>` and React Native builds now share one engine file and one jsQR file (`kqrcode.engine.js` and `kqrcode.jsqr.js`, both ES modules loaded with `import()`) instead of four and three copies; source maps and internal type files are no longer published. Apps still get the engine as a separate, lazily loaded chunk.
- Self-hosted script builds: `kqrcode.engine.js` is now an ES module, so serve it as `text/javascript`, with CORS headers when it comes from another origin.

### Improved

- **Codes filmed off a screen**: the engine recognizes the moiré of a display's pixel grid and decodes a smoothed copy of the frame. With strong moiré, a dense payment code at 3–4 px per module went from 2/8 to 8/8 frames.
- **Farthest and rotated codes**: the crop around a located code is now sized for any rotation plus the quiet zone; it used to cut the corners off rotated codes. Codes at 1.5 px per module: 17 % → 38 % (WeChat's open-source engine: 29 %); all frames: 65 % → 69 %.

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

[Unreleased]: https://github.com/kris-lx/kqrcode/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kris-lx/kqrcode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kris-lx/kqrcode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kris-lx/kqrcode/releases/tag/v0.1.0
