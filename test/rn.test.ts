/**
 * React Native wrapper. The bridge is tested directly; the built component (dist/rn/index.js,
 * run `npm run build` first) is rendered with a stand-in for react-native-webview.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { acceptReply, appStateScript, buildPage, callScript, handleMessage, parseMessage, type WireResult } from '../src/rn-bridge.ts';
import withKqrcode from '../app.plugin.js';

const wire: WireResult = {
  text: 'KPAY:1', bytes: [75, 80], corners: [], format: 'micro_qr_code', version: 'M2', ecLevel: 'L',
  zoom: 1, timestamp: 1, source: 'camera',
};
const msg = (m: object) => JSON.stringify({ kqr: 1, ...m });

test('buildPage embeds config safely and inlines the runtime', () => {
  const html = buildPage({ heading: '</script><script>alert(1)</script>', accept: true }, { runtime: 'var x = "</script>";' });
  assert.ok(!html.includes('</script><script>alert(1)'), 'config must not break out of the script tag');
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /var x = "<\\\/script>";/);
  assert.equal(html.match(/<\/script>/g)!.length, 3); // cfg, runtime, boot
});

test('buildPage can load kqrcode from a URL instead', () => {
  const html = buildPage({}, { scriptUrl: 'https://cdn.example.com/kqrcode.global.js?a=1&b="2"' });
  assert.match(html, /<script src="https:\/\/cdn\.example\.com\/kqrcode\.global\.js\?a=1&amp;b=&quot;2&quot;"><\/script>/);
});

test('parseMessage ignores foreign messages', () => {
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage('{"type":"scan"}'), null);
  assert.equal(parseMessage(msg({ type: 'ready' }))?.type, 'ready');
});

test('scan / reject / error / close / slot messages reach the callbacks', async () => {
  const got: unknown[] = [];
  const cb = {
    onScan: (r: { text: string; bytes: Uint8Array; format: string }) => got.push(['scan', r.text, r.bytes instanceof Uint8Array, r.format]),
    onReject: (r: { text: string }, m?: string) => got.push(['reject', r.text, m]),
    onError: (e: { code: string; name: string }) => got.push(['error', e.code, e.name]),
    onClose: () => got.push(['close']),
    onReady: () => got.push(['ready']),
    onSlotPress: (s: string, id?: string) => got.push(['slot', s, id]),
  };
  const inject = () => assert.fail('nothing to inject');
  await handleMessage(msg({ type: 'ready' }), cb, inject);
  await handleMessage(msg({ type: 'scan', result: wire }), cb, inject);
  await handleMessage(msg({ type: 'reject', result: wire, message: 'no' }), cb, inject);
  await handleMessage(msg({ type: 'error', code: 'permission-denied', message: 'denied' }), cb, inject);
  await handleMessage(msg({ type: 'slot', slot: 'actions-left', id: 'mine' }), cb, inject);
  await handleMessage(msg({ type: 'close' }), cb, inject);
  assert.deepEqual(got, [
    ['ready'], ['scan', 'KPAY:1', true, 'micro_qr_code'], ['reject', 'KPAY:1', 'no'],
    ['error', 'permission-denied', 'ScanError'], ['slot', 'actions-left', 'mine'], ['close'],
  ]);
});

test('accept requests are answered in the page', async () => {
  const cases: [unknown, string][] = [
    [undefined, 'true'], [true, 'true'], [false, 'false'], ['Not ours', '"Not ours"'],
  ];
  for (const [ret, expected] of cases) {
    let js = '';
    await handleMessage(msg({ type: 'accept', id: 7, result: wire }), { accept: async () => ret as never }, (s) => (js = s));
    assert.equal(js, `window.__kqrAccept&&window.__kqrAccept(7,${expected});true;`);
  }
  let js = '';
  await handleMessage(msg({ type: 'accept', id: 8, result: wire }), { accept: () => { throw new Error('x'); } }, (s) => (js = s));
  assert.equal(js, acceptReply(8, false));
});

test('callScript quotes its arguments', () => {
  assert.equal(callScript('toggleTorch', true), 'window.__kqrCall&&window.__kqrCall("toggleTorch",true);true;');
  assert.equal(callScript('resume'), 'window.__kqrCall&&window.__kqrCall("resume");true;');
  assert.equal(appStateScript(false), 'window.__kqrApp&&window.__kqrApp(false);true;');
});

test('the page does not report its own harmless errors and handles app background', () => {
  const html = buildPage({}, { runtime: '' });
  assert.ok(!html.includes('window.onerror'), 'unrelated page errors must not reach onError');
  assert.match(html, /window\.__kqrApp = function \(active\)/);
});

test('Expo config plugin adds both camera permission entries', () => {
  const out = withKqrcode({ name: 'app', android: { permissions: ['INTERNET'] } });
  assert.match(out.ios.infoPlist.NSCameraUsageDescription, /camera/);
  assert.deepEqual(out.android.permissions, ['INTERNET', 'android.permission.CAMERA']);
  const kept = withKqrcode({ ios: { infoPlist: { NSCameraUsageDescription: 'mine' } }, android: { permissions: ['CAMERA'] } });
  assert.equal(kept.ios.infoPlist.NSCameraUsageDescription, 'mine');
  assert.deepEqual(kept.android.permissions, ['CAMERA']);
  const custom = withKqrcode({ ios: { infoPlist: { NSCameraUsageDescription: 'mine' } } }, { cameraPermission: 'Scan to pay' });
  assert.equal(custom.ios.infoPlist.NSCameraUsageDescription, 'Scan to pay');
});

/** Loads dist/rn/index.js against stand-ins for react-native and react-native-webview. */
function loadBuilt(os: 'ios' | 'android', fakeReact?: unknown) {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const React = fakeReact ?? require('react');
  const seen: Record<string, any>[] = [];
  const injected: string[] = [];
  const appState: ((s: string) => void)[] = [];
  const asked: string[] = [];
  const FakeWebView = fakeReact ? 'webview' : React.forwardRef((props: Record<string, any>, ref: any) => {
    seen.push(props);
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (js: string) => injected.push(js) }));
    return React.createElement('webview');
  });
  const RN = {
    View: (p: Record<string, unknown>) => React.createElement('rn-view', { 'data-style': JSON.stringify(p.style) }),
    Platform: { OS: os },
    AppState: { addEventListener: (_: string, fn: (s: string) => void) => { appState.push(fn); return { remove() {} }; } },
    PermissionsAndroid: {
      PERMISSIONS: { CAMERA: 'android.permission.CAMERA' },
      check: async () => (asked.push('check'), false),
      request: async () => (asked.push('request'), 'granted'),
    },
  };
  const orig = Module._load;
  Module._load = function (req: string, ...rest: unknown[]) {
    if (req === 'react-native-webview') return { WebView: FakeWebView };
    if (req === 'react-native') return RN;
    if (req === 'react' && fakeReact) return fakeReact;
    // the shared ES-module engine (Metro bundles it); a stand-in keeps this test independent of require(esm)
    if (req === '../kqrcode.engine.js') return { __esModule: true, default: 'ENGINE_SOURCE' };
    return orig.call(this, req, ...rest);
  };
  const path = require.resolve('../dist/rn/index.js');
  delete require.cache[path];
  try {
    return { React, QRScanner: require(path).QRScanner, seen, injected, appState, asked };
  } finally {
    Module._load = orig;
  }
}


