<div align="center">
<br />
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg" />
  <img src="docs/assets/logo.svg" alt="k-qr-scanner" width="360" />
</picture>

<p><strong>A WeChat-style QR code scanner for the web and React Native</strong></p>

<p>
<a href="https://www.npmjs.com/package/k-qr-scanner"><img src="https://img.shields.io/npm/v/k-qr-scanner?style=for-the-badge&logo=npm&color=CB3837" alt="npm version"></a>
<a href="https://github.com/kris-lx/kqrcode/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kris-lx/kqrcode/ci.yml?branch=main&label=tests&style=for-the-badge&logo=github" alt="Tests"></a>
<a href="#size"><img src="https://img.shields.io/badge/initial_load-14_kB_gzip-07c160?style=for-the-badge" alt="14 kB gzip"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/kris-lx/kqrcode?style=for-the-badge&color=blue" alt="License"></a>
</p>

<img src="docs/assets/themes.png" alt="The five themes: wechat, alipay, grid, frame and the success marker" width="860" />
</div>

---

k-qr-scanner opens a full-screen camera view that reads a QR code **anywhere in the picture**: at an angle, upside down, inverted, or from across the room. When a code is too small to read, the scanner finds it anyway and **zooms in by itself**, the way the WeChat and Alipay scanners do.

