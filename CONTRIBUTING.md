# Contributing

Thanks for helping improve kqrcode!

## Reporting a bug

Please open an issue with:

- device, OS and browser **with versions**, e.g. "iPhone 13, iOS 17.5, Safari";
- what you scanned: a printed code, a code on a screen, or a photo. Distance and lighting matter too;
- what happened, ideally with a screenshot or a short video;
- your framework and kqrcode version (`npx kqr-scanner doctor` prints most of this).

A sample image of a code that fails to scan helps a lot. Remove anything sensitive first.

## Development

```bash
git clone https://github.com/kris-lx/kqrcode.git
cd kqrcode
npm install
npm run build
npm test
```

| path | what |
|---|---|
| `src/engine.ts` | detection and decoding pipeline (runs in the worker) |
| `src/scanner.ts` | camera, frame capture, auto-zoom, worker communication |
| `src/element.ts` | `<kqr-scanner>` UI |
| `src/autozoom.ts` | zoom decisions (pure logic, unit-tested) |
| `src/sr.ts`, `src/sr-providers.ts` | super-resolution kernel and ONNX backend |
| `src/react.ts`, `src/vue.ts`, `src/svelte.ts` | framework wrappers |
| `src/cli.ts` | `npx kqr-scanner` |
| `bench/`, `scripts/` | benchmarks and end-to-end tests |

See [docs/TESTING.md](docs/TESTING.md) for the end-to-end, cross-browser and device tests.

## Pull requests

- Keep changes focused, and add or update tests.
- `npm run typecheck && npm test` must pass.
- For UI changes, add a screenshot of each affected theme.
- Add a line to `CHANGELOG.md` under **Unreleased**.
