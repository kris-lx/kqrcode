# API reference

k-qr-scanner offers three levels of control:

1. **[`scanQR()`](#scanqr)**: one call that opens the scanner and resolves with a code.
2. **[`<kqr-scanner>`](#the-kqr-scanner-element)**: the full-screen UI as a custom element, for templates and frameworks.
3. **[`QRScanner`](#qrscanner-headless)**: the camera and decoding engine with no UI, for your own interface.

Also on this page: [the `accept` callback](#the-accept-callback), [payment QR codes (EMV)](#payment-qr-codes-emv), [types](#types), [framework wrappers](#framework-wrappers), [super-resolution](#super-resolution), [`k-qr-scanner/sr`](#k-qr-scannersr) and [the CLI](#cli).

---

## `scanQR()`

```ts
import { scanQR } from 'k-qr-scanner';

function scanQR(options?: ScanQROptions): Promise<ScanResult>;
```

Opens the full-screen scanner, resolves with the first accepted code and then removes the scanner.

It rejects with:

- a [`ScanError`](#types) when the camera cannot start. The scanner stays on screen so the user can read the message.
- a `DOMException` when the user closes the scanner or `signal` aborts.

### Options

| option | type | default | description |
| :--- | :--- | :--- | :--- |
| `theme` | `'wechat' \| 'alipay' \| 'grid' \| 'frame' \| 'none'` | `'wechat'` | the look, see [CUSTOMIZE.md](CUSTOMIZE.md) |
| `locale` | `string` | browser language | `'en'`, `'lo'` and `'zh'` are built in |
| `heading` | `string` | – | text in the top bar |
| `labels` | `Partial<ScannerLabels>` | – | replace any built-in text |
| `facing` | `'environment' \| 'user'` | `'environment'` | back or front camera |
| `success` | `'dot' \| 'box' \| 'none'` | `'dot'` | the marker shown where the code was found |
| `torch` | `'auto' \| 'always' \| 'never'` | `'auto'` | flashlight button; `auto` shows it when the scene is dark |
| `zoomControl` | `'slider' \| 'none'` | `'none'` | show a zoom slider (pinch and double-tap always work) |
| `layout` | `'default' \| 'bar'` | `'default'` | `'bar'`: flashlight, big album button and your button in one row, see [CUSTOMIZE.md](CUSTOMIZE.md#bottom-bar-layout) |
| `autoZoom` | `boolean` | `true` | zoom in on small codes |
| `maxZoom` | `number` | `8` | zoom limit (digital zoom stops at 4×) |
| `gallery` | `boolean` | `true` | album button |
| `beep` / `vibrate` | `boolean` | `true` | feedback on a successful scan |
| `superResolution` | `'js' \| 'webgpu' \| 'off'` | `'js'` | see [super-resolution](#super-resolution) |
| `onnxRuntimeUrl` | `string` | jsDelivr | where to load ONNX Runtime Web from for `'webgpu'` |
| `formats` | `QRFormat[]` | all | which QR-family symbols to read |
| `accept` | `AcceptFn` | – | check each code first, see [the `accept` callback](#the-accept-callback) |
| `onReject` | `(result, message?) => void` | – | called when `accept` turns a code down |
| `style` | `Record<string, string>` | – | CSS variables, e.g. `{ '--kqr-accent': '#e60012' }` |
| `slots` | `Record<string, Node \| string>` | – | extra UI by slot name, e.g. `{ footer: tabs }` |
| `container` | `HTMLElement` | `document.body` | where to mount the scanner |
| `inline` | `boolean` | `false` | fill `container` instead of the whole screen |
| `signal` | `AbortSignal` | – | close the scanner from your code |

---

## The `<kqr-scanner>` element

Importing `k-qr-scanner` or any framework wrapper registers the element. On the server, registration is skipped.

```html
<kqr-scanner theme="alipay" locale="lo" continuous></kqr-scanner>
```

The camera starts as soon as the element is added to the page (unless `manual` is set) and stops when it is removed.

### Attributes

| attribute | values | default |
| :--- | :--- | :--- |
| `theme` | `wechat` · `alipay` · `grid` · `frame` · `none` | `wechat` |
| `locale` | `en` · `lo` · `zh`, or any code with your own `labels` | browser language |
| `heading` | text | – |
| `facing` | `environment` · `user` | `environment` |
| `success` | `dot` · `box` · `none` | `dot` |
| `torch` | `auto` · `always` · `never` | `auto` |
| `zoom-control` | `slider` · `none` | `none` |
| `layout` | `default` · `bar` | `default` |
| `max-zoom` | number | `8` |
| `super-resolution` | `js` · `webgpu` · `off` | `js` |
| `onnx-runtime-url` | URL | jsDelivr |
| `formats` | `qr_code` · `micro_qr_code` · `rm_qr_code`, separated by spaces or commas | all |
| `continuous` | flag | stop after the first result |
| `keep-camera` | flag | keep the camera on after a result; call `resume()` to scan again |
| `inline` | flag | fill the parent element instead of the screen |
| `manual` | flag | don't start by itself; call `start()` |
| `request-fullscreen` | flag | also enter browser full-screen mode |
| `no-auto-zoom` · `no-torch` · `no-gallery` · `no-close` · `no-beep` · `no-vibrate` | flags | turn a feature off |
| `no-candidates` | flag | hide the brackets drawn around a code that can't be read yet |

### Events

| event | `detail` | fires when |
| :--- | :--- | :--- |
| `ready` | – | the camera is running |
| `scan` | `ScanResult` | a code was read and accepted (camera or album) |
| `reject` | `{ result: ScanResult, message?: string }` | `accept` turned a code down; scanning continues |
| `error` | `ScanError` | the camera could not start |
| `close` | – | the user pressed ✕, or `close()` was called |
| `zoom` | `{ zoom, min, max, auto, digital }` | the zoom changed |

### Methods and properties

| member | description |
| :--- | :--- |
| `start(): Promise<void>` | start the camera (only needed with `manual`, or after `stop()`) |
| `stop()` | stop the camera |
| `close()` | stop, hide the element and fire `close`; `start()` opens it again |
| `resume()` | scan again after a result; reopens the camera if it was stopped |
| `pickImage()` | open the photo picker, e.g. from your own button |
| `toggleTorch(on?): Promise<boolean>` | switch the flashlight, e.g. from your own button |
| `accept` | an [`AcceptFn`](#the-accept-callback), or `undefined` |
| `labels` | `Partial<ScannerLabels>`: replace any built-in text |
| `active` | read-only: `true` while the camera is running |
| `scanner` | the underlying [`QRScanner`](#qrscanner-headless) while running, otherwise `null` |

Styling with themes, CSS variables, `::part()` and slots: [CUSTOMIZE.md](CUSTOMIZE.md).

---

## `QRScanner` (headless)

The camera, auto-zoom and decoding engine without any UI. You provide the `<video>` element and draw your own interface.

```ts
import { QRScanner } from 'k-qr-scanner';

const scanner = new QRScanner({ video: document.querySelector('video')! });
scanner.on('result', (r) => console.log(r.text));
await scanner.start();
```

### Options

| option | type | default | description |
| :--- | :--- | :--- | :--- |
| `video` | `HTMLVideoElement` | **required** | where the camera stream plays |
| `facingMode` | `'environment' \| 'user'` | `'environment'` | back or front camera |
| `deviceId` | `string` | – | a specific camera from `enumerateDevices()` |
| `autoZoom` | `boolean` | `true` | zoom in on small codes |
| `maxZoom` | `number` | `8` | zoom limit |
| `continuous` | `boolean` | `false` | keep scanning after a result; the same code is ignored for 1.5 s |
| `maxFrameSide` | `number` | `1920` | longest side of the analysed frame; lower is faster but reads less far |
| `hiRes` | `boolean` | `true` | ask for a 4K stream when the camera has no hardware zoom |
| `superResolution` | `'js' \| 'webgpu' \| false` | `'js'` | see [super-resolution](#super-resolution) |
| `onnxRuntimeUrl` | `string` | jsDelivr | ONNX Runtime Web for `'webgpu'` |
| `formats` | `QRFormat[]` | all | which QR-family symbols to read |
| `accept` | `AcceptFn` | – | see [the `accept` callback](#the-accept-callback) |

### Methods

| method | description |
| :--- | :--- |
| `start(): Promise<void>` | open the camera and start scanning |
| `stop()` | release the camera |
| `pause()` / `resume()` | pause or resume analysis while the camera stays on |
| `switchCamera()` | switch between the front and back camera |
| `setZoom(zoom, byUser = true)` | set the zoom; when `byUser`, auto-zoom waits a few seconds before taking over again |
| `setTorch(on): Promise<boolean>` | switch the flashlight; resolves `false` if the camera has none |
| `focusAt(x, y)` | focus on a point, in coordinates from 0 to 1 |
| `scanImage(image): Promise<ScanResult \| null>` | read a `Blob` or `ImageBitmap`; works without a camera. `null` if there is no code or `accept` turned it down |
| `setFormats(formats?)` / `setAccept(fn?)` | change `formats` or `accept` while running |
| `on(event, listener): () => void` | subscribe to an event; returns a function that unsubscribes |

Read-only properties: `zoom`, `zoomMin`, `zoomMax`, `canZoom`, `canTorch`, `isDigitalZoom` and `superResolutionBackend` (`'js'`, `'onnx-webgpu'`, `'onnx-wasm'` or `'off'`).

### Static members

| member | description |
| :--- | :--- |
| `QRScanner.preload()` | download and compile the engine now, so the first scan starts instantly |
| `QRScanner.isSupported()` | `true` if the browser can open a camera |
| `QRScanner.engineIdleTimeout` | how long the shared engine stays warm after the last scanner stops, in ms (default `30000`) |
| `QRScanner.dispose()` | shut the shared engine down now |

### Events

| event | payload |
| :--- | :--- |
| `result` | `ScanResult` |
| `reject` | `{ result: ScanResult, message?: string }` |
| `error` | `ScanError` |
| `hint` | `{ hint: QRHint \| null, decoded, videoWidth, videoHeight }`: where a code is, even before it can be read |
| `zoom` | `{ zoom, min, max, auto, digital }` |
| `dark` | `boolean`: whether the scene is too dark (a good moment to offer the flashlight) |

---

## The `accept` callback

`accept` runs for every decoded code, from the camera and from photos, before it becomes the result. It can be async; scanning waits for the answer.

| `accept` returns | what happens |
| :--- | :--- |
| `true`, or nothing | accepted: `scan` / `result` fires |
| `false` | ignored; scanning continues |
| a string | ignored; scanning continues and the scanner shows the string to the user |
| throws or rejects | treated as `false` |

A code that was turned down is not checked again while it stays in view. It is checked again once it has been out of view for 2 seconds, or after `resume()`.

```ts
el.accept = (r) => r.text.startsWith('000201') || 'Please scan a LaoQR payment code';
```

The same callback is available as the `accept` option of `scanQR()` and `QRScanner`, the `accept` property of the element, and the `accept` prop of every wrapper.

---

## Payment QR codes (EMV)

Most payment QR codes (LAO QR, PromptPay, VietQR, DuitNow, QRIS, SGQR, UnionPay and others) follow the EMVCo merchant-presented format: a list of numbered fields that ends with a CRC checksum. Three helpers read and check them; they are plain string code, work in the browser, in Node and in React Native, and are dropped by your bundler if you don't use them.

```ts
import { acceptEMV, parseEMV, emvCRC } from 'k-qr-scanner';   // also from 'k-qr-scanner/react-native'
```

### `acceptEMV(options?)`

Returns an [`accept` callback](#the-accept-callback) that lets through only intact EMV codes (the CRC must match) that meet your options. Anything else is turned down with `message`, and scanning continues.

```ts
const result = await scanQR({
  accept: acceptEMV({
    currency: 'LAK',                        // or '418'; an array for several
    country: 'LA',
    message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ',
    check: async (emv) => (await isKnownMerchant(emv)) || 'Unknown merchant', // optional, your own last check
  }),
});
const emv = parseEMV(result.text)!;
pay({ to: emv.merchantName, amount: emv.amount, currency: emv.currencyCode });
```

| option | type | description |
| :--- | :--- | :--- |
| `currency` | `string \| string[]` | allowed currencies, as letters (`'LAK'`) or numbers (`'418'`) |
| `country` | `string \| string[]` | allowed countries, e.g. `'LA'` |
| `accounts` | `string[]` | only codes that carry one of these account ids (the AID or unique id of tags 26–51, or the value of tags 02–25) |
| `dynamicOnly` | `boolean` | only dynamic codes, which are made for one payment |
| `message` | `string` | shown for any code that doesn't pass; default `'Not a payment QR code'` |
| `check` | `(emv, result) => AcceptVerdict \| Promise<…>` | your own last check, e.g. on your server |

### `parseEMV(text)`

Reads a payload into fields. Returns `null` when the text is not an EMV code or its structure is broken.

```ts
interface EMVQR {
  valid: boolean;                        // the CRC matches; treat false as damaged or altered
  initiation?: 'static' | 'dynamic';     // reusable sticker, or one payment
  accounts: { tag: string; id: string; fields: Record<string, string> }[];
  mcc?: string;                          // merchant category code
  currency?: string;                     // '418'
  currencyCode?: string;                 // 'LAK', for well-known currencies
  amount?: string;                       // as written, e.g. '15000'
  tip?: { indicator: string; fixed?: string; percent?: string };
  country?: string;                      // 'LA'
  merchantName?: string;
  merchantCity?: string;
  postalCode?: string;
  additional?: {                         // tag 62
    billNumber?: string; mobileNumber?: string; storeLabel?: string; loyaltyNumber?: string;
    referenceLabel?: string; customerLabel?: string; terminalLabel?: string; purpose?: string;
    fields: Record<string, string>;
  };
  language?: { preference?: string; merchantName?: string; merchantCity?: string }; // tag 64
  tags: Record<string, string>;          // every top-level field as written
}
```

### `emvCRC(data)`

The EMVCo checksum (CRC-16/CCITT-FALSE) as four hex digits, for building or checking payloads yourself.

---

## Types

```ts
interface ScanResult {
  text: string;
  bytes: Uint8Array;                   // raw payload
  format: QRFormat;
  version: string;                     // '1'…'40', 'M1'…'M4' or 'R13x27'…; '' if unknown
  ecLevel: string;                     // 'L' | 'M' | 'Q' | 'H'; '' if unknown
  corners: { x: number; y: number }[]; // top-left, top-right, bottom-right, bottom-left in video pixels; [] for photos
  zoom: number;                        // zoom level when the code was read
  timestamp: number;
  source: 'camera' | 'image';
}

/** QR Code (Model 1 and 2), Micro QR, rMQR. The constant QR_FORMATS lists all three. */
type QRFormat = 'qr_code' | 'micro_qr_code' | 'rm_qr_code';

type AcceptFn = (result: ScanResult) => boolean | string | void | Promise<boolean | string | void>;

class ScanError extends Error {
  code: 'permission-denied' | 'no-camera' | 'camera-busy' | 'insecure-context' | 'unsupported' | 'unknown';
}

/** Where a code is in the video, in pixels. `module` is the size of one QR module. */
interface QRHint { cx: number; cy: number; size: number; module: number; full: boolean }
```

Other exports from `k-qr-scanner`: `parseEMV`, `acceptEMV` and `emvCRC` ([payment QR codes](#payment-qr-codes-emv)), `KQRScannerElement` and `defineScannerElement()` (the element class and its registration), `TAG_NAME` (`'kqr-scanner'`), `LABELS` (the built-in texts), `THEME_VARS` (the CSS variable names) and `QR_FORMATS`.

---

## Framework wrappers

| import | export | notes |
| :--- | :--- | :--- |
| `k-qr-scanner/react` | `<QRScanner>` | attributes as camelCase props, plus `onScan`, `onReject`, `onError`, `onClose`, `onReady`; children with `slot="…"` go into the UI; ships with `'use client'` |
| `k-qr-scanner/vue` | `<QRScanner>` | the same props; emits `scan`, `reject`, `error`, `close`, `ready`; the default slot goes into the UI |
| `k-qr-scanner/svelte` | `use:qrScanner={options}` | an action; children with `data-slot="…"` go into the UI |
| `k-qr-scanner/react-native` | `<QRScanner>` | iOS, Android and Expo; see [REACT_NATIVE.md](REACT_NATIVE.md) |

Examples for every framework: [FRAMEWORKS.md](FRAMEWORKS.md).

---

## Super-resolution

Small or blurry codes that still fail to decode get one more try: the region is upscaled by WeChat's super-resolution network, then decoded again.

| `superResolution` | how it runs | cost |
| :--- | :--- | :--- |
| `'js'` (default) | a built-in kernel inside the worker | no download; slower, so it is used on small regions only |
| `'webgpu'` | ONNX Runtime Web on WebGPU, falling back to its WebAssembly backend, then to `'js'` | loads ONNX Runtime Web from `onnxRuntimeUrl` |
| `'off'` | – | – |

## `k-qr-scanner/sr`

The super-resolution model on its own, for your own image pipelines: `superResolve(gray, height, width)`, `createOnnxSuperRes(ort, providers)` and `srModelBytes()`. The ONNX file is also available as `k-qr-scanner/models/wechat_sr.onnx`.

---

## CLI

```bash
npx k-qr-scanner init      # install and write a starter component
npx k-qr-scanner doctor    # check the project setup
```

`init` detects the framework (Next.js, Nuxt, SvelteKit, Svelte, Angular, Vue, React Native / Expo, React or plain JavaScript) and the package manager (npm, pnpm, yarn or bun), installs the package and writes a scanner component. For React Native it also installs `react-native-webview` and adds the camera permissions; in a Capacitor project it adds them to the native iOS and Android projects.

| option | description |
| :--- | :--- |
| `--framework <name>` | skip detection: `next`, `nuxt`, `sveltekit`, `svelte`, `angular`, `vue`, `react-native`, `react` or `vanilla` |
| `--pm <name>` | skip detection: `npm`, `pnpm`, `yarn` or `bun` |
| `--theme <name>` | theme for the component (default `wechat`) |
| `--locale <code>` | language for the component (default `en`) |
| `--out <path>` | where to write the component |
| `--from <spec>` | install a specific version, tag or tarball |
| `--no-install` | don't install packages; still write the component and permissions |
| `--force` | overwrite an existing component |
| `--dry-run` | show what would happen without changing anything |
| `--cwd <dir>` | the project directory |

`doctor` checks the Node version, the installation, framework-specific setup (React Native: the WebView package and both camera permissions) and any Content-Security-Policy in your HTML that would block the engine.
