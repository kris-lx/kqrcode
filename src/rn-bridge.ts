/**
 * React Native ⇄ WebView bridge, kept free of React / React Native imports so it can be unit-tested
 * in Node. The WebView page hosts the regular <kqr-scanner>; this file builds that page and turns
 * its postMessage traffic back into typed callbacks.
 */
import type { ScanError, ScanErrorCode, ScanResult, AcceptVerdict } from './scanner';
import type { ScannerLabels, ScannerTheme } from './element';
import type { QRFormat } from './formats';

/** Everything the page needs to set up the element (serialisable). */
export interface PageConfig {
  theme?: ScannerTheme;
  locale?: string;
  heading?: string;
  facing?: 'environment' | 'user';
  continuous?: boolean;
  keepCamera?: boolean;
  success?: 'dot' | 'box' | 'none';
  torch?: 'auto' | 'always' | 'never';
  zoomControl?: 'slider' | 'none';
  maxZoom?: number;
  superResolution?: 'js' | 'webgpu' | 'off';
  onnxRuntimeUrl?: string;
  formats?: QRFormat[];
  noAutoZoom?: boolean;
  noGallery?: boolean;
  noTorch?: boolean;
  noBeep?: boolean;
  noVibrate?: boolean;
  noClose?: boolean;
  labels?: Partial<ScannerLabels>;
  /** CSS custom properties, e.g. { '--kqr-accent': '#e60012' } */
  cssVars?: Record<string, string>;
  /** Extra UI as HTML strings: { 'actions-left': '<button>My QR</button>' } */
  slots?: Record<string, string>;
  /** Ask React Native before a code counts (the `accept` prop is set). */
  accept?: boolean;
}

/** Messages the page posts to React Native. */
export type PageMessage =
  | { kqr: 1; type: 'ready' }
  | { kqr: 1; type: 'scan'; result: WireResult }
  | { kqr: 1; type: 'reject'; result: WireResult; message?: string }
  | { kqr: 1; type: 'accept'; id: number; result: WireResult }
  | { kqr: 1; type: 'error'; code: ScanErrorCode; message: string }
  | { kqr: 1; type: 'close' }
  | { kqr: 1; type: 'slot'; slot: string; id?: string };

/** ScanResult with `bytes` as a plain array (JSON-safe). */
export type WireResult = Omit<ScanResult, 'bytes'> & { bytes: number[] };

export const fromWire = (r: WireResult): ScanResult => ({ ...r, bytes: Uint8Array.from(r.bytes) });

/** The script the page runs. Plain ES2017, uses only the public `KQRCode` global. */
export const BOOT = `(function () {
  var cfg = window.__KQR_CFG__ || {};
  var rn = window.ReactNativeWebView;
  function post(m) { m.kqr = 1; if (rn) rn.postMessage(JSON.stringify(m)); }
  function wire(r) { var o = {}; for (var k in r) o[k] = r[k]; o.bytes = Array.prototype.slice.call(r.bytes || []); return o; }
  if (!window.KQRCode) { post({ type: 'error', code: 'unsupported', message: 'kqrcode failed to load' }); return; }
  var el = document.createElement('kqr-scanner');
  var attrs = { theme: cfg.theme, locale: cfg.locale, heading: cfg.heading, facing: cfg.facing, success: cfg.success,
    torch: cfg.torch, 'zoom-control': cfg.zoomControl, 'max-zoom': cfg.maxZoom, 'super-resolution': cfg.superResolution,
    'onnx-runtime-url': cfg.onnxRuntimeUrl, formats: cfg.formats && cfg.formats.join(' ') };
  for (var a in attrs) if (attrs[a] !== undefined && attrs[a] !== null && attrs[a] !== '') el.setAttribute(a, String(attrs[a]));
  var flags = { continuous: cfg.continuous, 'keep-camera': cfg.keepCamera, 'no-auto-zoom': cfg.noAutoZoom,
    'no-gallery': cfg.noGallery, 'no-torch': cfg.noTorch, 'no-beep': cfg.noBeep, 'no-vibrate': cfg.noVibrate, 'no-close': cfg.noClose };
  for (var f in flags) if (flags[f]) el.setAttribute(f, '');
  if (cfg.labels) el.labels = cfg.labels;
  var vars = cfg.cssVars || {};
  for (var v in vars) el.style.setProperty(v, vars[v]);
  var slots = cfg.slots || {};
  for (var s in slots) {
    var d = document.createElement('div');
    d.setAttribute('slot', s);
    d.innerHTML = slots[s];
    d.addEventListener('click', (function (name) { return function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-kqr-id]') : null;
      post({ type: 'slot', slot: name, id: t ? t.getAttribute('data-kqr-id') : undefined });
    }; })(s));
    el.appendChild(d);
  }
  if (cfg.accept) {
    var pending = {}, next = 0;
    el.accept = function (r) {
      return new Promise(function (resolve) { var id = ++next; pending[id] = resolve; post({ type: 'accept', id: id, result: wire(r) }); });
    };
    window.__kqrAccept = function (id, verdict) { var p = pending[id]; delete pending[id]; if (p) p(verdict); };
  }
  el.addEventListener('ready', function () { post({ type: 'ready' }); });
  el.addEventListener('scan', function (e) { post({ type: 'scan', result: wire(e.detail) }); });
  el.addEventListener('reject', function (e) { post({ type: 'reject', result: wire(e.detail.result), message: e.detail.message }); });
  el.addEventListener('error', function (e) { var x = e.detail || {}; post({ type: 'error', code: x.code || 'unknown', message: x.message || String(x) }); });
  el.addEventListener('close', function () { post({ type: 'close' }); });
  window.__kqrCall = function (method, arg) { if (typeof el[method] === 'function') el[method](arg); };
  // App sent to the background: release the camera (privacy indicator off, other apps can use it)
  // and reopen it on return – unless a result is showing, then resume() reopens it.
  var resumeOnActive = false;
  window.__kqrApp = function (active) {
    if (!active) { resumeOnActive = el.active && !el.hasAttribute('found'); if (el.active) el.stop(); }
    else if (resumeOnActive) { resumeOnActive = false; el.start(); }
  };
  document.body.appendChild(el);
})();`;

