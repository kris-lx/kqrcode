# Customizing the scanner

There are several layers of customization, from a single attribute to a UI you build yourself. Start with the lightest one that does what you need; each layer works together with the ones before it.

| you want to | use |
| :--- | :--- |
| pick a look | [a theme](#themes) |
| change colors, sizes and fonts | [CSS variables](#css-variables) |
| restyle one built-in piece | [`::part()`](#parts) |
| add your own buttons, tabs or screens | [slots](#slots) |
| a banking-app bottom bar | [`layout="bar"`](#bottom-bar-layout) |
| change the text or language | [languages and labels](#languages-and-labels) |
| build a completely different UI | [headless mode](#headless-mode) |

The examples use the `<kqr-scanner>` element. The same attributes work as props in the React, Vue and Svelte wrappers (in camelCase: `zoom-control` becomes `zoomControl`) and as options of `scanQR()`.

## Themes

| `theme` | look | default accent |
| :--- | :--- | :--- |
| `wechat` (default) | a thin glowing line sweeps the whole screen, with no frame | `#07c160` |
| `alipay` | a gradient band with a bright edge sweeps the whole screen | `#1677ff` |
| `grid` | corner brackets with a grid sweeping inside, no dimming | `#1fd17a` |
| `frame` | a dimmed mask around a frame with a scan line | `#1fd17a` |
| `none` | the camera only; you draw the UI | – |

The frame is decoration only. The scanner always reads the **whole camera image**, as WeChat and Alipay do.

More options that change the look:

| attribute | values | description |
| :--- | :--- | :--- |
| `success` | `dot` (default) · `box` · `none` | marker on the found code. `dot` is the WeChat/Alipay check mark, shown on a frozen frame |
| `torch` | `auto` (default) · `always` · `never` | flashlight button; `auto` shows it only when the scene gets dark |
| `zoom-control` | `none` (default) · `slider` | a zoom slider; pinch, double-tap and auto-zoom always work |
| `heading` | text | title in the top bar |
| `no-close` · `no-gallery` · `no-torch` · `no-beep` · `no-vibrate` | flags | hide a button or turn off feedback |
| `no-candidates` | flag | hide the brackets drawn around a code that can't be read yet |

## CSS variables

Set them on the element or on any parent element:

```css
kqr-scanner {
  --kqr-accent: #e60012;                 /* scan line and corners */
  --kqr-success: #00b578;                /* check mark */
  --kqr-scan-duration: 1.8s;             /* one sweep of the scan line */
  --kqr-line-width: 4px;
  --kqr-frame-size: 260px;               /* frame and grid themes */
  --kqr-frame-top: 40%;
  --kqr-frame-radius: 20px;
  --kqr-corner-size: 30px;
  --kqr-corner-width: 5px;               /* 0 hides the corners */
  --kqr-frame-border: 1px solid #fff6;   /* a line around the frame; default none */
  --kqr-mask: rgba(0, 0, 0, .6);         /* frame theme */
  --kqr-button-bg: rgba(255, 255, 255, .18);
  --kqr-button-size: 56px;
  --kqr-text: #fff;
  --kqr-font: "Noto Sans Lao", sans-serif;
  --kqr-bg: #000;                        /* behind the video */
  --kqr-gallery-bg: #e60012;             /* album button in layout="bar"; default: accent */
  --kqr-gallery-size: 68px;
  --kqr-gallery-radius: 22px;
}
```

`scanQR()` takes them as `style: { '--kqr-accent': '#e60012' }`, and the React wrapper as its `style` prop. The full list is exported as `THEME_VARS`.

## Parts

Every built-in piece of the UI is exposed as a CSS part, so you can restyle it from outside:

`stage` · `video` · `candidates` · `effect` · `scanline` · `frame` · `success` · `focus-ring` · `top` · `title` · `close` · `banner` · `bottom` · `hint` · `torch` · `zoom` · `actions` · `gallery` · `error`

```css
kqr-scanner::part(hint)     { font-size: 16px; background: #0006; padding: 6px 14px; border-radius: 20px; }
kqr-scanner::part(scanline) { filter: drop-shadow(0 0 8px #fff); }
kqr-scanner::part(close)    { display: none; }
```

## Slots

Put your own elements into the scanner UI with the `slot` attribute:

| slot | replaces | ideas |
| :--- | :--- | :--- |
| `top-left` | the ✕ close button | a back arrow |
| `top-center` | the heading | your logo |
| `top-right` | – | a "…" menu |
| `banner` | – | under the top bar: "Supported QR" text and logos |
| `hint` | the status text | your own animated hint |
| `actions-left` | – | a "My QR code" button (WeChat) or "Receive money" (Alipay) |
| `actions-right` | the album button | your own album button |
| `actions-center` | – (the album button with `layout="bar"`) | a big main button |
| `footer` | – | tabs such as Scan · Translate · AR |
| `error` | the error text | a branded camera-permission screen |

```html
<kqr-scanner theme="alipay" locale="zh">
  <button slot="actions-left" onclick="openMyCode()">我的二维码</button>
  <button slot="actions-right" onclick="this.closest('kqr-scanner').pickImage()">相册</button>
  <nav slot="footer"><b>扫码</b><span>识物</span><span>AR</span></nav>
</kqr-scanner>
```

Your buttons can call the element's methods: `pickImage()`, `toggleTorch()`, `close()` and `resume()`.

In the wrappers:

- **React and Vue** pass children through as they are: `<QRScanner><button slot="actions-left">…</button></QRScanner>`.
- **Svelte** uses `data-slot="…"` instead of `slot`, because Svelte 5 only allows `slot` inside custom elements.
- **React Native** takes slots as HTML strings; see [REACT_NATIVE.md](REACT_NATIVE.md#props).

## Bottom bar layout

Many banking and wallet apps put the controls in one row at the bottom: the flashlight on the left, a large album button in the middle and one more button on the right. `layout="bar"` does exactly that with the built-in buttons:

| cell | default content | replace with |
| :--- | :--- | :--- |
| left | the flashlight, shown whenever the camera has one | `slot="actions-left"` |
| center | a large album button (`--kqr-gallery-bg`, `--kqr-gallery-size`, `--kqr-gallery-radius`) | `slot="actions-center"` |
| right | – | `slot="actions-right"` |

A complete payment screen: a "supported QR" banner, a square frame with a thin border and a red line, and the bottom bar.

```html
<kqr-scanner theme="frame" layout="bar" locale="lo" no-close
  style="--kqr-accent: #e60012; --kqr-mask: rgba(0, 0, 0, .35);
         --kqr-frame-size: 80vw; --kqr-frame-top: 47%; --kqr-frame-radius: 0;
         --kqr-corner-width: 0; --kqr-frame-border: 1px solid #fff6; --kqr-line-width: 1px">
  <div slot="banner">
    <div>ຮອງຮັບຄິວອາ / Support QR:</div>
    <img src="/img/supported-qr.png" alt="LAO QR, UnionPay, WeChat Pay" height="56">
  </div>
  <button slot="actions-right" onclick="openMyQr()" aria-label="My QR">
    <img src="/img/my-qr.svg" alt="" width="34">
  </button>
</kqr-scanner>

<script type="module">
  import { acceptEMV, parseEMV } from 'k-qr-scanner';

  const el = document.querySelector('kqr-scanner');
  el.accept = acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' });
  el.addEventListener('scan', (e) => pay(parseEMV(e.detail.text)));
</script>
```

The same in React: `<QRScanner theme="frame" layout="bar" style={{ '--kqr-accent': '#e60012' }} accept={acceptEMV({ currency: 'LAK' })}>…</QRScanner>`, with the banner and button as children carrying `slot="…"`. `acceptEMV` and `parseEMV` are described in [API.md](API.md#payment-qr-codes-emv).

## Languages and labels

English (`en`), Lao (`lo`) and Chinese (`zh`) are built in. Without a `locale` attribute, the browser language is used, falling back to English.

Replace any text with the `labels` property (the `labels` prop or option in the wrappers and `scanQR()`):

```ts
el.labels = { hint: 'ສະແກນເພື່ອຈ່າຍ', torchOn: 'ເປີດໄຟ' };
```

| label | shown |
| :--- | :--- |
| `hint` | while scanning |
| `zooming` | while auto-zoom moves in on a code |
| `dark` | when the scene is too dark |
| `torchOn` / `torchOff` | on the flashlight button |
| `gallery` | on the album button |
| `noQrInImage` | when a picked photo has no code |
| `close` | label of the ✕ button |
| `permission` | camera permission denied |
| `noCamera` | no camera found |
| `busy` | the camera is used by another app |
| `insecure` | the page is not served over HTTPS |
| `unsupported` | the browser can't open a camera |

For another language, pass all labels in that language; any label you leave out is shown in English. The built-in texts are exported as `LABELS`.

## Headless mode

For a completely different interface, use the `QRScanner` class with your own `<video>` element. It does the camera, auto-zoom and decoding, and reports what it sees through events:

```ts
import { QRScanner } from 'k-qr-scanner';

const scanner = new QRScanner({ video, superResolution: 'webgpu' });
scanner.on('hint', ({ hint }) => drawBox(hint));      // a code is in view but can't be read yet
scanner.on('zoom', ({ zoom }) => showZoom(zoom));
scanner.on('dark', (dark) => showTorchButton(dark));
scanner.on('result', (r) => done(r.text));
await scanner.start();
```

All options and events: [API.md](API.md#qrscanner-headless).