test('built component renders a WebView with the page and wires messages', async () => {
  const { React, QRScanner, seen } = loadBuilt('ios');
  const { renderToString } = createRequire(import.meta.url)('react-dom/server');
  const scans: string[] = [];
  renderToString(React.createElement(QRScanner, {
    locale: 'lo', formats: ['micro_qr_code'], cssVars: { '--kqr-accent': '#e60012' },
    accept: (r: { text: string }) => r.text === 'KPAY:1' || 'wrong', onScan: (r: { text: string }) => scans.push(r.text),
  }));
  const p = seen[0];
  assert.equal(p.source.baseUrl.slice(0, 8), 'https://', 'secure origin for getUserMedia');
  assert.ok(p.source.html.length > 100_000, 'runtime is inlined');
  assert.ok(p.source.html.includes('window.__KQR_ENGINE__="ENGINE_SOURCE"'), 'engine source from the shared file is inlined');
  assert.match(p.source.html, /"formats":\["micro_qr_code"\]/);
  assert.match(p.source.html, /"accept":true/);
  assert.equal(p.mediaCapturePermissionGrantType, 'grant');
  assert.equal(p.allowsInlineMediaPlayback, true);
  assert.equal(p.allowFileAccess, undefined, 'no file:// access needed');
  assert.equal(typeof p.onContentProcessDidTerminate, 'function');
  assert.equal(typeof p.onRenderProcessGone, 'function');
  p.onMessage({ nativeEvent: { data: msg({ type: 'scan', result: wire }) } });
  assert.deepEqual(scans, ['KPAY:1']);
});

/** Just enough of React's hooks to run one component's render + effects without a renderer. */
function hooksHarness() {
  const slots: unknown[] = [];
  const effects: (() => void)[] = [];
  let i = 0;
  const R = {
    createElement: (type: unknown, props: Record<string, any>) => ({ type, props }),
    forwardRef: (fn: unknown) => fn,
    useRef: (v: unknown) => { const k = i++; if (!(k in slots)) slots[k] = { current: v }; return slots[k]; },
    useState: (v: unknown) => {
      const k = i++;
      if (!(k in slots)) slots[k] = v;
      return [slots[k], (n: unknown) => { slots[k] = typeof n === 'function' ? (n as (x: unknown) => unknown)(slots[k]) : n; }];
    },
    useMemo: (f: () => unknown) => f(),
    useEffect: (f: () => void) => { const k = i++; if (!(k in slots)) { slots[k] = true; effects.push(f); } },
    useImperativeHandle: (ref: { current: unknown } | null, f: () => unknown) => { if (ref) ref.current = f(); },
  };
  const render = (Comp: any, props: object, ref: { current: any } | null = null) => {
    i = 0;
    const out = Comp(props, ref);
    effects.splice(0).forEach((f) => f());
    return out as { type: unknown; props: Record<string, any> };
  };
  return { R, render };
}

test('Android: asks for the camera first, then shows the page; background releases the camera', async () => {
  const { R, render } = hooksHarness();
  const { QRScanner, injected, appState, asked } = loadBuilt('android', R);
  const ref = { current: null as any };
  let out = render(QRScanner, {}, ref);
  assert.equal(out.props.source, undefined, 'a plain view until the permission is answered');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, ['check', 'request']);
  out = render(QRScanner, {}, ref);
  assert.equal(out.type, 'webview');
  out.props.ref.current = { injectJavaScript: (js: string) => injected.push(js) };

  appState.forEach((fn) => fn('inactive'));
  appState.forEach((fn) => fn('background'));
  appState.forEach((fn) => fn('active'));
  assert.deepEqual(injected, [appStateScript(false), appStateScript(true)], "'inactive' (iOS permission dialog) is ignored");

  ref.current.toggleTorch(true);
  assert.equal(injected.at(-1), callScript('toggleTorch', true));

  const key = out.props.key;
  out.props.onRenderProcessGone();
  assert.equal(render(QRScanner, {}, ref).props.key, key + 1, 'WebView remounted after its process died');
});
