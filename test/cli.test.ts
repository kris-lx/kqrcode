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
  ['react-native', { 'react-native': '0.80', react: '19' }, { 'tsconfig.json': '{}' }, 'components/QrScanner.tsx', /^(?![\s\S]*PermissionsAndroid)[\s\S]*from 'kqrcode\/react-native'/],
  ['react-native', { expo: '54', 'react-native': '0.81', react: '19' }, {}, 'components/QrScanner.jsx', /from 'kqrcode\/react-native'/],
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

test('init for React Native also installs react-native-webview (expo install on Expo)', () => {
  const bare = run(project({ 'react-native': '0.80', react: '19' }, { 'yarn.lock': '' }), 'init', '--dry-run');
  assert.match(bare.stdout, /\$ yarn add kqrcode[\s\S]*\$ yarn add react-native-webview/);
  assert.match(bare.stdout, /pod install/);
  const expo = run(project({ expo: '54', 'react-native': '0.81', react: '19' }), 'init', '--dry-run');
  assert.match(expo.stdout, /\$ npx expo install react-native-webview/);
});

test('doctor checks the React Native camera setup', () => {
  const dir = project({ 'react-native': '0.80', react: '19', kqrcode: '0.1.0' }, {
    'android/app/src/main/AndroidManifest.xml': '<manifest></manifest>',
    'ios/App/Info.plist': '<plist><key>NSCameraUsageDescription</key></plist>',
  });
  const r = run(dir, 'doctor');
  assert.match(r.stdout, /react-native-webview is missing/);
  assert.match(r.stdout, /iOS camera usage description set/);
  assert.match(r.stdout, /Android: android\.permission\.CAMERA is not declared/);
});

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>App</string>
</dict>
</plist>
`;
const MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application android:name=".MainApplication" />
</manifest>
`;

test('init writes the camera permission into a bare React Native app (once)', () => {
  const dir = project({ 'react-native': '0.80', react: '19' }, {
    'ios/App/Info.plist': PLIST, 'android/app/src/main/AndroidManifest.xml': MANIFEST,
  });
  const r = run(dir, 'init', '--no-install');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const plist = readFileSync(join(dir, 'ios/App/Info.plist'), 'utf8');
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\n\t<string>[^<]+<\/string>\n<\/dict>\n<\/plist>/);
  const manifest = readFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /<manifest [^>]+>\n {4}<uses-permission android:name="android\.permission\.CAMERA" \/>/);
  run(dir, 'init', '--no-install');
  assert.equal(readFileSync(join(dir, 'ios/App/Info.plist'), 'utf8'), plist, 'idempotent');
  assert.equal(readFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8'), manifest, 'idempotent');
  assert.match(run(dir, 'doctor').stdout, /iOS camera usage description set[\s\S]*Android CAMERA permission declared/);
});

test('init adds the kqrcode config plugin to an Expo app.json', () => {
  const dir = project({ expo: '54', 'react-native': '0.81', react: '19' }, {
    'app.json': JSON.stringify({ expo: { name: 'a', plugins: ['expo-router'] } }, null, 2),
  });
  assert.equal(run(dir, 'init', '--no-install').status, 0);
  const app = JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8'));
  assert.deepEqual(app.expo.plugins, ['expo-router', 'kqrcode']);
  run(dir, 'init', '--no-install');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'app.json'), 'utf8')).expo.plugins, ['expo-router', 'kqrcode']);
  assert.match(run(dir, 'doctor').stdout, /iOS camera usage description set[\s\S]*Android CAMERA permission declared/);
});

test('init --dry-run leaves native files alone', () => {
  const dir = project({ 'react-native': '0.80', react: '19' }, { 'ios/App/Info.plist': PLIST });
  const r = run(dir, 'init', '--dry-run');
  assert.match(r.stdout, /added NSCameraUsageDescription/);
  assert.equal(readFileSync(join(dir, 'ios/App/Info.plist'), 'utf8'), PLIST);
});
