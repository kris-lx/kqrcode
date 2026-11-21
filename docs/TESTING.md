# Testing

k-qr-scanner is tested in four layers. CI runs the first on every push and pull request; run the others before a release.

| layer | what it proves | runs |
| :--- | :--- | :--- |
| [1. Unit tests](#1-unit-tests) | the engine, auto-zoom, the CLI, SSR and the React Native bridge work | in CI, ~30 s |
| [2. Browser end-to-end](#2-browser-end-to-end) | the real UI scans from a camera in Chrome | locally |
| [3. Framework apps](#3-framework-apps) | production builds of real apps scan end to end | before a release |
| [4. Cross-browser and devices](#4-cross-browser-and-devices) | Firefox, WebKit and real phones | before a release |

## 1. Unit tests

```bash
npm ci
npm run build   # some tests use the built package
npm test
```

The 70 tests cover:

- **decoding**: rotation, blur, perspective, far and inverted codes, the native-resolution region path, and Micro QR and rMQR;
- **`formats` and module-size estimates** for every QR-family symbol;
- **auto-zoom** decisions;
- **super-resolution**: the JS kernel and the ONNX model, compared with reference output from OpenCV;
- **SSR**: importing and rendering the React and Vue wrappers on the server;
- **React Native**: the page builder and its escaping, the message bridge, `accept` round trips, the Android permission order, background handling, recovery after a WebView crash, and the Expo config plugin;
- **the CLI**: framework detection, generated components, React Native permission edits (once only, and nothing with `--dry-run`), and `doctor`.

## 2. Browser end-to-end

```bash
npx tsx scripts/e2e.mts             # headless QRScanner reads a far code from the fake camera
npx tsx scripts/e2e.mts --ios       # the same with Safari's limits: no zoom API, no OffscreenCanvas, no BarcodeDetector
npx tsx scripts/e2e.mts --micro     # a Micro QR code instead of a regular one
npx tsx scripts/e2e.mts --el        # the <kqr-scanner> element
npx tsx scripts/e2e.mts --scanqr    # scanQR() resolves and removes itself
npx tsx scripts/e2e.mts --global    # the <script> build (KQRCode global, engine loaded next to it)
npx tsx scripts/e2e.mts --csp       # a strict CSP that blocks workers: the jsQR fallback
npx tsx scripts/e2e.mts --accept    # accept turns the first code down with a message, then accepts it
npx tsx scripts/e2e.mts --rn        # the React Native page at https://kqrcode.local with a stand-in bridge
```

Flags can be combined. Chrome gets a fake camera that plays a QR code video. The React Native run checks the full message flow (`ready` → `accept` → `reject` → `accept` → `scan`), that the page is a secure context, and that the camera is released in the background and reopened afterwards.

Chrome is used from its installed channel; set `CHROME_PATH` to use another binary.

## 3. Framework apps

Five small apps install the packed tarball, build for production and are then scanned in Chrome with a fake camera: React with Vite, Next.js, Nuxt, SvelteKit and Angular.

```bash
npm pack --pack-destination ../kqr-apps
node scripts/make-apps.mjs ../kqr-apps
# in each app: npm install && npm run build
npx tsx scripts/themes.mts             # creates the fake-camera videos
npx tsx scripts/apps-e2e.mts ../kqr-apps
```

Each app must render its server HTML (for the SSR frameworks), scan the code, show the slotted content and log no console errors.

## 4. Cross-browser and devices

```bash
node node_modules/playwright-core/cli.js install firefox webkit
npx tsx scripts/xbrowser.mts           # or: npx tsx scripts/xbrowser.mts firefox
```

The camera is simulated with `canvas.captureStream()` showing moving, rotating codes. For each browser the script measures the first and warm scan times, then checks photo decoding, `scanQR`, a 20-second continuous run (frame rate, wrong reads, memory) and 20 start/stop cycles, which must leave **no workers and no camera tracks** behind. Playwright's WebKit for Windows has no camera API, so on Windows only photo decoding and the "unsupported" screen are checked there.

Emulation can't cover camera hardware, so check real devices before a release:

| device | check |
| :--- | :--- |
| iPhone, Safari | opens; digital zoom reads a far code; flashlight (where available); album; rotating the phone |
| Android, Chrome | hardware auto-zoom on a far code; flashlight; tap to focus |
| Android, Samsung Internet | the same |
| desktop Chrome, Firefox and Safari with a webcam | opens; reads a code shown on a phone |
| React Native app on iOS and Android | the permission prompt; scanning; background and return; album |

Serve `demo/index.html` over HTTPS (for example `npx serve` behind a tunnel) and report results as issues, with the device, OS and browser version.

## Benchmarks

```bash
npm run bench                # accuracy and CPU latency → bench/results.md, then updates the README table
npx tsx bench/browser.mts    # super-resolution speed in Chrome (JS, WebAssembly, WebGPU)
```

The WeChat column needs Python with `opencv-contrib-python-headless<5` and the original model files (see `scripts/convert-sr.py`). Point `KQR_PY` at that Python; without it, the column is skipped. The method is described in [BENCHMARK.md](BENCHMARK.md).
