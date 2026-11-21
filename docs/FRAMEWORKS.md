# Frameworks

The quickest start in any project is:

```bash
npx k-qr-scanner init
```

It detects the framework and writes a component like the ones below.

The scanner is a standard custom element, `<kqr-scanner>`, so it works anywhere the DOM does. React, Vue and Svelte get small wrappers on top of it, and React Native gets its own component. Every entry point can be imported during server-side rendering: the element only activates in the browser.

- [React](#react)
- [Next.js](#nextjs)
- [Vue](#vue)
- [Nuxt](#nuxt)
- [Svelte and SvelteKit](#svelte-and-sveltekit)
- [Angular](#angular)
- [React Native and Expo](#react-native-and-expo)
- [Plain HTML](#plain-html)
- [Content-Security-Policy](#content-security-policy)

## Names across frameworks

Attributes become camelCase props in the wrappers:

| `<kqr-scanner>` attribute | React / Vue / Svelte | default |
| :--- | :--- | :--- |
| `theme` | `theme` | `wechat` |
| `locale` | `locale` | browser language |
| `heading` | `heading` | – |
| `facing` | `facing` | `environment` |
| `continuous` | `continuous` | off: stop after the first code |
| `inline` | `inline` | off: full screen |
| `success`, `torch` | `success`, `torch` | `dot`, `auto` |
| `zoom-control` | `zoomControl` | `none` |
| `layout` | `layout` | `default` (`bar`: bottom-bar layout) |
| `max-zoom` | `maxZoom` | `8` |
| `super-resolution` | `superResolution` | `js` |
| `formats` | `formats` (an array) | all |
| `no-auto-zoom`, `no-gallery`, `no-torch`, `no-beep`, `no-vibrate`, `no-close` | `noAutoZoom`, `noGallery`, `noTorch`, `noBeep`, `noVibrate`, `noClose` | off |
| property `accept` | `accept` | – |
| property `labels` | `labels` | – |

| element event | React / Svelte | Vue |
| :--- | :--- | :--- |
| `scan` | `onScan(result)` | `@scan` |
| `reject` | `onReject(result, message?)` | `@reject` |
| `error` | `onError(error)` | `@error` |
| `close` | `onClose()` | `@close` |
| `ready` | `onReady()` | `@ready` |

Svelte has no `noClose`; use the `<kqr-scanner>` tag with `no-close` instead. Every option is described in [API.md](API.md).

## React

```tsx
import { useState } from 'react';
import { QRScanner } from 'k-qr-scanner/react';
import { acceptEMV, parseEMV } from 'k-qr-scanner';

// only intact LAO QR payment codes count; anything else shows the message and scanning goes on
const lakOnly = acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' });

export function PayButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Scan to pay</button>
      {open && (
        <QRScanner
          theme="frame"
          layout="bar"
          locale="lo"
          style={{ '--kqr-accent': '#e60012' }}
          accept={lakOnly}
          onScan={(r) => {
            setOpen(false);
            const emv = parseEMV(r.text)!;
            pay({ to: emv.merchantName, amount: emv.amount, currency: emv.currencyCode });
          }}
          onClose={() => setOpen(false)}
          onError={(e) => console.warn(e.code)}
        >
          <div slot="banner">ຮອງຮັບຄິວອາ / Support QR</div>
          <button slot="actions-right" onClick={showMyCode}>My QR</button>
        </QRScanner>
      )}
    </>
  );
}
```

Mount the component to open the scanner and unmount it to close. Children with `slot="…"` go into the scanner UI ([slots](CUSTOMIZE.md#slots)). Callbacks always see your latest props, so they can use the current state.

## Next.js

The React wrapper ships with `'use client'`, so you can use it straight from a server component file. To download the engine only on the page that scans, load it lazily:

```tsx
// app/scan/page.tsx
import dynamic from 'next/dynamic';

const QRScanner = dynamic(() => import('k-qr-scanner/react').then((m) => m.QRScanner), { ssr: false });

export default function Page() {
  return <QRScanner locale="lo" onScan={(r) => console.log(r.text)} />;
}
```

## Vue

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { QRScanner } from 'k-qr-scanner/vue';
import { acceptEMV, parseEMV, type ScanResult } from 'k-qr-scanner';

const open = ref(false);
const lakOnly = acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' });
function onScan(r: ScanResult) {
  open.value = false;
  pay(parseEMV(r.text)!);
}
</script>

<template>
  <button @click="open = true">Scan</button>
  <QRScanner v-if="open" theme="frame" layout="bar" locale="lo" :accept="lakOnly" @scan="onScan" @close="open = false">
    <div slot="banner">ຮອງຮັບຄິວອາ / Support QR</div>
  </QRScanner>
</template>
```

If you use the raw `<kqr-scanner>` tag in Vue templates instead of the wrapper, tell Vue it is a custom element:

```ts
// vite.config.ts
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'kqr-scanner' } } });
```

## Nuxt

Render the scanner on the client only, with `<ClientOnly>` or a `*.client.vue` component:

```vue
<!-- pages/scan.vue -->
<script setup lang="ts">
import { QRScanner } from 'k-qr-scanner/vue';
</script>

<template>
  <ClientOnly>
    <QRScanner locale="lo" @scan="(r) => navigateTo(`/pay?qr=${encodeURIComponent(r.text)}`)" />
  </ClientOnly>
</template>
```

## Svelte and SvelteKit

The Svelte entry is an action. Actions only run in the browser, so it is safe in SvelteKit without `browser` checks.

```svelte
<script lang="ts">
  import { qrScanner } from 'k-qr-scanner/svelte';
  import { acceptEMV, parseEMV } from 'k-qr-scanner';
  let open = $state(false);
  const lakOnly = acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' });
</script>

<button onclick={() => (open = true)}>Scan</button>

{#if open}
  <div use:qrScanner={{ theme: 'frame', layout: 'bar', locale: 'lo', accept: lakOnly,
    onScan: (r) => { open = false; pay(parseEMV(r.text)); }, onClose: () => (open = false) }}>
    <div data-slot="banner">ຮອງຮັບຄິວອາ / Support QR</div>
    <button data-slot="actions-right">My QR</button>
  </div>
{/if}
```

Svelte 5 only allows `slot="…"` inside custom elements, so children of the action use `data-slot="…"`. You can also use the element directly, where `slot` works and events are `on…` attributes:

```svelte
<script>
  import 'k-qr-scanner';
</script>

<kqr-scanner theme="alipay" locale="lo" onscan={(e) => pay(e.detail.text)}>
  <button slot="actions-left">My QR code</button>
</kqr-scanner>
```

## Angular

Import the package once to register the element, and allow custom elements in the component:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild } from '@angular/core';
import { acceptEMV, parseEMV, type KQRScannerElement, type ScanResult } from 'k-qr-scanner';

@Component({
  selector: 'app-scan',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <button (click)="open = true">Scan</button>
    @if (open) {
      <kqr-scanner #scanner theme="frame" layout="bar" locale="lo"
        (scan)="onScan($any($event).detail)" (close)="open = false">
        <div slot="banner">ຮອງຮັບຄິວອາ / Support QR</div>
      </kqr-scanner>
    }
  `,
})
export class ScanComponent {
  open = false;

  // properties such as accept and labels are set on the element itself
  @ViewChild('scanner') set scanner(ref: ElementRef<KQRScannerElement> | undefined) {
    if (ref) ref.nativeElement.accept = acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' });
  }

  onScan(r: ScanResult) {
    this.open = false;
    pay(parseEMV(r.text)!);
  }
}
```

Importing `k-qr-scanner` registers the element and is safe with Angular SSR; the element only activates in the browser.

## React Native and Expo

```tsx
import { QRScanner } from 'k-qr-scanner/react-native';

<QRScanner style={{ flex: 1 }} locale="lo" onScan={(r) => pay(r.text)} onClose={() => setOpen(false)} />
```

It needs `react-native-webview` and the camera permissions; `npx k-qr-scanner init` sets up both. Everything else is in [REACT_NATIVE.md](REACT_NATIVE.md). For Capacitor, native web views and Flutter, see [MOBILE.md](MOBILE.md).

## Plain HTML

```html
<script src="https://cdn.jsdelivr.net/npm/k-qr-scanner@0.3/dist/kqrcode.global.js"></script>

<button id="scan">Scan to pay</button>
<script>
  document.getElementById('scan').onclick = async () => {
    const { text } = await KQRCode.scanQR({
      theme: 'frame',
      layout: 'bar',
      locale: 'lo',
      accept: KQRCode.acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' }),
    });
    const emv = KQRCode.parseEMV(text);
    alert(`${emv.merchantName}: ${emv.amount} ${emv.currencyCode}`);
  };
</script>
```

The script build (20 kB gzip) defines the global `KQRCode` with the same exports as the package (`scanQR`, `QRScanner`, `acceptEMV`, `parseEMV`, …) and registers `<kqr-scanner>`. It loads the engine from `kqrcode.engine.js` in the same directory when the scanner first opens.

- **Keep the version in the URL.** `@0.3` follows 0.3.x; `@0.3.0` pins one release. jsDelivr caches a URL without a version for up to 7 days, so a new release can take that long to appear there.
- **Self-hosting:** serve `kqrcode.global.js`, `kqrcode.engine.js` and `kqrcode.jsqr.js` from one directory as `text/javascript`, with CORS headers if they come from another origin.

## Content-Security-Policy

The engine runs WebAssembly in a worker created from a `blob:` URL, so a CSP needs:

```
worker-src blob:; script-src 'self' 'wasm-unsafe-eval'
```

With `superResolution: 'webgpu'`, also allow the ONNX Runtime CDN in `script-src` and `connect-src`, or self-host it and set `onnx-runtime-url`. If workers or WebAssembly are blocked, the scanner falls back to jsQR on the main thread: it still works, but slower, without super-resolution, and for regular QR codes only. `npx k-qr-scanner doctor` finds a CSP in your HTML and checks it.