/** JSON that is safe inside an inline <script>. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
/** JS source that is safe inside an inline <script>. */
const scriptJs = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const attrUrl = (u: string) => u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The WebView page. `runtime` is the self-contained kqrcode build (engine included, works offline);
 * pass `scriptUrl` instead to load kqrcode.global.js from a URL (CDN or your server).
 */
export function buildPage(cfg: PageConfig, src: { runtime: string } | { scriptUrl: string }): string {
  const lib = 'scriptUrl' in src ? `<script src="${attrUrl(src.scriptUrl)}"></script>` : `<script>${scriptJs(src.runtime)}</script>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>html,body{margin:0;height:100%;overflow:hidden;background:${cfg.cssVars?.['--kqr-bg'] ? 'var(--kqr-bg)' : '#000'};-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}</style>
</head><body><script>window.__KQR_CFG__=${scriptJson(cfg)};</script>${lib}<script>${BOOT}</script></body></html>`;
}

/** JavaScript to inject that answers an `accept` request. */
export const acceptReply = (id: number, verdict: true | false | string) => `window.__kqrAccept&&window.__kqrAccept(${id},${scriptJson(verdict)});true;`;
/** JavaScript to inject when the app goes to the background (false) or comes back (true). */
export const appStateScript = (active: boolean) => `window.__kqrApp&&window.__kqrApp(${active});true;`;
/** JavaScript to inject that calls an element method (resume, close, toggleTorch, pickImage, start, stop). */
export const callScript = (method: string, arg?: unknown) => `window.__kqrCall&&window.__kqrCall(${scriptJson(method)}${arg === undefined ? '' : ',' + scriptJson(arg)});true;`;

export function parseMessage(data: string): PageMessage | null {
  try {
    const m = JSON.parse(data);
    return m && m.kqr === 1 && typeof m.type === 'string' ? (m as PageMessage) : null;
  } catch {
    return null;
  }
}

export interface BridgeCallbacks {
  onScan?: (result: ScanResult) => void;
  onReject?: (result: ScanResult, message?: string) => void;
  onError?: (error: ScanError) => void;
  onClose?: () => void;
  onReady?: () => void;
  onSlotPress?: (slot: string, id?: string) => void;
  accept?: (result: ScanResult) => AcceptVerdict | Promise<AcceptVerdict>;
}

/** Normalise what `accept` returned (same rules as the web scanner). */
async function verdictOf(fn: BridgeCallbacks['accept'], r: ScanResult): Promise<true | false | string> {
  if (!fn) return true;
  try {
    const v = await fn(r);
    if (v === undefined || v === true) return true;
    return typeof v === 'string' ? v : false;
  } catch {
    return false;
  }
}

/** Builds a ScanError-like object without importing the DOM-side class. */
function scanError(code: ScanErrorCode, message: string): ScanError {
  const e = new Error(message) as ScanError;
  e.name = 'ScanError';
  (e as { code: ScanErrorCode }).code = code;
  return e;
}

/** Turns one WebView message into callbacks. `inject` runs JavaScript in the page. */
export async function handleMessage(data: string, cb: BridgeCallbacks, inject: (js: string) => void): Promise<void> {
  const m = parseMessage(data);
  if (!m) return;
  switch (m.type) {
    case 'ready': cb.onReady?.(); break;
    case 'scan': cb.onScan?.(fromWire(m.result)); break;
    case 'reject': cb.onReject?.(fromWire(m.result), m.message); break;
    case 'error': cb.onError?.(scanError(m.code, m.message)); break;
    case 'close': cb.onClose?.(); break;
    case 'slot': cb.onSlotPress?.(m.slot, m.id); break;
    case 'accept': inject(acceptReply(m.id, await verdictOf(cb.accept, fromWire(m.result)))); break;
  }
}
