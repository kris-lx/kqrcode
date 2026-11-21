// Generates 5 minimal real-world apps that consume the packed tarball (no create-* CLIs).
// Usage: node scripts/make-apps.mjs <dir-with-tarball>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const TGZ = 'file:../k-qr-scanner-0.2.0.tgz';
const w = (app, file, content) => {
  const f = join(ROOT, app, file);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
};
// every app shows the same thing: scanner with a slotted button; writes the result into #result
const SLOT_LABEL = 'My QR';

/* ---------------- React + Vite ---------------- */
w('react-vite', 'package.json', {
  name: 'react-vite', private: true, type: 'module',
  scripts: { build: 'tsc --noEmit && vite build', preview: 'vite preview --port 4101 --strictPort' },
  dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0', 'k-qr-scanner': TGZ },
  devDependencies: { vite: '^6.3.0', '@vitejs/plugin-react': '^4.5.0', typescript: '~5.8.0', '@types/react': '^19.1.0', '@types/react-dom': '^19.1.0' },
});
w('react-vite', 'vite.config.ts', `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()] });`);
w('react-vite', 'tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, lib: ['ES2022', 'DOM'] }, include: ['src'] });
w('react-vite', 'index.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
w('react-vite', 'src/main.tsx', `import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QRScanner } from 'k-qr-scanner/react';
import type { ScanResult } from 'k-qr-scanner';
function App() {
  const [r, setR] = useState<string>('');
  return <>
    <p id="result">{r}</p>
    {!r && <QRScanner theme="alipay" locale="lo" style={{ '--kqr-accent': '#e60012' }} onScan={(x: ScanResult) => setR(x.text)}>
      <button slot="actions-left">${SLOT_LABEL}</button>
    </QRScanner>}
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
`);

/* ---------------- Next.js (App Router, SSR) ---------------- */
w('next', 'package.json', {
  name: 'next-app', private: true,
  scripts: { build: 'next build', start: 'next start -p 4102' },
  dependencies: { next: '^15.3.0', react: '^19.1.0', 'react-dom': '^19.1.0', 'k-qr-scanner': TGZ },
  devDependencies: { typescript: '~5.8.0', '@types/react': '^19.1.0', '@types/node': '^22.0.0' },
});
w('next', 'tsconfig.json', { compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], strict: true, skipLibCheck: true, noEmit: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', esModuleInterop: true, isolatedModules: true, incremental: false, plugins: [{ name: 'next' }] }, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules'] });
w('next', 'next.config.mjs', `export default { eslint: { ignoreDuringBuilds: true } };`);
w('next', 'app/layout.tsx', `export default function L({ children }: { children: React.ReactNode }) { return <html lang="lo"><body>{children}</body></html>; }`);
// Server component page renders the client wrapper directly (relies on the built-in 'use client')
w('next', 'app/page.tsx', `import Scan from './scan';
export default function Page() { return <main><h1>SSR ok</h1><Scan /></main>; }`);
w('next', 'app/scan.tsx', `'use client';
import { useState } from 'react';
import { QRScanner } from 'k-qr-scanner/react';
export default function Scan() {
  const [r, setR] = useState('');
  return <>
    <p id="result">{r}</p>
    {!r && <QRScanner theme="wechat" locale="lo" onScan={(x) => setR(x.text)}><button slot="actions-left">${SLOT_LABEL}</button></QRScanner>}
  </>;
}`);

/* ---------------- Nuxt 3 (SSR) ---------------- */
w('nuxt', 'package.json', {
  name: 'nuxt-app', private: true, type: 'module',
  scripts: { build: 'nuxt build', start: 'node .output/server/index.mjs' },
  dependencies: { nuxt: '^3.17.0', vue: '^3.5.0', 'k-qr-scanner': TGZ },
});
w('nuxt', 'nuxt.config.ts', `export default defineNuxtConfig({ compatibilityDate: '2025-01-01', devtools: { enabled: false },
  vue: { compilerOptions: { isCustomElement: (t: string) => t === 'kqr-scanner' } } });`);
w('nuxt', 'app.vue', `<script setup lang="ts">
import { ref } from 'vue';
import { QRScanner } from 'k-qr-scanner/vue';
const r = ref('');
</script>
<template>
  <main>
    <h1>SSR ok</h1>
    <p id="result">{{ r }}</p>
    <ClientOnly>
      <QRScanner v-if="!r" theme="grid" locale="lo" @scan="(x) => (r = x.text)"><button slot="actions-left">${SLOT_LABEL}</button></QRScanner>
    </ClientOnly>
  </main>
</template>`);

