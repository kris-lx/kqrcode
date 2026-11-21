# React Native

`k-qr-scanner/react-native` gives iOS and Android apps, Expo included, the same scanner as the web: themes, auto-zoom, Micro QR and rMQR, the `accept` callback and album import.

## How it works

React Native has no DOM and no camera API in JavaScript, and Hermes cannot run WebAssembly. So the component renders a [`react-native-webview`](https://github.com/react-native-webview/react-native-webview) that runs the regular `<kqr-scanner>`. Events and the `accept` callback cross the bridge for you.

The engine is bundled with the component (about 0.8 MB raw, 0.5 MB gzip), so the scanner works offline and needs no asset setup.

## Install

```bash
npx k-qr-scanner init
```

That one command detects React Native or Expo and does the whole setup:

- installs `k-qr-scanner` and `react-native-webview` (`npx expo install` on Expo, so the version matches your SDK);
- writes the camera permission entries (see below);
- writes a starter `components/QrScanner`.

Then run `cd ios && pod install` (bare React Native) and rebuild the app. Expo Go works without a rebuild.

By hand: `npm install k-qr-scanner react-native-webview`, then add the permission entries yourself.

## Camera permission

Two entries are needed, and `npx k-qr-scanner init` writes them:

| app | what is added |
|---|---|
| Expo | `"plugins": ["k-qr-scanner"]` in `app.json`. The plugin adds both entries on `expo prebuild` / EAS Build. |
| bare iOS | `NSCameraUsageDescription` in `ios/<App>/Info.plist`. Without it, iOS ends the app when the camera opens. |
| bare Android | `<uses-permission android:name="android.permission.CAMERA" />` in `android/app/src/main/AndroidManifest.xml` |

To set your own iOS prompt text with Expo: `"plugins": [["k-qr-scanner", { "cameraPermission": "Scan QR codes to pay" }]]`.

There is no permission code to write. On Android the component asks for the runtime permission before it opens the WebView. iOS asks by itself when the camera starts, and only once (`mediaCapturePermissionGrantType` skips the second, web-level prompt). If the user says no, the scanner shows its "camera blocked" screen and `onError` gets `permission-denied`.

`npx k-qr-scanner doctor` checks the WebView dependency and both permission entries.

## Usage

```tsx
import { useRef, useState } from 'react';
import { Button, Modal } from 'react-native';
import { QRScanner, type QRScannerHandle } from 'k-qr-scanner/react-native';

export function PayScreen() {
  const [open, setOpen] = useState(false);
  const scanner = useRef<QRScannerHandle>(null);
  return (
    <>
      <Button title="Scan to pay" onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
        <QRScanner
          ref={scanner}
          style={{ flex: 1 }}
          theme="wechat"
          locale="lo"
          heading="ສະແກນເພື່ອຈ່າຍ"
          cssVars={{ '--kqr-accent': '#e60012' }}
          accept={async (r) => r.text.startsWith('000201') || 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ'}
          onScan={(r) => { setOpen(false); pay(r.text); }}
          onClose={() => setOpen(false)}
          onError={(e) => console.warn(e.code)}
          slots={{ 'actions-left': '<button data-kqr-id="mine">My QR</button>' }}
          onSlotPress={(slot, id) => id === 'mine' && showMyCode()}
        />
      </Modal>
    </>
  );
}
```

## Props

Every prop of the web wrapper works the same way: `theme`, `locale`, `heading`, `labels`, `facing`, `continuous`, `success`, `torch`, `zoomControl`, `maxZoom`, `superResolution`, `formats`, `accept`, `noAutoZoom`, `noGallery`, `noTorch`, `noBeep`, `noVibrate` and `noClose`, plus these:

| prop | type | |
|---|---|---|
| `onScan` / `onReject` / `onError` / `onClose` / `onReady` | callbacks | as on the web; `result.bytes` is a `Uint8Array` |
| `keepCamera` | `boolean` | keep the camera on after a result; call `resume()` to scan again |
| `cssVars` | `Record<string, string>` | CSS variables for the scanner UI (`--kqr-accent`, …) |
| `slots` | `Record<string, string>` | extra UI as **HTML strings**; React Native views cannot go inside a WebView |
| `onSlotPress` | `(slot, id?) => void` | a tap inside `slots`; `id` is the tapped element's `data-kqr-id` |
| `scriptUrl` | `string` | load `kqrcode.global.js` from a URL instead of the bundled copy |
| `style` | `StyleProp<ViewStyle>` | style of the WebView; default `{ flex: 1, backgroundColor: '#000' }` |
| `webViewProps` | `WebViewProps` | passed through to `react-native-webview` |

Changing a prop other than a callback reloads the page and restarts the camera. Callbacks (`onScan`, `accept`, …) can change freely.

## Built in

The defaults are tuned, so most apps need no `webViewProps`:

- **Camera:** 1080p, raised to 4K where the phone needs digital zoom. Continuous autofocus, tap to focus, and hardware zoom and torch where the WebView exposes them.
- **Background:** the camera is released while the app is in the background, so the privacy indicator turns off and other apps can use the camera. It reopens when the app comes back. If a result is showing, it waits for `resume()`.
- **Recovery:** if the OS kills the WebView process under memory pressure, the scanner reloads instead of leaving a black screen.
- **Surface:** full-bleed (the page lays itself out around the notch), no scrolling, bouncing, zoom gestures, link previews or text selection.
- **Debugging:** in development builds, inspect the page from Safari (iOS) or `chrome://inspect` (Android).

### Ref methods

`resume()` (reopens the camera if it was stopped), `start()`, `stop()`, `close()`, `toggleTorch(on?)`, `pickImage()`.

## Loading from a URL

```tsx
<QRScanner scriptUrl="https://cdn.jsdelivr.net/npm/k-qr-scanner@0.1.0/dist/kqrcode.global.js" … />
```

`kqrcode.engine.js` must sit next to it, as it does on jsDelivr and unpkg. Pin the version. This needs network, and the bundled copy stays in your app either way.

## Platform notes

- **iOS 14.5+** (WKWebView camera support). There is no camera zoom API in WKWebView, so zoom is digital on a 4K stream, as in Safari. iOS 15+ skips the second, web-level camera prompt.
- **Android 7+** with an up-to-date Android System WebView. Hardware zoom and the torch work where the device exposes them to the WebView.
- The page is served from `https://kqrcode.local/`, which makes it a secure context so the camera is allowed. Nothing is fetched from that address.
- `superResolution: 'webgpu'` downloads ONNX Runtime Web from a CDN. The default `'js'` works offline.
- With iOS Lockdown Mode, WebAssembly is disabled. The scanner then falls back to jsQR, which reads plain QR codes only.
