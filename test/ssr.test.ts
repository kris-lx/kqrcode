/**
 * SSR smoke test against the *built* package (run `npm run build` first):
 * importing every entry on a server (no DOM) must not throw – that is what
 * Next.js, Nuxt, SvelteKit, Angular SSR and Astro do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('all entries import without a DOM (ESM)', async () => {
  for (const e of ['index', 'react', 'vue', 'svelte']) {
    const m = await import(`../dist/${e}.js`);
    assert.ok(Object.keys(m).length > 0, e);
  }
});

test('all entries require() without a DOM (CJS)', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  for (const e of ['index', 'react', 'vue', 'svelte']) assert.ok(require(`../dist/${e}.cjs`), e);
});

test('React wrapper is marked as a client component for Next.js', () => {
  assert.match(readFileSync(new URL('../dist/react.js', import.meta.url), 'utf8').slice(0, 40), /^['"]use client['"]/);
});

test('React SSR renders the custom element tag', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { QRScanner } = await import('../dist/react.js');
  const html = renderToString(React.createElement(QRScanner, { locale: 'lo', superResolution: 'webgpu', continuous: true }));
  assert.match(html, /<kqr-scanner[^>]*locale="lo"/);
  assert.match(html, /super-resolution="webgpu"/);
  assert.match(html, /continuous=""/);
});

test('Vue SSR renders the custom element tag', async () => {
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { QRScanner } = await import('../dist/vue.js');
  const html = await renderToString(createSSRApp({ render: () => h(QRScanner, { locale: 'lo', inline: true }) }));
  assert.match(html, /<kqr-scanner[^>]*locale="lo"/);
  assert.match(html, /\sinline(=""|[\s>])/); // Vue renders boolean attrs as bare `inline`
});