- **Reads far and blurry codes.** ZXing-C++ (WebAssembly) runs in a Web Worker. A finder-pattern locator drives auto-zoom, and WeChat's super-resolution model has a last try at small, blurry codes.
- **Reads the whole QR family.** QR Code (Model 1 and 2), Micro QR and rMQR.
- **You decide what counts.** An `accept` callback checks each code before it becomes the result. It can be async and can show the user a message.
- **Works everywhere.** React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular, React Native (iOS, Android, Expo) and plain HTML.
- **Looks native.** Five themes, CSS variables, `::part()` and slots. Pinch zoom, tap to focus, flashlight, album import, beep and haptics.
- **Small and private.** 14 kB gzip on page load; the engine loads when the scanner opens. Camera frames never leave the device.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Frameworks](#frameworks)
- [Check codes before they count](#check-codes-before-they-count)
- [Look and feel](#look-and-feel)
- [Headless mode](#headless-mode)
- [Going to production](#going-to-production)
- [Benchmarks](#benchmarks)
- [Size](#size)
- [Browser and platform support](#browser-and-platform-support)
- [Documentation](#documentation)
- [Migrating from kqr-scanner](#migrating-from-kqr-scanner)

## Install

```bash
npx k-qr-scanner init
```

`init` detects your framework and package manager, installs the package and writes a ready-to-use scanner component. For React Native it also installs `react-native-webview` and adds the camera permissions.

Or install it yourself:

```bash
npm install k-qr-scanner        # pnpm add · yarn add · bun add
```

## Quick start

```ts
import { scanQR } from 'k-qr-scanner';

const { text } = await scanQR({ locale: 'lo', heading: 'ສະແກນເພື່ອຈ່າຍ' });
```

`scanQR()` opens the scanner, resolves with the first code and removes the scanner again. It rejects with a `ScanError` when the camera cannot start, or with an `AbortError` when the user closes it:

```ts
import { scanQR, QRScanner, ScanError } from 'k-qr-scanner';

QRScanner.preload(); // fetch and compile the engine early, e.g. when the Scan button appears

try {
  const result = await scanQR({ theme: 'alipay', signal: AbortSignal.timeout(60_000) });
  console.log(result.text, result.format, result.source); // source: 'camera' | 'image'
} catch (err) {
  if (err instanceof ScanError) showCameraHelp(err.code); // 'permission-denied', 'no-camera', …
  // otherwise the user closed the scanner, or the signal fired
}
```

No build step? Use the script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/k-qr-scanner/dist/kqrcode.global.js"></script>

<kqr-scanner locale="lo"></kqr-scanner>
<script>
  document.querySelector('kqr-scanner').addEventListener('scan', (e) => alert(e.detail.text));
</script>
```

## Frameworks

Every entry point is safe to import during server-side rendering; the scanner only activates in the browser.

**React / Next.js**: the wrapper ships with `'use client'`.

```tsx
import { QRScanner } from 'k-qr-scanner/react';

{open && (
  <QRScanner locale="lo" onScan={(r) => { setOpen(false); pay(r.text); }} onClose={() => setOpen(false)}>
    <button slot="actions-left" onClick={showMyCode}>My QR code</button>
  </QRScanner>
)}
```

**Vue / Nuxt**: in Nuxt, render it inside `<ClientOnly>`.

```vue
<QRScanner v-if="open" theme="alipay" locale="zh" @scan="onScan" @close="open = false" />
```

**Svelte / SvelteKit**: an action; children use `data-slot`.

```svelte
<div use:qrScanner={{ locale: 'lo', onScan: (r) => pay(r.text), onClose: () => (open = false) }}></div>
```

**Angular**: the custom element, with `CUSTOM_ELEMENTS_SCHEMA`.

```html
<kqr-scanner locale="lo" (scan)="onScan($any($event).detail)" (close)="open = false"></kqr-scanner>
```

**React Native / Expo**: the same scanner, running in a WebView with the engine bundled, so it works offline and in Expo Go.

```tsx
import { QRScanner } from 'k-qr-scanner/react-native';

<Modal visible={open} presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
  <QRScanner style={{ flex: 1 }} locale="lo" onScan={(r) => pay(r.text)} onClose={() => setOpen(false)} />
</Modal>
```

The component asks for the camera permission itself, releases the camera while the app is in the background and recovers if the OS kills the WebView. On Expo, the config plugin (`"plugins": ["k-qr-scanner"]`) adds the permission entries.

Full examples for every framework: **[docs/FRAMEWORKS.md](docs/FRAMEWORKS.md)**. React Native setup and props: **[docs/REACT_NATIVE.md](docs/REACT_NATIVE.md)**.

## Check codes before they count

`accept` runs for every decoded code, from the camera and from album photos, before it becomes the result:

| `accept` returns | what happens |
| :--- | :--- |
| `true` or nothing | the code is the result |
| `false` | the code is ignored and scanning continues |
| a string | the code is ignored, scanning continues, and the string is shown to the user |

```ts
const result = await scanQR({
  formats: ['qr_code'], // read only regular QR codes (default: QR Code, Micro QR and rMQR)
  accept: async (r) => {
    if (!r.text.startsWith('000201')) return 'This is not a payment QR code';
    const res = await fetch(`/api/qr/check?c=${encodeURIComponent(r.text)}`);
    return res.ok || 'Unknown merchant';
  },
});
console.log(result.format, result.version, result.ecLevel); // 'qr_code' '7' 'M'
```

A code that is turned down is not checked again while it stays in view. `accept`, `formats` and a `reject` event (`onReject` in the wrappers) work the same in `scanQR`, `<kqr-scanner>`, the headless `QRScanner` and every framework wrapper.

## Look and feel

```html
<kqr-scanner theme="alipay" locale="zh" heading="扫一扫" style="--kqr-accent: #1677ff">
  <button slot="actions-left" onclick="openMyCode()">我的二维码</button>
  <nav slot="footer"><b>扫码</b><span>识物</span><span>AR</span></nav>
</kqr-scanner>

<style>
  kqr-scanner::part(hint) { background: #0006; padding: 6px 14px; border-radius: 20px; }
</style>
```

| theme | look |
| :--- | :--- |
| `wechat` (default) | a thin glowing line sweeps the whole screen |
| `alipay` | a gradient band with a bright edge sweeps the whole screen |
| `grid` | corner brackets with a grid sweeping inside |
| `frame` | a dimmed mask around a frame with a scan line |
| `none` | the camera only; you draw the UI |

The frame is decoration only: the whole camera image is always scanned. Themes, all 15 CSS variables, 18 parts, 8 slots and the built-in languages (English, Lao, Chinese) are covered in **[docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)**.

## Headless mode

Bring your own `<video>` and UI, e.g. for a checkout counter that scans continuously:

```ts
import { QRScanner } from 'k-qr-scanner';

const scanner = new QRScanner({ video, continuous: true });
scanner.on('hint', ({ hint }) => drawBox(hint)); // where a code is, even before it can be read
scanner.on('result', (r) => addToCart(r.text));
await scanner.start();
```

It can also read a photo without camera permission:

```ts
const result = await new QRScanner({ video: document.createElement('video') }).scanImage(file);
```

Every option, method, event and type: **[docs/API.md](docs/API.md)**.

## Going to production

- **HTTPS.** Browsers only open the camera on secure origins; `localhost` is fine during development.
- **Content-Security-Policy.** Allow `worker-src blob:` and `script-src 'wasm-unsafe-eval'`. `npx k-qr-scanner doctor` checks your project for this and more.
- **Treat scanned text as untrusted input.** Validate it before acting on it, and never insert it as HTML. `accept` is a good place to do this.
- **Preload.** Call `QRScanner.preload()` when your Scan button appears, so the first scan opens instantly.
- **Self-hosting the script build.** Serve `kqrcode.global.js`, `kqrcode.engine.js` and `kqrcode.jsqr.js` from one directory.
- **WebGPU super-resolution** loads ONNX Runtime Web from jsDelivr. To avoid third-party scripts, self-host it and set `onnx-runtime-url`.

## Benchmarks

Every engine sees the same pixels: synthetic camera frames with perspective, rotation, defocus, sensor noise, uneven light and low contrast, carrying real payloads (a URL and an EMVCo / LaoQR payment string). The WeChat column is the real `wechat_qrcode` engine from OpenCV contrib, running as native C++.

<!-- BENCH:START -->

| Scenario | **k-qr-scanner** | WeChat ¹ | ZXing-WASM | jsQR |
| :--- | :---: | :---: | :---: | :---: |
| **🎯 Decode rate: all frames** | **`65%`** 🏆 | `62%` | `61%` | `42%` |
| **🔭 Far: 1.5 px modules** | `17%` | **`29%`** 🏆 | `4%` | `0%` |
| **🔭 Far: 2.5 px modules** | **`63%`** 🏆 | `50%` | **`63%`** 🏆 | `25%` |
| **🌫️ Blurred (σ 0.8)** | **`75%`** 🏆 | `73%` | `67%` | `46%` |
| **🌗 Low contrast** | **`61%`** 🏆 | `53%` | `60%` | `44%` |
| **⏱️ Latency per frame (p50 / p95)** | `14.4 ms`<br><sub>p95: 50.6 ms</sub> | `13.4 ms`<br><sub>p95: 106.7 ms</sub> | **`10.6 ms`** 🏆<br><sub>p95: 12.4 ms</sub> | `34.0 ms`<br><sub>p95: 50.1 ms</sub> |
| **💤 Frame without a code (p50)** | `18.8 ms` | `271.1 ms` | **`8.6 ms`** 🏆 | `116.3 ms` |

> 144 synthetic 1280×720 frames + 8 without a code · single CPU thread · last updated 2026-11-19

<!-- BENCH:END -->

¹ WeChat = OpenCV `wechat_qrcode` 4.14, native C++, one thread. k-qr-scanner runs with `superResolution: 'webgpu'`; the default `'js'` mode is within one point.

The scanner matches WeChat's open-source engine overall and does far less work on frames without a code, which is most of what a live camera sees. WeChat's CNN detector still wins on the very farthest codes. Method, more tables and how to reproduce: **[docs/BENCHMARK.md](docs/BENCHMARK.md)**.

## Size

| what | when it loads | gzip |
| :--- | :--- | :--- |
| UI and scanner logic | on import | ~14 kB |
| decoding engine (ZXing WebAssembly, detectors, super-resolution) | when the scanner first opens, or on `QRScanner.preload()` | ~460 kB, then cached |
| jsQR fallback | only when a CSP blocks workers or WebAssembly | ~47 kB |
| ONNX Runtime Web | only with `superResolution: 'webgpu'` | from a CDN or your server |

One decoding worker is shared by every scanner on the page and stays warm for 30 seconds after the last one closes, so reopening is instant. In React Native the engine is bundled with the component (about 0.5 MB gzip).

## Browser and platform support

| platform | notes |
| :--- | :--- |
| Chrome and Edge (desktop, Android) | full support, including hardware zoom and the flashlight on Android |
| Firefox | full support |
| Safari 15.4+ (iOS, macOS) | full support with digital zoom on a 4K stream (Safari has no camera zoom API) |
| React Native | iOS 14.5+ and Android 7+, through `react-native-webview` 13+ |

If a strict CSP blocks WebAssembly or workers, the scanner falls back to jsQR, which reads regular QR codes only.

Tested with 70 automated tests, production builds of React, Next.js, Nuxt, SvelteKit and Angular apps scanning end to end, and Chrome, Firefox and WebKit runs (20 start/stop cycles with no leaked workers or camera tracks). See **[docs/TESTING.md](docs/TESTING.md)**.

> [!NOTE]
> k-qr-scanner is in **beta (0.x)**, so the API may still change before 1.0. Reports from real phones are very welcome: [open an issue](https://github.com/kris-lx/kqrcode/issues/new/choose).

## Documentation

| guide | covers |
| :--- | :--- |
| [API reference](docs/API.md) | `scanQR`, `<kqr-scanner>`, the headless `QRScanner`, types, the CLI |
| [Frameworks](docs/FRAMEWORKS.md) | React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Angular, plain HTML |
| [React Native](docs/REACT_NATIVE.md) | setup, permissions, props, platform notes |
| [Customizing](docs/CUSTOMIZE.md) | themes, CSS variables, parts, slots, languages |
| [Benchmark](docs/BENCHMARK.md) | method and full results |
| [Testing](docs/TESTING.md) | the test layers and how to run them |
| [`llms.txt`](llms.txt) | the whole API on one page, for AI assistants |

## Migrating from kqr-scanner

The package used to be published as `kqr-scanner`. The API is the same; only the package name changed:

```bash
npm uninstall kqr-scanner && npm install k-qr-scanner
```

Then replace `kqr-scanner` with `k-qr-scanner` in your imports (`'k-qr-scanner/react'` and so on). The `<kqr-scanner>` element and its attributes keep their names. Version 0.2.0 also changed `ScanResult.format`; see the [changelog](CHANGELOG.md).

## Buy me a coffee

If k-qr-scanner saves you time, you can support its development. Thank you! 🙏

<table align="center">
  <tr>
    <td align="center"><img src="docs/assets/support/wechat-pay.png" alt="WeChat Pay" width="200" /><br /><b>WeChat Pay</b> · 微信支付</td>
    <td align="center"><img src="docs/assets/support/lao-qr.png" alt="LAO QR" width="200" /><br /><b>LAO QR</b> · ໂອນຜ່ານ LAPNet</td>
    <td align="center"><img src="docs/assets/support/alipay.png" alt="Alipay" width="200" /><br /><b>Alipay</b> · 支付宝</td>
  </tr>
</table>

<p align="center"><sub>Each of these codes was read by k-qr-scanner before it went into this README.</sub></p>

---

**Maintained by [kris](https://github.com/kris-lx)** · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [MIT License](LICENSE) · [Third-party notices](NOTICE)
