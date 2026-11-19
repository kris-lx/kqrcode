<div align="center">
<br />
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg" />
  <img src="docs/assets/logo.svg" alt="kqrcode" width="340" />
</picture>

<p><strong>The WeChat-style QR scanner for the web</strong></p>
<p><i>A full-screen, long-range QR code scanner that finds codes anywhere in view, at any angle and from across the room, and zooms in by itself when a code is too small to read. It decodes with ZXing-C++ compiled to WebAssembly, falls back to WeChat's super-resolution model for blurry codes, and works in React, Vue, Svelte, Angular or plain HTML.</i></p>

<p>
<a href="https://www.npmjs.com/package/kqrcode"><img src="https://img.shields.io/npm/v/kqrcode?style=for-the-badge&logo=npm&color=CB3837" alt="npm version"></a>
<a href="https://github.com/kris-lx/kqrcode/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kris-lx/kqrcode/ci.yml?branch=main&label=tests&style=for-the-badge&logo=github" alt="Tests"></a>
<a href="#-browser-support"><img src="https://img.shields.io/badge/size-14_kB_gzip-07c160?style=for-the-badge" alt="14 kB gzip"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/kris-lx/kqrcode?style=for-the-badge&color=blue" alt="License"></a>
</p>

<img src="docs/assets/themes.png" alt="kqrcode themes: wechat, alipay, grid, frame, success" width="860" />
</div>

---

## 📊 Benchmarks: kqrcode vs WeChat vs ZXing vs jsQR

Every engine sees **the same pixels**: hard synthetic camera frames with perspective, random rotation, Gaussian defocus, sensor noise, an illumination gradient and low contrast, using real payloads (a URL and an EMVCo / LaoQR payment string). **WeChat** is the real engine from OpenCV contrib `wechat_qrcode` (CNN detector plus CNN super-resolution), running as native C++.

<!-- BENCH:START -->

| Scenario | **kqrcode** | WeChat ¹ | ZXing-WASM | jsQR |
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

¹ WeChat = OpenCV `wechat_qrcode` 4.14, native C++, 1 thread. kqrcode uses `superResolution: 'webgpu'`; the default `'js'` mode scores within 1 point.

**Where kqrcode wins:**
- Frames with **no code**, which is most of what a live camera sees: about 14× less work than WeChat's CNN detector.
- Mid-range and low-contrast codes.

**Where WeChat still wins:** the very farthest codes (1.5 px per module), thanks to its CNN detector.

> Verified with **41 automated tests**, production builds of **React, Next.js, Nuxt, SvelteKit and Angular** scanning end-to-end, and cross-browser runs on **Chrome, Firefox and WebKit** (20 start/stop cycles, 0 leaked workers or camera tracks).

> [!TIP]
> Methodology, the super-resolution timings on WebGPU and how to reproduce everything: **[docs/BENCHMARK.md](docs/BENCHMARK.md)**.

> [!TIP]
> Prefer a single-page summary of the whole API? See [`llms.txt`](./llms.txt).

---

## 🚀 Key Features

* **Scan-Anywhere Detection**: There is no box to aim at. kqrcode analyses the entire camera frame, handles rotated, skewed and inverted codes, and keeps tracking a code between frames so repeat decodes are near-instant.
* **Auto-Zoom for Long Range**:
  * A finder-pattern locator (1:1:3:1:1) and a blur-tolerant texture detector find codes that are still too small to decode, and measure their module size.
  * The scanner then zooms until the code is readable, without pushing it off-screen. When nothing is in view it sweeps the zoom levels, like WeChat.
* **Real Hardware Zoom, and an iOS Path**:
  * Uses the camera's optical or hardware zoom where the browser exposes it (Android Chrome).
  * On iOS Safari, which has no zoom API, it requests a **4K stream**, re-grabs the located code at native sensor resolution and animates a matching digital zoom.
* **ZXing-C++ in a Web Worker**: Decoding never blocks the UI thread. A 720p frame takes about 8 ms (jsQR: about 34 ms). If a strict CSP blocks workers or WebAssembly, it falls back to jsQR automatically.
* **WeChat Super-Resolution on WebGPU**: Small, blurry codes that still fail get upscaled by WeChat's super-resolution CNN (5.3k parameters, checked against OpenCV's output) before a last decode attempt.
  * Backends: ONNX Runtime Web on **WebGPU**, its WASM backend, or a built-in zero-download kernel.
  * A 128 px region takes about 10 ms on an integrated GPU.
