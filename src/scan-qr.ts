/**
 * One-liner API:  const { text } = await scanQR({ theme: 'alipay', locale: 'lo' });
 * Opens the full-screen scanner, resolves with the first code, cleans up after itself.
 * Rejects with ScanError (camera problems) or DOMException 'AbortError' (user closed / signal aborted).
 */
import { defineScannerElement, TAG_NAME, type KQRScannerElement, type ScannerLabels, type ScannerTheme } from './element';
import type { AcceptFn, ScanResult } from './scanner';
import type { QRFormat } from './formats';

export interface ScanQROptions {
  theme?: ScannerTheme;
  locale?: string;
  /** Text in the top bar, e.g. "Scan to pay". */
  heading?: string;
  labels?: Partial<ScannerLabels>;
  facing?: 'environment' | 'user';
  /** 'js' (default) | 'webgpu' | 'off' */
  superResolution?: 'js' | 'webgpu' | 'off';
  onnxRuntimeUrl?: string;
  /** 'dot' (default) | 'box' | 'none' */
  success?: 'dot' | 'box' | 'none';
  /** 'auto' (show when dark, default) | 'always' | 'never' */
  torch?: 'auto' | 'always' | 'never';
  zoomControl?: 'slider' | 'none';
  /** 'bar': flashlight left, big album button center, slot actions-right free. Default: classic layout. */
  layout?: 'default' | 'bar';
  gallery?: boolean;
  beep?: boolean;
  vibrate?: boolean;
  autoZoom?: boolean;
  maxZoom?: number;
  /** CSS custom properties, e.g. { '--kqr-accent': '#e60012' } */
  style?: Record<string, string>;
  /** Extra UI: { 'actions-left': myCodeButton, footer: tabs } – nodes or HTML strings. */
  slots?: Record<string, Node | string>;
  /** Mount point (default document.body). Pass an element + inline:true to embed. */
  container?: HTMLElement;
  inline?: boolean;
  signal?: AbortSignal;
  /** QR-family members to read. Default: all – 'qr_code', 'micro_qr_code', 'rm_qr_code'. */
  formats?: QRFormat[];
  /**
   * Check a code before scanQR() resolves with it: true (or nothing) accepts, false ignores it and
   * keeps scanning, a string ignores it and shows that string. May be async.
   */
  accept?: AcceptFn;
  /** Called for every code `accept` turned down. */
  onReject?: (result: ScanResult, message?: string) => void;
}

export function scanQR(o: ScanQROptions = {}): Promise<ScanResult> {
  defineScannerElement();
  return new Promise((resolve, reject) => {
    const el = document.createElement(TAG_NAME) as KQRScannerElement;
    const set = (k: string, v: string | number | boolean | undefined) => {
      if (v === undefined || v === false) return;
      el.setAttribute(k, v === true ? '' : String(v));
    };
    set('theme', o.theme); set('locale', o.locale); set('heading', o.heading); set('facing', o.facing);
    set('super-resolution', o.superResolution); set('onnx-runtime-url', o.onnxRuntimeUrl); set('success', o.success);
    set('torch', o.torch); set('zoom-control', o.zoomControl); set('layout', o.layout); set('max-zoom', o.maxZoom); set('inline', o.inline);
    set('no-gallery', o.gallery === false); set('no-beep', o.beep === false); set('no-vibrate', o.vibrate === false);
    set('no-auto-zoom', o.autoZoom === false); set('formats', o.formats?.join(' '));
    if (o.accept) el.accept = o.accept;
    if (o.labels) el.labels = o.labels;
    for (const [k, v] of Object.entries(o.style ?? {})) el.style.setProperty(k, v);
    for (const [slot, content] of Object.entries(o.slots ?? {})) {
      let node: Node;
      if (typeof content === 'string') { const d = document.createElement('div'); d.innerHTML = content; node = d; } else node = content;
      if (node instanceof Element) node.setAttribute('slot', slot);
      else { const w = document.createElement('div'); w.setAttribute('slot', slot); w.appendChild(node); node = w; }
      el.appendChild(node);
    }
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      o.signal?.removeEventListener('abort', onAbort);
      el.remove();
      fn();
    };
    const onAbort = () => finish(() => reject(new DOMException('Scan aborted', 'AbortError')));
    if (o.signal?.aborted) return onAbort();
    o.signal?.addEventListener('abort', onAbort);
    el.addEventListener('reject', (e) => {
      const d = (e as CustomEvent<{ result: ScanResult; message?: string }>).detail;
      o.onReject?.(d.result, d.message);
    });
    el.addEventListener('scan', (e) => finish(() => resolve((e as CustomEvent<ScanResult>).detail)));
    el.addEventListener('close', () => {
      if (done) el.remove(); // closed after an error was already reported
      else finish(() => reject(new DOMException('Scanner closed', 'AbortError')));
    });
    el.addEventListener('error', (e) => {
      const err = (e as unknown as CustomEvent).detail;
      // keep the element up so the user sees the message; reject so the caller can react
      if (!done) { done = true; o.signal?.removeEventListener('abort', onAbort); reject(err); }
    });
    (o.container ?? document.body).appendChild(el);
  });
}
