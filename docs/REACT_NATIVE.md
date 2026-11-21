# React Native

`k-qr-scanner/react-native` brings the same scanner to iOS and Android apps, Expo included: the themes, auto-zoom, Micro QR and rMQR, the `accept` callback and album import.

- [Setup](#setup)
- [Usage](#usage)
- [Props](#props)
- [Ref methods](#ref-methods)
- [What the component handles for you](#what-the-component-handles-for-you)
- [Platform notes](#platform-notes)
- [Troubleshooting](#troubleshooting)

## How it works

React Native has no DOM and no camera API in JavaScript, and Hermes cannot run WebAssembly. So the component renders a [`react-native-webview`](https://github.com/react-native-webview/react-native-webview) and runs the regular web scanner inside it. Events and the `accept` callback cross between the WebView and your app automatically.

The engine is bundled with the component, about 0.8 MB (0.5 MB gzip). The scanner works offline, and there are no assets to configure.

## Setup

```bash
npx k-qr-scanner init
```

In a React Native or Expo project, this one command:

1. installs `k-qr-scanner` and `react-native-webview` (on Expo through `npx expo install`, so the WebView matches your SDK);
2. adds the camera permissions (see below);
3. writes a starter component, `components/QrScanner`.

Then:

- **bare React Native**: run `cd ios && pod install` and rebuild the app;
- **Expo Go**: nothing to do, it already includes the WebView and the camera permission;
- **Expo development or EAS builds**: the next `npx expo prebuild` or EAS build applies the permissions.

### Camera permissions

| project | what `init` adds |
| :--- | :--- |
| Expo | `"plugins": ["k-qr-scanner"]` in `app.json`. The plugin writes both entries during prebuild. |
| bare iOS | `NSCameraUsageDescription` in `ios/<App>/Info.plist` |
| bare Android | `<uses-permission android:name="android.permission.CAMERA" />` in `android/app/src/main/AndroidManifest.xml` |

> [!IMPORTANT]
> Without `NSCameraUsageDescription`, iOS ends the app the moment the camera opens.

To set your own iOS permission text with Expo:

```json
{ "expo": { "plugins": [["k-qr-scanner", { "cameraPermission": "Scan QR codes to pay" }]] } }
```

You don't need to write any permission code. On Android the component asks for the camera before it opens the scanner; on iOS the system asks once when the camera starts.

`npx k-qr-scanner doctor` checks that the WebView is installed and that both permissions are in place.

### Setting up by hand

```bash
npm install k-qr-scanner react-native-webview
cd ios && pod install
```

Then add the two permission entries from the table above.

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
          slots={{ 'actions-left': '<button data-kqr-id="my-code">My QR code</button>' }}
          onSlotPress={(slot, id) => { if (id === 'my-code') showMyCode(); }}
        />
      </Modal>
    </>
  );
}
```

Mount the component to open the scanner and unmount it to close.

## Props

These work exactly as on the web (see [API.md](API.md#scanqr)): `theme`, `locale`, `heading`, `labels`, `facing`, `continuous`, `success`, `torch`, `zoomControl`, `maxZoom`, `superResolution`, `formats`, `accept`, `noAutoZoom`, `noGallery`, `noTorch`, `noBeep`, `noVibrate` and `noClose`.

Callbacks:

| prop | called with | when |
| :--- | :--- | :--- |
| `onScan` | `ScanResult` | a code was read and accepted; `result.bytes` is a `Uint8Array` |
| `onReject` | `ScanResult`, `message?` | `accept` turned a code down |
| `onError` | `ScanError` | the camera could not start, e.g. `permission-denied` |
| `onClose` | – | the user pressed ✕ |
| `onReady` | – | the camera is running |
| `onSlotPress` | `slot`, `id?` | something inside `slots` was tapped; `id` is the `data-kqr-id` of the tapped element |

Only for React Native:

| prop | type | description |
| :--- | :--- | :--- |
| `keepCamera` | `boolean` | keep the camera on after a result; call `resume()` to scan again |
| `cssVars` | `Record<string, string>` | [CSS variables](CUSTOMIZE.md#css-variables) for the scanner UI |
| `slots` | `Record<string, string>` | extra UI as **HTML strings** by [slot name](CUSTOMIZE.md#slots); React Native views can't be placed inside a WebView |
| `scriptUrl` | `string` | load the scanner from a URL instead of the bundled copy |
| `style` | `StyleProp<ViewStyle>` | style of the scanner view; default `{ flex: 1, backgroundColor: '#000' }` |
| `webViewProps` | `WebViewProps` | extra props for `react-native-webview` |

Changing a callback is free. Changing any other prop reloads the scanner and restarts the camera, so keep them stable while the scanner is open.

## Ref methods

| method | description |
| :--- | :--- |
| `resume()` | scan again after a result; reopens the camera if it was stopped |
| `start()` / `stop()` | open or release the camera |
| `close()` | stop the camera and fire `onClose` |
| `toggleTorch(on?)` | switch the flashlight |
| `pickImage()` | open the photo picker |

## What the component handles for you

The defaults are tuned for scanning, so most apps never need `webViewProps`:

- **Permissions.** On Android it requests the camera permission before showing the scanner. On iOS it skips the second, web-level prompt, so the user is asked only once.
- **Camera quality.** The stream starts at 1080p and goes up to 4K where the phone has no hardware zoom. Continuous autofocus, tap to focus, and hardware zoom and flashlight wherever the WebView offers them.
- **Background.** While the app is in the background, the camera is released, so the camera indicator turns off and other apps can use the camera. It reopens when the app returns, unless a result is showing; then `resume()` reopens it.
- **Recovery.** If the system kills the WebView process to free memory, the scanner reloads instead of leaving a black screen.
- **A native feel.** Full screen, laid out around the notch, with no scrolling, bouncing, zoom gestures, link previews or text selection.
- **Debugging.** In development builds, inspect the scanner page with Safari (iOS) or `chrome://inspect` (Android).

## Loading the scanner from a URL

```tsx
<QRScanner scriptUrl="https://cdn.jsdelivr.net/npm/k-qr-scanner@0.2.0/dist/kqrcode.global.js" />
```

This loads that version instead of the bundled one, which is useful to try a fix without an app update. `kqrcode.engine.js` must be in the same directory (it is on jsDelivr and unpkg), the phone needs network access, and the bundled copy stays in your app either way. Always pin a version.

## Platform notes

| platform | notes |
| :--- | :--- |
| iOS 14.5+ | WKWebView has no camera zoom API, so zoom is digital, on a 4K stream as in Safari |
| Android 7+ | needs an up-to-date Android System WebView; hardware zoom and the flashlight work where the device offers them |
| Expo Go | works as is |

- The scanner page has the address `https://kqrcode.local/`. A secure (`https`) address is what allows the camera; nothing is ever loaded from it.
- `superResolution="webgpu"` downloads ONNX Runtime Web from a CDN. The default, `'js'`, works offline.
- With iOS Lockdown Mode, WebAssembly is turned off. The scanner then falls back to jsQR, which reads regular QR codes only.

## Troubleshooting

| problem | fix |
| :--- | :--- |
| the iOS app closes when the scanner opens | `NSCameraUsageDescription` is missing: run `npx k-qr-scanner init --no-install`, or add `"plugins": ["k-qr-scanner"]` on Expo, then rebuild |
| `onError` with `permission-denied` | the user said no. On Android the system won't ask again after a second "no", so link to the app settings with `Linking.openSettings()` |
| "Unable to resolve module react-native-webview" | install it (`npx expo install react-native-webview` on Expo), then rebuild or restart Metro |
| a black screen and nothing happens | check `onError`, and look at the page in Safari or `chrome://inspect` in a development build |
| Expo: the permission doesn't apply | the plugin runs during prebuild, so run `npx expo prebuild` or a new EAS build after adding it |
