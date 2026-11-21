/**
 * Svelte / SvelteKit action – no Svelte dependency, SSR-safe (actions only run in the browser).
 *
 *   <script>
 *     import { qrScanner } from 'kqrcode/svelte';
 *     let open = false;
 *   </script>
 *   {#if open}
 *     <div use:qrScanner={{ locale: 'lo', onScan: (r) => { open = false; pay(r.text); }, onClose: () => (open = false) }}>
 *       <button data-slot="actions-left">My QR</button>   <!-- data-slot, not slot -->
 *     </div>
 *   {/if}
 *
 * Or use the tag directly (slot="…" is valid there):
 *   <kqr-scanner theme="alipay" onscan={(e) => pay(e.detail.text)}><button slot="footer">…</button></kqr-scanner>
 */
import { defineScannerElement, TAG_NAME, type KQRScannerElement, type ScannerLabels, type ScannerTheme } from './element';
import type { AcceptFn, ScanError, ScanResult } from './scanner';
import type { QRFormat } from './formats';

export interface QRScannerActionOptions {
  onScan?: (r: ScanResult) => void;
  onError?: (e: ScanError) => void;
  onClose?: () => void;
  onReady?: () => void;
  onReject?: (r: ScanResult, message?: string) => void;
  /** true (or nothing) accepts, false ignores the code, a string ignores it and shows the string. May be async. */
  accept?: AcceptFn;
  /** QR-family members to read. Default: all – 'qr_code', 'micro_qr_code', 'rm_qr_code'. */
  formats?: QRFormat[];
  facing?: 'environment' | 'user';
  locale?: string;
  continuous?: boolean;
  inline?: boolean;
  maxZoom?: number;
  noAutoZoom?: boolean;
  noGallery?: boolean;
  noTorch?: boolean;
  noBeep?: boolean;
  noVibrate?: boolean;
  /** 'js' (default) | 'webgpu' | 'off' */
  superResolution?: 'js' | 'webgpu' | 'off';
  labels?: Partial<ScannerLabels>;
  theme?: ScannerTheme;
  heading?: string;
  success?: 'dot' | 'box' | 'none';
  torch?: 'auto' | 'always' | 'never';
  zoomControl?: 'slider' | 'none';
  /** CSS variables, e.g. { '--kqr-accent': '#e60012' } */
  style?: Record<string, string>;
}

const FLAGS: [keyof QRScannerActionOptions, string][] = [
  ['continuous', 'continuous'], ['inline', 'inline'], ['noAutoZoom', 'no-auto-zoom'], ['noGallery', 'no-gallery'],
  ['noTorch', 'no-torch'], ['noBeep', 'no-beep'], ['noVibrate', 'no-vibrate'],
];

function applyAttrs(el: KQRScannerElement, o: QRScannerActionOptions) {
  for (const [k, attr] of FLAGS) o[k] ? el.setAttribute(attr, '') : el.removeAttribute(attr);
  for (const [k, attr] of [['facing', 'facing'], ['locale', 'locale'], ['maxZoom', 'max-zoom'], ['superResolution', 'super-resolution'], ['theme', 'theme'], ['heading', 'heading'], ['success', 'success'], ['torch', 'torch'], ['zoomControl', 'zoom-control']] as const) {
    const v = o[k];
    v !== undefined && v !== null ? el.setAttribute(attr, String(v)) : el.removeAttribute(attr);
  }
  o.formats?.length ? el.setAttribute('formats', o.formats.join(' ')) : el.removeAttribute('formats');
  el.labels = o.labels ?? {};
  for (const [k, v] of Object.entries(o.style ?? {})) el.style.setProperty(k, v);
}

export function qrScanner(node: HTMLElement, options: QRScannerActionOptions = {}) {
  defineScannerElement();
  let opts = options;
  const el = document.createElement(TAG_NAME) as KQRScannerElement;
  applyAttrs(el, opts);
  const on = (type: string, fn: (e: Event) => void) => el.addEventListener(type, fn);
  on('scan', (e) => opts.onScan?.((e as CustomEvent<ScanResult>).detail));
  on('error', (e) => opts.onError?.((e as CustomEvent<ScanError>).detail));
  on('close', () => opts.onClose?.());
  on('ready', () => opts.onReady?.());
  on('reject', (e) => {
    const d = (e as CustomEvent<{ result: ScanResult; message?: string }>).detail;
    opts.onReject?.(d.result, d.message);
  });
  el.accept = (r) => (opts.accept ? opts.accept(r) : true);
  // Svelte 5 forbids slot="…" outside custom elements, so children use data-slot="…" instead
  for (const child of [...node.children] as HTMLElement[]) {
    const slot = child.dataset.slot ?? child.getAttribute('slot');
    if (slot) { child.setAttribute('slot', slot); el.appendChild(child); }
  }
  node.appendChild(el);
  return {
    update(next: QRScannerActionOptions) {
      opts = next;
      applyAttrs(el, next);
    },
    destroy() {
      el.remove(); // disconnectedCallback stops the camera
    },
  };
}
