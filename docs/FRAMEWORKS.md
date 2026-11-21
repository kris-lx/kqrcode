# Using kqrcode in every framework

> **Fastest way:** run `npx k-qr-scanner init` in your project. It detects the framework, installs the package and creates a starter component based on the examples below.

The scanner is a standard **custom element** (`<kqr-scanner>`), so it works anywhere the DOM works.
Thin wrappers exist for React, Vue and Svelte. Importing any entry is SSR-safe (it registers the element only in the browser).

Common props / attributes:

| React / Vue / Svelte prop | HTML attribute | default |
|---|---|---|
| `locale` | `locale` | browser language → `en` / `lo` / `zh` |
| `facing` | `facing` | `environment` |
| `continuous` | `continuous` | off (stop after first hit) |
| `inline` | `inline` | off (full screen) |
| `maxZoom` | `max-zoom` | 8 (hardware) / 4 (digital) |
| `superResolution` | `super-resolution` | `js` (`webgpu`, `off`) |
| `noAutoZoom`, `noGallery`, `noTorch`, `noBeep`, `noVibrate` | `no-auto-zoom`, … | off |

Events: `scan` (`detail: ScanResult`), `error` (`detail: ScanError`), `close`, `ready`, `zoom`.

---

## React (Vite / CRA)

```tsx
import { useState } from 'react';
import { QRScanner } from 'k-qr-scanner/react';

export function PayButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Scan to pay</button>
      {open && (
        <QRScanner
          locale="lo"
          superResolution="webgpu"
          onScan={(r) => { setOpen(false); pay(r.text); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

## Next.js (App Router)

The React entry ships with `'use client'`, so you can render it from a server component file, or lazy-load it so the
~460 kB engine is only downloaded on the scan page:

```tsx
// app/scan/page.tsx
import dynamic from 'next/dynamic';
const QRScanner = dynamic(() => import('k-qr-scanner/react').then((m) => m.QRScanner), { ssr: false });

export default function Page() {
  return <QRScanner locale="lo" onScan={(r) => console.log(r.text)} />;
}
```

## Vue 3 (Vite)

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { QRScanner } from 'k-qr-scanner/vue';
const open = ref(false);
</script>

<template>
  <button @click="open = true">Scan</button>
  <QRScanner v-if="open" locale="lo" @scan="(r) => { open = false; pay(r.text) }" @close="open = false" />
</template>
```

If you use the raw tag `<kqr-scanner>` in Vue templates instead of the wrapper, tell Vue it is a custom element:
`vue({ template: { compilerOptions: { isCustomElement: (t) => t === 'kqr-scanner' } } })`.

## Nuxt 3

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

## Svelte 5 / SvelteKit

```svelte
<script lang="ts">
  import { qrScanner } from 'k-qr-scanner/svelte';
  let open = $state(false);
</script>

<button onclick={() => (open = true)}>Scan</button>
{#if open}
  <div use:qrScanner={{ locale: 'lo', onScan: (r) => { open = false; pay(r.text); }, onClose: () => (open = false) }}></div>
{/if}
```

Actions only run in the browser, so this is SSR-safe in SvelteKit without `browser` checks.

Slots: Svelte 5 rejects `slot="…"` inside a plain `<div>`, so inside the action use **`data-slot="…"`**:

```svelte
<div use:qrScanner={{ theme: 'alipay', onScan }}>
  <button data-slot="actions-left">My QR</button>
</div>
```

Or use the custom element tag directly, where `slot` is valid and events are `on<name>` attributes:

```svelte
<script>import 'k-qr-scanner';</script>
<kqr-scanner theme="alipay" locale="lo" onscan={(e) => pay(e.detail.text)}>
  <button slot="actions-left">My QR</button>
</kqr-scanner>
```

## Angular (17+ standalone)

```ts
// scan.component.ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import 'k-qr-scanner'; // registers <kqr-scanner>
import type { ScanResult } from 'k-qr-scanner';

@Component({
  selector: 'app-scan',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (open) {
      <kqr-scanner locale="lo" super-resolution="webgpu"
        (scan)="onScan($any($event).detail)" (close)="open = false"></kqr-scanner>
    }
    <button (click)="open = true">Scan</button>`,
})
export class ScanComponent {
  open = false;
  onScan(r: ScanResult) { this.open = false; console.log(r.text); }
}
```

With Angular SSR the import is safe on the server; the element only activates in the browser.

## React Native / Expo

```tsx
import { QRScanner } from 'k-qr-scanner/react-native'; // npx k-qr-scanner init: installs, adds camera permissions

<QRScanner style={{ flex: 1 }} locale="lo" onScan={(r) => pay(r.text)} onClose={() => setOpen(false)} />
```

Expo: `"plugins": ["k-qr-scanner"]` adds the camera permissions. Props and platform notes: [REACT_NATIVE.md](REACT_NATIVE.md).

## Plain HTML / CDN

```html
<script src="https://cdn.jsdelivr.net/npm/k-qr-scanner/dist/kqrcode.global.js"></script>
<kqr-scanner locale="lo"></kqr-scanner>
<script>
  document.querySelector('kqr-scanner').addEventListener('scan', (e) => alert(e.detail.text));
</script>
```

## Headless (bring your own UI)

```ts
import { QRScanner } from 'k-qr-scanner';
const scanner = new QRScanner({ video: document.querySelector('video')!, superResolution: 'webgpu' });
scanner.on('result', (r) => console.log(r.text));
scanner.on('hint', ({ hint }) => drawBox(hint)); // where a (still unreadable) code is
await scanner.start();
```

## Content-Security-Policy

The worker is created from a `blob:` URL and runs WASM. Allow: `worker-src blob:` and `script-src 'wasm-unsafe-eval'`.
For `superResolution: 'webgpu'`, also allow the ONNX Runtime CDN in `script-src`/`connect-src` (or self-host it and set
`onnx-runtime-url`). If blob workers are blocked, the scanner falls back to jsQR on the main thread (slower, no SR).
