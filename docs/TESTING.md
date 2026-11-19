# Testing

kqrcode has four test layers. CI runs layer 1 on every push and pull request; run the others before a release.

## 1. Unit tests

```bash
npm ci
npm run build      # some tests exercise the built package (SSR imports, CLI)
npm test
```

They cover:

- the decoding engine: rotation, blur, perspective, far and inverted codes, and the native-resolution ROI path;
- auto-zoom decisions;
- the super-resolution kernel and the ONNX model, compared with reference outputs from OpenCV;
- SSR imports and rendering for React and Vue;
- the CLI: framework detection, generated files, `doctor`.

## 2. Framework apps (production builds)

Five minimal apps install the packed tarball, are built for production and are then scanned in Chrome with a fake camera: React + Vite, Next.js, Nuxt, SvelteKit and Angular.

```bash
npm pack --pack-destination ../kqr-apps
node scripts/make-apps.mjs ../kqr-apps
# in each app: npm install && npm run build
npx tsx scripts/themes.mts            # creates the fake-camera videos
npx tsx scripts/apps-e2e.mts ../kqr-apps
```

Each app must render its server HTML (SSR apps), scan the code, render the slotted content and log no console errors.

## 3. Cross-browser and stress

```bash
node node_modules/playwright-core/cli.js install firefox webkit
npx tsx scripts/xbrowser.mts            # or: npx tsx scripts/xbrowser.mts firefox
```

The camera is simulated with `canvas.captureStream()` showing moving, rotating codes. Per browser the script checks:

- first and warm scan times;
- photo decoding;
- `scanQR`;
- a 20-second continuous run (analysis fps, wrong reads, heap);
- 20 start/stop cycles, which must leave **0 workers and 0 camera tracks** behind.

Playwright's WebKit build for Windows has no camera API, so on Windows only photo decoding and the "unsupported" UI are checked there.

Chrome is used from its installed channel; set `CHROME_PATH` to use another binary.

## 4. Real devices

Emulation does not cover camera hardware. Before a release, check on real devices:

| device | check |
|---|---|
| iPhone, Safari (iOS 16, 17, 18) | opens; digital zoom on a far code; flashlight (if exposed); album; rotate the phone |
| Android, Chrome | hardware auto-zoom on a far code; torch; tap-to-focus |
| Android, Samsung Internet | same |
| Desktop Chrome / Firefox / Safari with a webcam | opens; scans a code on a phone screen |

Use `demo/index.html` served over HTTPS (for example `npx serve` behind a tunnel), and file results as issues with device, OS and browser version.

## Benchmarks

```bash
npm run bench               # accuracy + CPU latency → bench/results.md, then refreshes the README table
npx tsx bench/browser.mts    # super-resolution in Chrome (JS / WASM / WebGPU)
```

The WeChat (OpenCV) column needs Python with `opencv-contrib-python-headless<5` and the original model files, which `scripts/convert-sr.py` documents. Point `KQR_PY` at that interpreter. Without it, the column is skipped.
