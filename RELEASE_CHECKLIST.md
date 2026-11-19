# Release readiness – kqrcode 0.1.0

Audit date: 2026-11-19. Re-run everything with the commands below before each release.

## Verified ✅

| area | result | how |
|---|---|---|
| Unit tests | 29/29: engine (rotation, blur, far, inverted), SR kernel = OpenCV (< 1e-4), ONNX = OpenCV, auto-zoom, SSR imports/render | `npm test` |
| Package | tarball 2.3 MB (was 9.5 MB); ESM is code-split, ~14 KB gzip on import, engine lazy-loaded; CJS wrappers share `index.cjs`; LICENSE included; npm name `kqrcode` free | `npm pack --dry-run` |
| React + Vite (prod build) | builds with `tsc` strict; scans; slots work; no console errors | `scripts/make-apps.mjs` + `scripts/apps-e2e.mts` |
| Next.js 15 App Router (prod, SSR) | SSR HTML ok; scans; slots; no errors | same |
| Nuxt 3 (prod, SSR) | SSR HTML ok; scans; slots; no errors | same |
| SvelteKit 2 / Svelte 5 (prod, SSR) | ok after a fix (Svelte 5 needs `data-slot` in the action) | same |
| Angular 19 (prod) | standalone + `CUSTOM_ELEMENTS_SCHEMA`; scans; slots; no errors | same |
| Chrome 157 | live scan, warm scans 90–320 px, gallery, `scanQR`, 20 s stress (0 wrong reads), 20 start/stop cycles → 0 workers / 0 camera tracks left, heap stable | `scripts/xbrowser.mts` |
| Firefox 159 | same as Chrome, all pass | same |
| WebKit 27.2 (Windows build) | engine + gallery decode on the no-OffscreenCanvas path; graceful "unsupported" UI. This build has **no camera API**, so live camera was not tested | same |
| WebGPU super-resolution | loads ONNX Runtime in the worker, `onnx-webgpu` backend, decodes | `bench/browser.mts` |
| Accuracy and latency vs WeChat (OpenCV) | see BENCHMARK.md | `bench/run.mts` |

## Blockers before calling it production-ready for everyone ❌

1. **Real devices not tested.** iPhone Safari (iOS 16, 17, 18) and 2–3 Android phones (Chrome, Samsung Internet) still need testing. The iOS-specific paths have only run in emulation: 4K `applyConstraints`, the canvas grab route, digital zoom and the `playsinline` quirks. So have the hardware zoom and torch on real Android cameras.
2. ~~Model licence~~ ✅ Apache-2.0 confirmed from the upstream LICENSE. `licenses/` and `NOTICE` added, and the modifications are stated.
3. ~~Package metadata~~ ✅ author `kris`, repository `github.com/kris-lx/kqrcode`, homepage, bugs, LICENSE holder.

## Strongly recommended

- Benchmark on real photos and videos, not only synthetic frames.
- CI (GitHub Actions): `npm test`, a build, the framework-app e2e and the cross-browser runs on every PR.
- Publish as `0.x` with the `beta` dist-tag first, collect device reports, then go to 1.0.
- CHANGELOG and semver policy. A `CSP` section already exists in docs/FRAMEWORKS.md.
- The analysis loop runs at ~12–13 fps under stress (it is sequential: grab → worker). Pipelining one frame ahead would raise this.

## Commands

```bash
npm test
npm run build && npm pack --pack-destination <dir>
node scripts/make-apps.mjs <dir> && (cd each app && npm i && npm run build)
npx tsx scripts/apps-e2e.mts <dir>
npx tsx scripts/xbrowser.mts            # chrome, firefox, webkit (needs: node node_modules/playwright-core/cli.js install firefox webkit)
npx tsx bench/run.mts && npx tsx bench/browser.mts
```
