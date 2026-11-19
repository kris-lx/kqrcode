/** CLI tests against the built binary (run `npm run build` first). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

function project(deps: Record<string, string>, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kqr-cli-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', private: true, dependencies: deps }));
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), c); }
  return dir;
}

const cases: [string, Record<string, string>, Record<string, string>, string, RegExp][] = [
  ['next', { next: '15', react: '19' }, { 'tsconfig.json': '{}' }, 'components/QrScanner.tsx', /'use client'[\s\S]*from 'kqrcode\/react'/],
  ['react', { react: '19' }, {}, 'src/components/QrScanner.jsx', /from 'kqrcode\/react'/],
  ['nuxt', { nuxt: '3' }, {}, 'components/QrScanner.client.vue', /lang="ts"[\s\S]*from 'kqrcode\/vue'/],
  ['vue', { vue: '3' }, {}, 'src/components/QrScanner.vue', /from 'kqrcode\/vue'/],
  ['sveltekit', { '@sveltejs/kit': '2', svelte: '5' }, {}, 'src/lib/QrScanner.svelte', /from 'kqrcode\/svelte'/],
  ['angular', { '@angular/core': '19' }, {}, 'src/app/qr-scanner.component.ts', /<kqr-scanner[\s\S]*CUSTOM_ELEMENTS_SCHEMA|CUSTOM_ELEMENTS_SCHEMA[\s\S]*<kqr-scanner/],
  ['vanilla', {}, {}, 'qr-scanner.js', /scanQR/],
];

for (const [name, deps, files, expectFile, expectCode] of cases) {
  test(`init detects ${name} and writes ${expectFile}`, () => {
    const dir = project(deps, files);
    const r = run(dir, 'init', '--no-install', '--theme', 'alipay', '--locale', 'lo');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`framework\\s+${name}`));
    assert.ok(existsSync(join(dir, expectFile)), r.stdout);
    const code = readFileSync(join(dir, expectFile), 'utf8');
    assert.match(code, expectCode);
    assert.match(code, /alipay/);
  });
}

test('init does not overwrite an existing file without --force', () => {
  const dir = project({ react: '19' }, { 'src/components/QrScanner.jsx': 'mine' });
  const r = run(dir, 'init', '--no-install');
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(dir, 'src/components/QrScanner.jsx'), 'utf8'), 'mine');
  assert.match(r.stdout, /already exists/);
});

test('init picks the package manager from the lockfile', () => {
  const dir = project({ react: '19' }, { 'pnpm-lock.yaml': '' });
  const r = run(dir, 'init', '--dry-run');
  assert.match(r.stdout, /package manager\s+pnpm/);
  assert.match(r.stdout, /\$ pnpm add kqrcode/);
});

test('init rejects an unknown theme and a missing package.json', () => {
  assert.equal(run(project({}), 'init', '--theme', 'nope', '--no-install').status, 1);
  assert.equal(run(mkdtempSync(join(tmpdir(), 'kqr-empty-')), 'init').status, 1);
});

test('doctor flags a CSP that blocks workers / WebAssembly', () => {
  const dir = project({}, { 'index.html': `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">` });
  const r = run(dir, 'doctor');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /worker-src blob:/);
  assert.match(r.stdout, /wasm-unsafe-eval/);
});

test('--version and --help', () => {
  assert.match(run(tmpdir(), '--version').stdout, /^\d+\.\d+\.\d+/);
  assert.match(run(tmpdir(), '--help').stdout, /npx kqrcode init/);
});