* **14 kB Initial Load**: The UI and scanner logic are about 14 kB gzipped. The decoding engine (~460 kB, with the WebAssembly gzip-compressed inside) is a separate chunk that downloads when the scanner first opens, or earlier with `QRScanner.preload()`, which also compiles it in the background. One warm worker is shared by every scanner on the page, so reopening the scanner is instant.
* **Brandable to the Pixel**:
  * Five themes: `wechat`, `alipay`, `grid`, `frame` and `none`.
  * 15 CSS variables and 18 `::part()` hooks.
  * Slots for your own "My QR code" button, tab bar, hint or error screen.
* **Native-App UX**:
  * Pinch and double-tap zoom, and tap to focus.
  * A flashlight button that appears when the scene gets dark.
  * Album import, beep and haptic feedback.
  * A frozen frame with a "found it" check mark exactly where the code was.
* **One API, Every Framework**: `scanQR()` for a single call, `<kqr-scanner>` for templates, and thin wrappers for React (with `'use client'`), Vue and Svelte. Imports are SSR-safe in Next.js, Nuxt, SvelteKit and Angular.
* **CLI Scaffolding**:
  * `npx kqrcode init` detects your framework and package manager, installs the package and writes a ready-to-use component.
  * `npx kqrcode doctor` checks your setup, including CSP.
* **Private by Design**: Frames never leave the device. The only optional network request is ONNX Runtime Web for WebGPU, and you can self-host it.

---

## 🛠️ Installation & Quick Start

```bash
npx kqrcode init          # detects your framework, installs, creates a <QrScanner> component
# or
npm install kqrcode       # pnpm add kqrcode · yarn add kqrcode · bun add kqrcode
```

```ts
import { scanQR } from 'kqrcode';

// Opens the full-screen scanner, resolves with the first code, cleans up after itself.
const { text } = await scanQR({ theme: 'wechat', locale: 'lo', heading: 'ສະແກນເພື່ອຈ່າຍ' });
```

No bundler? Use one script tag (17 kB; the engine loads from `kqrcode.engine.js` next to it on first use):

```html
<script src="https://cdn.jsdelivr.net/npm/kqrcode/dist/kqrcode.global.js"></script>
<kqr-scanner theme="alipay"></kqr-scanner>
<script>
  document.querySelector('kqr-scanner').addEventListener('scan', (e) => alert(e.detail.text));
</script>
```

---

## 📘 Comprehensive Guide

### 1. ⚡ One Call: `scanQR()` with Cancellation and Error Handling

```ts
import { scanQR, QRScanner, ScanError } from 'kqrcode';

// Start downloading the decoder while the user is still looking at your "Scan" button.
QRScanner.preload();

const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000); // give up after a minute

try {
  const result = await scanQR({
    theme: 'alipay',
    locale: 'en',                       // 'en' | 'lo' | 'zh', or any labels you pass
    heading: 'Scan to pay',
    style: { '--kqr-accent': '#e60012' }, // your brand colour
    signal: controller.signal,
  });
  console.log(result.text, result.source); // 'camera' or 'image' (album)
} catch (err) {
  if (err instanceof ScanError) {
    // 'permission-denied' | 'no-camera' | 'camera-busy' | 'insecure-context' | 'unsupported'
    showCameraHelp(err.code);
  } else if ((err as DOMException).name === 'AbortError') {
    // the user tapped ✕, or the signal fired
  }
}
```

---

### 2. ⚛️ React & Next.js

```tsx
import { useState } from 'react';
import { QRScanner } from 'kqrcode/react'; // ships with 'use client', safe in App Router pages

export function PayButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Scan to pay</button>
      {open && (
        <QRScanner
          theme="wechat"
          locale="lo"
          superResolution="webgpu"            // WeChat SR on the GPU for tiny/blurry codes
          onScan={(r) => { setOpen(false); pay(r.text); }}
          onClose={() => setOpen(false)}
          onError={(e) => console.warn(e.code)}
        >
          {/* anything with slot="…" goes into the scanner UI */}
          <button slot="actions-left" onClick={showMyCode}>My QR code</button>
        </QRScanner>
      )}
    </>
  );
}
```

> [!TIP]
> In Next.js, lazy-load it so the engine chunk is only fetched on the scan page: `dynamic(() => import('kqrcode/react').then(m => m.QRScanner), { ssr: false })`.

---

### 3. 💚 Vue & Nuxt

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { QRScanner } from 'kqrcode/vue';

const open = ref(false);
function onScan(r: { text: string }) {
  open.value = false;
  navigateTo(`/pay?qr=${encodeURIComponent(r.text)}`);
}
</script>

