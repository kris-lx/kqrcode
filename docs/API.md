# API reference

- [`scanQR(options)`](#scanqroptions)
- [`<kqr-scanner>` element](#kqr-scanner-element)
- [`QRScanner` (headless)](#qrscanner-headless)
- [Types](#types)
- [Framework wrappers](#framework-wrappers)
- [`k-qr-scanner/sr`](#k-qr-scannersr)

---

## `scanQR(options)`

```ts
import { scanQR } from 'k-qr-scanner';
function scanQR(options?: ScanQROptions): Promise<ScanResult>;
```

Opens the full-screen scanner, resolves with the first result and removes the element afterwards. It rejects in two ways:

- `ScanError` for camera problems. The element stays visible so the user can read the message.
- `DOMException` named `AbortError` when the user closes the scanner or `signal` aborts.

| option | type | default | |
|---|---|---|---|
| `theme` | `'wechat' \| 'alipay' \| 'grid' \| 'frame' \| 'none'` | `'wechat'` | look |
| `locale` | `string` | browser language | `en`, `lo`, `zh` built in |
| `heading` | `string` | – | text in the top bar |
| `labels` | `Partial<ScannerLabels>` | – | override any text |
| `facing` | `'environment' \| 'user'` | `'environment'` | camera |
| `success` | `'dot' \| 'box' \| 'none'` | `'dot'` | found-it marker |
| `torch` | `'auto' \| 'always' \| 'never'` | `'auto'` | flashlight button (auto = when dark) |
| `zoomControl` | `'slider' \| 'none'` | `'none'` | zoom slider |
| `gallery` / `beep` / `vibrate` / `autoZoom` | `boolean` | `true` | |
| `maxZoom` | `number` | `8` | |
| `superResolution` | `'js' \| 'webgpu' \| 'off'` | `'js'` | see [super-resolution](#super-resolution) |
| `onnxRuntimeUrl` | `string` | jsDelivr | ONNX Runtime Web URL for `'webgpu'` |
| `style` | `Record<string, string>` | – | CSS variables, e.g. `{ '--kqr-accent': '#e60012' }` |
| `slots` | `Record<string, Node \| string>` | – | extra UI, e.g. `{ footer: tabsElement }` |
| `container` | `HTMLElement` | `document.body` | where to mount |
| `inline` | `boolean` | `false` | fill the container instead of the screen |
| `signal` | `AbortSignal` | – | cancel programmatically |
| `formats` | `QRFormat[]` | all | `'qr_code'`, `'micro_qr_code'`, `'rm_qr_code'` |
| `accept` | `(r: ScanResult) => boolean \| string \| void \| Promise<…>` | – | see [accept](#accept-callback) |
| `onReject` | `(r: ScanResult, message?: string) => void` | – | a code was turned down by `accept` |

---

## `<kqr-scanner>` element

Importing `k-qr-scanner` (or any wrapper) registers the element. Registration is skipped on the server.

### Attributes

| attribute | values | default |
|---|---|---|
| `theme` | `wechat` · `alipay` · `grid` · `frame` · `none` | `wechat` |
| `locale` | `en` · `lo` · `zh` · … | browser language |
| `heading` | text | – |
| `facing` | `environment` · `user` | `environment` |
| `continuous` | boolean | off: stops after the first result |
| `inline` | boolean | off: full screen |
| `success` | `dot` · `box` · `none` | `dot` |
| `torch` | `auto` · `always` · `never` | `auto` |
| `zoom-control` | `slider` · `none` | `none` |
| `max-zoom` | number | `8` |
| `super-resolution` | `js` · `webgpu` · `off` | `js` |
| `onnx-runtime-url` | URL | jsDelivr |
| `formats` | `qr_code` · `micro_qr_code` · `rm_qr_code` (space or comma separated) | all |
| `no-auto-zoom`, `no-close`, `no-gallery`, `no-beep`, `no-vibrate`, `no-candidates` | boolean | off |
| `keep-camera` | boolean | keep the camera running after a result |
| `manual` | boolean | don't start automatically; call `start()` |
| `request-fullscreen` | boolean | also enter browser fullscreen |

### Events

| event | `detail` | when |
|---|---|---|
| `scan` | `ScanResult` | a code was read and accepted (also from the album) |
| `reject` | `{ result: ScanResult, message?: string }` | `accept` turned a code down; scanning continues |
| `error` | `ScanError` | the camera could not start |
| `close` | – | the user pressed ✕ (or `close()` was called) |
| `ready` | – | the camera is running |
| `zoom` | `{ zoom, min, max, auto, digital }` | zoom changed |

### Methods and properties

| | |
|---|---|
| `start(): Promise<void>` | start the camera (automatic unless `manual`) |
| `stop()` | stop the camera |
| `close()` | stop, hide and fire `close` |
| `resume()` | scan again after a result; reopens the camera if it was already stopped |
| `active` | `boolean`, read-only: the camera is running |
| `pickImage()` | open the photo picker, for your own slotted button |
| `toggleTorch(on?)` | flashlight, for your own slotted button |
| `labels` | `Partial<ScannerLabels>` text overrides |
| `accept` | `AcceptFn \| undefined`: check each code before `scan` fires (see [accept](#accept-callback)) |
| `scanner` | the underlying `QRScanner` instance while running |

Styling (themes, CSS variables, `::part()`, slots): [CUSTOMIZE.md](CUSTOMIZE.md).

---

## `QRScanner` (headless)

Bring your own `<video>` and UI.

```ts
import { QRScanner } from 'k-qr-scanner';

const scanner = new QRScanner({ video: document.querySelector('video')! });
scanner.on('result', (r) => console.log(r.text));
await scanner.start();
```

### Options

| option | type | default | |
|---|---|---|---|
| `video` | `HTMLVideoElement` | **required** | |
| `facingMode` | `'environment' \| 'user'` | `'environment'` | |
| `deviceId` | `string` | – | a specific camera |
| `autoZoom` | `boolean` | `true` | zoom in on small codes |
| `maxZoom` | `number` | `8` | |
| `continuous` | `boolean` | `false` | keep scanning after a result |
| `maxFrameSide` | `number` | `1920` | analysed frame size; lower is faster but shorter range |
| `hiRes` | `boolean` | `true` | request 4K when there is no hardware zoom |
| `superResolution` | `'js' \| 'webgpu' \| false` | `'js'` | |
| `onnxRuntimeUrl` | `string` | jsDelivr | |
| `formats` | `QRFormat[]` | all | QR-family members to read |
| `accept` | `AcceptFn` | – | see [accept](#accept-callback) |

### Methods

| | |
|---|---|
| `start()` / `stop()` | camera on / off (stop releases the camera and the worker) |
| `pause()` / `resume()` | pause analysis without releasing the camera |
| `switchCamera()` | toggle front/back camera |
| `setZoom(z, byUser = true)` | zoom; pauses auto-zoom for a few seconds when `byUser` |
| `setTorch(on): Promise<boolean>` | flashlight |
| `focusAt(x, y)` | tap-to-focus, normalised 0–1 coordinates |
| `scanImage(blobOrBitmap): Promise<ScanResult \| null>` | decode a photo; works without a camera. `null` also when `accept` turned it down |
| `setFormats(formats?)` / `setAccept(fn?)` | change `formats` / `accept` while running |
| `on(event, fn): () => void` | subscribe; returns an unsubscribe function |
| `QRScanner.preload()` | download and compile the decoder now, so the first scan starts instantly |
| `QRScanner.dispose()` | free the shared decoding worker immediately (otherwise freed after `engineIdleTimeout`) |
| `QRScanner.engineIdleTimeout` | ms the shared worker stays warm after the last scanner stops (default `30000`) |
| `QRScanner.isSupported()` | `getUserMedia` available |

Read-only: `zoom`, `zoomMin`, `zoomMax`, `canZoom`, `canTorch`, `isDigitalZoom`, `superResolutionBackend`.

### Events

| event | payload |
|---|---|
| `result` | `ScanResult` |
| `error` | `ScanError` |
| `hint` | `{ hint: QRHint \| null, decoded, videoWidth, videoHeight }`: where a code is, even before it can be read |
| `zoom` | `{ zoom, min, max, auto, digital }` |
| `dark` | `boolean`: the scene is too dark |
| `reject` | `{ result: ScanResult, message?: string }`: `accept` turned a code down |

### `accept` callback

Runs for every decoded code before it becomes the result (camera and photos). It may be async; the scanner waits for it.

| returns | effect |
|---|---|
| `true` or nothing | accepted: `result` / `scan` fires |
| `false` | ignored; scanning continues |
| a string | ignored; scanning continues and the element shows the string in the hint area |
| throws / rejects | same as `false` |

A turned-down code is not offered again while it stays in view; it is re-checked once it has been gone for 2 seconds, or after `resume()`.

```ts
el.accept = (r) => r.format === 'qr_code' && r.text.startsWith('000201') || 'Please scan a LaoQR payment code';
```

---

## Types

```ts
interface ScanResult {
  text: string;
  bytes: Uint8Array;
  corners: { x: number; y: number }[]; // TL, TR, BR, BL in video pixels; [] for photos
  format: QRFormat;
  version: string; // '1'…'40', 'M1'…'M4', 'R13x27'…; '' when unknown
  ecLevel: string; // 'L' | 'M' | 'Q' | 'H'; '' when unknown
  zoom: number;
  timestamp: number;
  source: 'camera' | 'image';
}

class ScanError extends Error {
  code: 'insecure-context' | 'unsupported' | 'permission-denied' | 'no-camera' | 'camera-busy' | 'unknown';
}

interface QRHint { cx: number; cy: number; size: number; module: number; full: boolean }

/** QR Code (Model 1/2) · Micro QR · rMQR. `QR_FORMATS` lists all three. */
type QRFormat = 'qr_code' | 'micro_qr_code' | 'rm_qr_code';

type AcceptFn = (r: ScanResult) => boolean | string | void | Promise<boolean | string | void>;
```

---

## Framework wrappers

| import | export | notes |
|---|---|---|
| `k-qr-scanner/react` | `<QRScanner>` | props = attributes in camelCase plus `onScan`, `onError`, `onClose`, `onReady`; children are slotted; ships with `'use client'` |
| `k-qr-scanner/vue` | `<QRScanner>` | props in camelCase; emits `scan`, `error`, `close`, `ready`; default slot is passed through |
| `k-qr-scanner/svelte` | `use:qrScanner={options}` | action; children with `data-slot="…"` are slotted |
| `k-qr-scanner/react-native` | `<QRScanner>` | iOS / Android / Expo via `react-native-webview`; same props plus `cssVars`, `slots` (HTML strings), `onSlotPress`, `keepCamera`, `scriptUrl`, `webViewProps`; see [REACT_NATIVE.md](REACT_NATIVE.md) |

Examples for each framework: [FRAMEWORKS.md](FRAMEWORKS.md).

---

## Super-resolution

Small or blurry codes that still fail are upscaled with WeChat's super-resolution CNN before a final decode attempt.

| `superResolution` | backend | cost |
|---|---|---|
| `'js'` (default) | built-in kernel in the worker | no download; slower, so it is used only on small regions |
| `'webgpu'` | ONNX Runtime Web: WebGPU, falling back to WASM, then to `'js'` | loads ONNX Runtime from `onnxRuntimeUrl` |
| `'off'` | – | – |

## `k-qr-scanner/sr`

The model on its own, for your own pipelines: `superResolve(gray, h, w)`, `createOnnxSuperRes(ort, providers)` and `srModelBytes()`. The ONNX file is also published as `k-qr-scanner/models/wechat_sr.onnx`.
