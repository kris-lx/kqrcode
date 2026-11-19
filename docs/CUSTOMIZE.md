# Customising the scanner

Use the lightest layer that does what you need. Each layer keeps the layers below it working.

## 0. One line

```ts
import { scanQR } from 'kpay-qr-scanner';

const { text } = await scanQR({ theme: 'alipay', locale: 'lo', heading: 'ສະແກນຈ່າຍ' });
```

`scanQR` opens the full-screen scanner, resolves with the first code and removes itself afterwards. It rejects with a `ScanError` for camera problems, or with a `DOMException('AbortError')` when the user closes it or your `signal` aborts.

To skip the engine download delay, call `QRScanner.preload()` early, e.g. when the "Scan" button is hovered or shown. The engine is ~640 KB gzip.

## 1. Themes

| `theme` | look | default accent |
|---|---|---|
| `wechat` (default) | thin glowing line sweeps the whole screen, no frame | `#07c160` |
| `alipay` | gradient band with a bright edge sweeps the whole screen | `#1677ff` |
| `grid` | corner brackets with a grid mesh sweeping inside, no dimming | `#1fd17a` |
| `frame` | classic dimmed mask, frame and line | `#1fd17a` |
| `none` | camera only; draw your own UI | – |

Scanning always covers the **whole camera image**. The frame is decoration only, as in WeChat and Alipay.

Other look options:

- `success="dot|box|none"`: the "found it" marker. `dot` is the WeChat/Alipay check mark, and the frame freezes when the code is found.
- `torch="auto|always|never"`: `auto` shows the light button only when it is dark, like WeChat's "轻触照亮".
- `zoom-control="none|slider"`: `none` is the default. Pinch, double-tap and auto-zoom still work.
- `heading="…"`: text in the top bar.
- `no-close`, `no-gallery`, `no-beep`, `no-vibrate`, `no-candidates` (hides the brackets drawn around a code that is not yet readable).

## 2. CSS variables

Set them on the element or on any ancestor:

```css
kpay-qr-scanner {
  --kqr-accent: #e60012;          /* line / corners */
  --kqr-success: #00b578;         /* check mark */
  --kqr-scan-duration: 1.8s;
  --kqr-line-width: 4px;
  --kqr-frame-size: 260px;  --kqr-frame-top: 40%;  --kqr-frame-radius: 20px;
  --kqr-corner-size: 30px;  --kqr-corner-width: 5px;
  --kqr-mask: rgba(0,0,0,.6);     /* frame theme */
  --kqr-button-bg: rgba(255,255,255,.18);  --kqr-button-size: 56px;
  --kqr-text: #fff;  --kqr-font: "Noto Sans Lao", sans-serif;  --kqr-bg: #000;
}
```

The full list is exported as `THEME_VARS`.

## 3. `::part()`: restyle a built-in piece

Parts: `stage` `video` `candidates` `effect` `scanline` `frame` `success` `focus-ring` `top` `title` `close` `bottom` `hint` `torch` `zoom` `actions` `gallery` `error`.

```css
kpay-qr-scanner::part(hint)    { font-size: 16px; background: #0006; padding: 6px 14px; border-radius: 20px; }
kpay-qr-scanner::part(scanline){ filter: drop-shadow(0 0 8px #fff); }
kpay-qr-scanner::part(close)   { display: none; }
```

## 4. Slots: your own buttons, tabs, hint and error

| slot | default content | example |
|---|---|---|
| `top-left` | ✕ close button | back arrow |
| `top-center` | `heading` text | logo |
| `top-right` | – | "…" menu |
| `hint` | status text | your own animated hint |
| `actions-left` | – | "My QR code" pill (WeChat) / "Receive & pay" (Alipay) |
| `actions-right` | album button | your own album button |
| `footer` | – | tabs: Scan · Identify · AR |
| `error` | error text | branded permission screen |

```html
<kpay-qr-scanner theme="alipay" locale="zh">
  <button slot="actions-left" onclick="openMyCode()">我的二维码</button>
  <nav slot="footer"><b>扫码</b><span>识物</span><span>AR</span></nav>
</kpay-qr-scanner>
```

Your slotted buttons can call the element's methods: `el.pickImage()`, `el.toggleTorch()`, `el.close()`, `el.resume()`.

The React, Vue and Svelte wrappers pass slotted children straight through, e.g. `<QRScanner><button slot="actions-left">…</button></QRScanner>`.

## 5. Text and languages

`locale="lo|en|zh"`, plus a `labels` property to override any string:

```ts
el.labels = { hint: 'ສະແກນເພື່ອຈ່າຍ', torchOn: 'ເປີດໄຟ' };
```

## 6. Headless: your own UI from scratch

```ts
import { QRScanner } from 'kpay-qr-scanner';
const s = new QRScanner({ video, superResolution: 'webgpu' });
s.on('hint', ({ hint }) => draw(hint));     // a code is visible but not yet readable
s.on('zoom', (z) => showZoom(z.zoom));
s.on('dark', (dark) => showTorch(dark));
s.on('result', (r) => done(r.text));
await s.start();
```

## Size

| what loads | when | size (gzip) |
|---|---|---|
| UI and scanner logic | on import | ~14 KB |
| decoding engine (ZXing WASM, detectors, SR) | first `start()` or `QRScanner.preload()` | ~640 KB, then cached |
| jsQR fallback | only if blob workers are blocked by CSP | ~47 KB |
| ONNX Runtime Web | only with `superResolution: 'webgpu'` | from CDN or your own host |

With ESM bundlers (Vite, webpack, Next, Nuxt, SvelteKit, Angular) the engine becomes a separate chunk automatically. The CJS and `<script>` builds bundle everything inline.