<template>
  <button @click="open = true">Scan</button>
  <!-- Nuxt: wrap in <ClientOnly>, or put it in a *.client.vue component -->
  <ClientOnly>
    <QRScanner v-if="open" theme="alipay" locale="zh" @scan="onScan" @close="open = false">
      <nav slot="footer" class="tabs"><b>扫码</b><span>识物</span><span>AR</span></nav>
    </QRScanner>
  </ClientOnly>
</template>
```

---

### 4. 🧡 Svelte & SvelteKit

```svelte
<script lang="ts">
  import { qrScanner } from 'kqrcode/svelte'; // actions only run in the browser, so SSR-safe
  let open = $state(false);
</script>

<button onclick={() => (open = true)}>Scan</button>

{#if open}
  <div use:qrScanner={{ theme: 'grid', locale: 'lo', onScan: (r) => { open = false; pay(r.text); }, onClose: () => (open = false) }}>
    <!-- Svelte 5 only allows slot="" inside custom elements, so the action reads data-slot -->
    <button data-slot="actions-left">My QR</button>
  </div>
{/if}
```

---

### 5. 🅰️ Angular

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import 'kqrcode';                       // registers <kqr-scanner>
import type { ScanResult } from 'kqrcode';

@Component({
  selector: 'app-scan',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (open) {
      <kqr-scanner theme="wechat" locale="lo" (scan)="onScan($any($event).detail)" (close)="open = false"></kqr-scanner>
    }
    <button (click)="open = true">Scan</button>`,
})
export class ScanComponent {
  open = false;
  onScan(r: ScanResult) { this.open = false; console.log(r.text); }
}
```

---

### 6. 🎨 Themes & Branding: Build a WeChat- or Alipay-Style Screen

```html
<kqr-scanner
  theme="alipay"
  locale="zh"
  heading="扫一扫"
  torch="auto"
  success="dot"
  style="
    --kqr-accent: #1677ff;          /* scan line & corners   */
    --kqr-success: #00b578;         /* check mark            */
    --kqr-scan-duration: 1.8s;
    --kqr-button-bg: rgba(255,255,255,.16);
  ">
  <button slot="actions-left" onclick="openMyCode()">我的二维码</button>
  <button slot="actions-right" onclick="this.closest('kqr-scanner').pickImage()">相册</button>
  <nav slot="footer"><b>扫码</b><span>识物</span><span>AR</span></nav>
</kqr-scanner>

