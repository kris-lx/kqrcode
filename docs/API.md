# API reference

- [`scanQR(options)`](#scanqroptions)
- [`<kqr-scanner>` element](#kqr-scanner-element)
- [`QRScanner` (headless)](#qrscanner-headless)
- [Types](#types)
- [Framework wrappers](#framework-wrappers)
- [`kqrcode/sr`](#kqrcodesr)

---

## `scanQR(options)`

```ts
import { scanQR } from 'kqrcode';
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

---

## `<kqr-scanner>` element

Importing `kqrcode` (or any wrapper) registers the element. Registration is skipped on the server.

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
| `no-auto-zoom`, `no-close`, `no-gallery`, `no-beep`, `no-vibrate`, `no-candidates` | boolean | off |
| `keep-camera` | boolean | keep the camera running after a result |
| `manual` | boolean | don't start automatically; call `start()` |
| `request-fullscreen` | boolean | also enter browser fullscreen |

### Events

| event | `detail` | when |
|---|---|---|
| `scan` | `ScanResult` | a code was read (also from the album) |
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
| `resume()` | scan again after a result (with `keep-camera` or `continuous`) |
| `pickImage()` | open the photo picker, for your own slotted button |
| `toggleTorch(on?)` | flashlight, for your own slotted button |
| `labels` | `Partial<ScannerLabels>` text overrides |
| `scanner` | the underlying `QRScanner` instance while running |

Styling (themes, CSS variables, `::part()`, slots): [CUSTOMIZE.md](CUSTOMIZE.md).

---

## `QRScanner` (headless)

Bring your own `<video>` and UI.

```ts
import { QRScanner } from 'kqrcode';

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

### Methods

| | |
|---|---|
| `start()` / `stop()` | camera on / off (stop releases the camera and the worker) |
| `pause()` / `resume()` | pause analysis without releasing the camera |
| `switchCamera()` | toggle front/back camera |
| `setZoom(z, byUser = true)` | zoom; pauses auto-zoom for a few seconds when `byUser` |
| `setTorch(on): Promise<boolean>` | flashlight |
| `focusAt(x, y)` | tap-to-focus, normalised 0–1 coordinates |
| `scanImage(blobOrBitmap): Promise<ScanResult \| null>` | decode a photo; works without a camera |
| `on(event, fn): () => void` | subscribe; returns an unsubscribe function |
| `QRScanner.preload()` | start downloading the decoder |
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

---

## Types

```ts
interface ScanResult {
  text: string;
  bytes: Uint8Array;
  corners: { x: number; y: number }[]; // TL, TR, BR, BL in video pixels; [] for photos
  format: 'qr_code';
  zoom: number;
  timestamp: number;
  source: 'camera' | 'image';
}

class ScanError extends Error {
  code: 'insecure-context' | 'unsupported' | 'permission-denied' | 'no-camera' | 'camera-busy' | 'unknown';
}

interface QRHint { cx: number; cy: number; size: number; module: number; full: boolean }
```

---

## Framework wrappers

| import | export | notes |
|---|---|---|
| `kqrcode/react` | `<QRScanner>` | props = attributes in camelCase plus `onScan`, `onError`, `onClose`, `onReady`; children are slotted; ships with `'use client'` |
| `kqrcode/vue` | `<QRScanner>` | props in camelCase; emits `scan`, `error`, `close`, `ready`; default slot is passed through |
| `kqrcode/svelte` | `use:qrScanner={options}` | action; children with `data-slot="…"` are slotted |

Examples for each framework: [FRAMEWORKS.md](FRAMEWORKS.md).

---

## Super-resolution

Small or blurry codes that still fail are upscaled with WeChat's super-resolution CNN before a final decode attempt.

| `superResolution` | backend | cost |
|---|---|---|
| `'js'` (default) | built-in kernel in the worker | no download; slower, so it is used only on small regions |
| `'webgpu'` | ONNX Runtime Web: WebGPU, falling back to WASM, then to `'js'` | loads ONNX Runtime from `onnxRuntimeUrl` |
| `'off'` | – | – |

## `kqrcode/sr`

The model on its own, for your own pipelines: `superResolve(gray, h, w)`, `createOnnxSuperRes(ort, providers)` and `srModelBytes()`. The ONNX file is also published as `kqrcode/models/wechat_sr.onnx`.