/* ---------------- SvelteKit (SSR, adapter-node) ---------------- */
w('sveltekit', 'package.json', {
  name: 'sveltekit-app', private: true, type: 'module',
  scripts: { build: 'vite build', start: 'node build' },
  dependencies: { 'k-qr-scanner': TGZ },
  devDependencies: { '@sveltejs/kit': '^2.21.0', '@sveltejs/adapter-node': '^5.2.0', '@sveltejs/vite-plugin-svelte': '^5.0.0', svelte: '^5.33.0', vite: '^6.3.0', typescript: '~5.8.0' },
});
w('sveltekit', 'svelte.config.js', `import adapter from '@sveltejs/adapter-node'; export default { kit: { adapter: adapter() } };`);
w('sveltekit', 'vite.config.js', `import { sveltekit } from '@sveltejs/kit/vite'; import { defineConfig } from 'vite'; export default defineConfig({ plugins: [sveltekit()] });`);
w('sveltekit', 'src/app.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>`);
w('sveltekit', 'src/routes/+page.svelte', `<script lang="ts">
  import { qrScanner } from 'k-qr-scanner/svelte';
  let r = $state('');
</script>
<h1>SSR ok</h1>
<p id="result">{r}</p>
{#if !r}
  <div use:qrScanner={{ theme: 'frame', locale: 'lo', onScan: (x) => (r = x.text) }}><button data-slot="actions-left">${SLOT_LABEL}</button></div>
{/if}`);

/* ---------------- Angular 19 (standalone + SSR-free static build) ---------------- */
w('angular', 'package.json', {
  name: 'angular-app', private: true,
  scripts: { build: 'ng build', start: 'node serve.mjs' },
  dependencies: {
    '@angular/core': '^19.2.0', '@angular/common': '^19.2.0', '@angular/compiler': '^19.2.0', '@angular/platform-browser': '^19.2.0',
    rxjs: '^7.8.0', tslib: '^2.8.0', 'zone.js': '~0.15.0', 'k-qr-scanner': TGZ,
  },
  devDependencies: { '@angular/build': '^19.2.0', '@angular/cli': '^19.2.0', '@angular/compiler-cli': '^19.2.0', typescript: '~5.7.0' },
});
w('angular', 'angular.json', {
  version: 1, newProjectRoot: 'projects',
  projects: { app: { projectType: 'application', root: '', sourceRoot: 'src', architect: { build: {
    builder: '@angular/build:application',
    options: { outputPath: 'dist', index: 'src/index.html', browser: 'src/main.ts', polyfills: ['zone.js'], tsConfig: 'tsconfig.json',
      budgets: [{ type: 'initial', maximumWarning: '2mb', maximumError: '5mb' }] },
  } } } },
});
w('angular', 'tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', strict: true, skipLibCheck: true, experimentalDecorators: true, lib: ['ES2022', 'dom'] }, files: ['src/main.ts'], angularCompilerOptions: { strictTemplates: true } });
w('angular', 'src/index.html', `<!doctype html><html><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><app-root></app-root></body></html>`);
w('angular', 'src/main.ts', `import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import 'k-qr-scanner';
import type { ScanResult } from 'k-qr-scanner';

@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`
    <p id="result">{{ result }}</p>
    @if (!result) {
      <kqr-scanner theme="wechat" locale="lo" (scan)="onScan($any($event).detail)">
        <button slot="actions-left">${SLOT_LABEL}</button>
      </kqr-scanner>
    }\`,
})
class App {
  result = '';
  onScan(r: ScanResult) { this.result = r.text; }
}
bootstrapApplication(App).catch((e) => console.error(e));
`);
w('angular', 'serve.mjs', `import { createServer } from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import { join, extname } from 'node:path';
const dir = 'dist/browser'; const T = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
createServer((q, s) => { let f = join(dir, (q.url || '/').split('?')[0]); if (!existsSync(f) || f.endsWith('\\\\') || f === dir) f = join(dir, 'index.html');
  try { s.setHeader('content-type', T[extname(f)] || 'application/octet-stream'); s.end(readFileSync(f)); } catch { s.end(readFileSync(join(dir, 'index.html'))); } }).listen(4105);`);
console.log('apps written to', ROOT);