<style>
  kqr-scanner::part(hint)  { font-size: 15px; background: #0006; padding: 6px 14px; border-radius: 20px; }
  kqr-scanner::part(close) { display: none; } /* use your own back button in slot="top-left" */
</style>
```

| Theme | Look |
| :--- | :--- |
| `wechat` (default) | A thin glowing line sweeps the whole screen, with no frame |
| `alipay` | A gradient band with a bright edge sweeps the whole screen |
| `grid` | Corner brackets with a grid mesh sweeping inside |
| `frame` | Classic dimmed mask with a frame and line |
| `none` | Camera only; you draw the UI |

All 15 variables, 18 parts and 8 slots are listed in **[docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)**.

---

### 7. 🧪 Headless Mode: Your Own UI, Continuous Checkout Scanning

```ts
import { QRScanner } from 'kqrcode';

const video = document.querySelector('video')!;
const scanner = new QRScanner({
  video,
  continuous: true,          // keep scanning; the same code is ignored for 1.5 s
  superResolution: 'webgpu',
  maxFrameSide: 1280,        // lower = faster, shorter range
});

// Where a code is, even before it can be read: draw your own tracking box
scanner.on('hint', ({ hint, decoded }) => drawBox(hint, decoded));
scanner.on('zoom', ({ zoom, digital }) => zoomLabel.textContent = `${zoom.toFixed(1)}×${digital ? ' (digital)' : ''}`);
scanner.on('dark', (dark) => torchButton.hidden = !(dark && scanner.canTorch));
scanner.on('result', (r) => addToCart(r.text));

await scanner.start();
torchButton.onclick = () => scanner.setTorch(true);
// later: scanner.stop() releases the camera and the worker
```

---

### 8. 🖼️ Scan From a Photo (Works Without Camera Permission)

```ts
const file = input.files![0];
const result = await new QRScanner({ video: document.createElement('video') }).scanImage(file);
console.log(result?.text ?? 'no QR code in this image');
```

---

### 9. 🛡️ Production Checklist

```ts
const { text } = await scanQR();

// 1. Treat scanned text as untrusted input: validate before acting on it.
if (text.startsWith('000201')) {
  // EMVCo merchant QR (LaoQR, PromptPay, …): verify the CRC and the merchant on your server
} else if (/^https:\/\/pay\.example\.com\//.test(text)) {
  location.href = text;
} else {
  showUnknownCode(text); // never inject it as HTML
}
```

* **HTTPS**: browsers only allow the camera on secure origins (`localhost` works in development).
* **CSP**: allow `worker-src blob:` and `script-src 'wasm-unsafe-eval'`. Run `npx kqrcode doctor` to check.
* **Preload**: call `QRScanner.preload()` when your scan button appears. It downloads and compiles the engine, so the first scan opens instantly.
* **Self-hosting the `<script>` build**: serve `kqrcode.global.js`, `kqrcode.engine.js` and `kqrcode.jsqr.js` from the same directory.
* **WebGPU super-resolution**: self-host ONNX Runtime Web and set `onnx-runtime-url` if you don't want third-party script loads.

---

## 🧠 `<kqr-scanner>` Reference

| Attribute | Default | Description |
| :--- | :--- | :--- |
| `theme` | `wechat` | `wechat` · `alipay` · `grid` · `frame` · `none` |
| `locale` | browser | `en` · `lo` · `zh`; override any text with the `labels` property |
| `heading` | – | Title in the top bar |
| `facing` | `environment` | `environment` (back camera) · `user` (front) |
| `continuous` | off | Keep scanning after a result |
| `inline` | off | Fill the parent element instead of the screen |
| `success` | `dot` | Found-it marker: `dot` · `box` · `none` |
| `torch` | `auto` | Flashlight button: `auto` (when dark) · `always` · `never` |
| `zoom-control` | `none` | `slider` shows a zoom slider. Pinch and double-tap always work |
| `max-zoom` | `8` | Upper zoom limit |
| `super-resolution` | `js` | `js` · `webgpu` · `off` |
| `onnx-runtime-url` | jsDelivr | ONNX Runtime Web URL for `webgpu` |
| `no-auto-zoom` · `no-close` · `no-gallery` · `no-beep` · `no-vibrate` | off | Turn features off |
| `keep-camera` · `manual` · `request-fullscreen` | off | Lifecycle control |

| Event | `detail` | Method | Description |
| :--- | :--- | :--- | :--- |
| `scan` | `ScanResult` | `start()` / `stop()` | Camera on / off |
| `error` | `ScanError` | `close()` | Stop, hide, fire `close` |
| `close` | – | `resume()` | Scan again after a result |
| `ready` | – | `pickImage()` | Open the photo picker |
| `zoom` | `{ zoom, min, max, digital }` | `toggleTorch(on?)` | Flashlight |

Headless `QRScanner`, every option and every type: **[docs/API.md](docs/API.md)** · Framework notes: **[docs/FRAMEWORKS.md](docs/FRAMEWORKS.md)**

---

## ⚙️ CLI

| Command | Description |
| :--- | :--- |
| `npx kqrcode init` | Detect the framework (Next, Nuxt, SvelteKit, Svelte, Angular, Vue, React, vanilla) and package manager (npm, pnpm, yarn, bun), install kqrcode and write a starter component |
| `npx kqrcode init --theme alipay --locale lo` | Same, with a theme and language baked in |
| `npx kqrcode doctor` | Check the Node version, the installation, framework-specific setup and a CSP that would block workers or WebAssembly |

---

## 🌐 Browser Support

| Browser | Notes |
| :--- | :--- |
| Chrome / Edge (desktop, Android) | Full support, including hardware auto-zoom on Android |
| Firefox | Full support |
| Safari 15.4+ (iOS, macOS) | Supported, with digital zoom (Safari has no camera zoom API) |

> [!NOTE]
> kqrcode is in **beta (0.x)**. The API may still change before 1.0. Device reports, especially iPhone and Android live-camera results, are very welcome: [open an issue](https://github.com/kris-lx/kqrcode/issues/new/choose).

---

## ☕ Buy Me a Coffee

If kqrcode saves you time, you can support its development with a coffee. Every cup is appreciated! 🙏

<table align="center">
  <tr>
    <td align="center"><img src="docs/assets/support/wechat-pay.png" alt="WeChat Pay" width="200" /><br /><b>WeChat Pay</b> · 微信支付</td>
    <td align="center"><img src="docs/assets/support/lao-qr.png" alt="LAO QR" width="200" /><br /><b>LAO QR</b> · ໂອນຜ່ານ LAPNet</td>
    <td align="center"><img src="docs/assets/support/alipay.png" alt="Alipay" width="200" /><br /><b>Alipay</b> · 支付宝</td>
  </tr>
</table>

<p align="center"><sub>Each code above was decoded by kqrcode itself before being added here. 😉</sub></p>

---

**Maintained by [kris](https://github.com/kris-lx) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · License: [MIT](LICENSE)** (third-party notices: [NOTICE](NOTICE))
