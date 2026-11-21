/**
 * k-qr-scanner/react-native – the kqrcode scanner for React Native (iOS + Android, Expo included).
 *
 *   import { QRScanner } from 'k-qr-scanner/react-native';
 *   <QRScanner style={{ flex: 1 }} locale="lo" onScan={(r) => pay(r.text)} onClose={() => setOpen(false)} />
 *
 * React Native has no DOM, camera API or WebAssembly in JavaScript, so the scanner runs in a
 * react-native-webview: the same engine, UI, themes, auto-zoom and QR formats as on the web. The
 * engine is bundled with the component, so it works offline. Needs `react-native-webview` ≥ 13,
 * iOS 14.5+ / Android 7+, and the camera permission entry (Expo: add the "k-qr-scanner" config plugin;
 * bare apps: `npx k-qr-scanner init` writes it). The component asks for the Android runtime permission
 * itself, releases the camera while the app is in the background and recovers if the WebView
 * process is killed.
 */
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { AppState, PermissionsAndroid, Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import runtime from './rn-runtime.generated';
import * as engineModule from './worker-source.generated';
import { appStateScript, buildPage, callScript, handleMessage, type BridgeCallbacks, type PageConfig } from './rn-bridge';
import type { AcceptFn, ScanError, ScanResult } from './scanner';
import type { ScannerLabels, ScannerTheme } from './element';
import type { QRFormat } from './formats';

export type { ScanResult, ScanError, AcceptFn, QRFormat, ScannerLabels, ScannerTheme };
export { parseEMV, acceptEMV, emvCRC } from './emv';
export type { EMVQR, EMVAccount, EMVAdditionalData, AcceptEMVOptions } from './emv';

export interface QRScannerProps {
  onScan?: (result: ScanResult) => void;
  /** A code was turned down by `accept`. */
  onReject?: (result: ScanResult, message?: string) => void;
  onError?: (error: ScanError) => void;
  /** The ✕ button was pressed – unmount the scanner. */
  onClose?: () => void;
  /** The camera is running. */
  onReady?: () => void;
  /** An element inside `slots` was tapped; `id` is its `data-kqr-id` attribute. */
  onSlotPress?: (slot: string, id?: string) => void;
  /**
   * Check a code before onScan fires: true (or nothing) accepts, false ignores it and keeps
   * scanning, a string ignores it and shows that string. May be async (e.g. ask your server).
   */
  accept?: AcceptFn;
  /** QR-family members to read. Default: all – 'qr_code', 'micro_qr_code', 'rm_qr_code'. */
  formats?: QRFormat[];
  theme?: ScannerTheme;
  locale?: 'en' | 'lo' | 'zh' | (string & {});
  heading?: string;
  labels?: Partial<ScannerLabels>;
  facing?: 'environment' | 'user';
  continuous?: boolean;
  /** Keep the camera running after a result (call `resume()` to scan again). */
  keepCamera?: boolean;
  success?: 'dot' | 'box' | 'none';
  torch?: 'auto' | 'always' | 'never';
  zoomControl?: 'slider' | 'none';
  /** 'bar': flashlight left, big album button center, slot actions-right free. Default: classic layout. */
  layout?: 'default' | 'bar';
  maxZoom?: number;
  superResolution?: 'js' | 'webgpu' | 'off';
  noAutoZoom?: boolean;
  noGallery?: boolean;
  noTorch?: boolean;
  noBeep?: boolean;
  noVibrate?: boolean;
  noClose?: boolean;
  /** CSS variables for the scanner UI, e.g. { '--kqr-accent': '#e60012' } */
  cssVars?: Record<string, string>;
  /**
   * Extra UI inside the scanner as HTML strings (React Native views cannot be placed in a WebView):
   * { 'actions-left': '<button data-kqr-id="mine">My QR</button>' } – taps arrive in onSlotPress.
   */
  slots?: Record<string, string>;
  /**
   * Load kqrcode.global.js from this URL (CDN or your server) instead of the bundled copy, e.g. to
   * pin another version. Needs network; kqrcode.engine.js must sit next to it.
   */
  scriptUrl?: string;
  /** Style of the WebView. Default: { flex: 1, backgroundColor: '#000' } */
  style?: StyleProp<ViewStyle>;
  /** Extra props for the underlying react-native-webview. */
  webViewProps?: Partial<ComponentProps<typeof WebView>>;
}

/** Methods on the component ref. */
export interface QRScannerHandle {
  /** Scan again after a result (with keepCamera / continuous). */
  resume(): void;
  start(): void;
  stop(): void;
  /** Stop the camera and fire onClose. */
  close(): void;
  toggleTorch(on?: boolean): void;
  /** Open the photo picker. */
  pickImage(): void;
}

/**
 * The engine source from the shared dist/kqrcode.engine.js (an ES module). Depending on the bundler's
 * interop, `default` is the string itself or the module object that holds it.
 */
const engineDefault = (engineModule as unknown as { default: string | { default: string } }).default;
const engine: string = typeof engineDefault === 'string' ? engineDefault : engineDefault.default;

/** Origin of the page. https makes it a secure context, which getUserMedia requires. */
const BASE_URL = 'https://kqrcode.local/';

const BLACK = { flex: 1, backgroundColor: '#000' };
declare const __DEV__: boolean | undefined;

/** Android: ask for the camera before the page does, so the WebView gets it without a second prompt. */
async function androidCamera(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const p = PermissionsAndroid.PERMISSIONS.CAMERA;
    if (!(await PermissionsAndroid.check(p))) await PermissionsAndroid.request(p);
  } catch { /* the page reports permission-denied itself */ }
}

export const QRScanner = forwardRef<QRScannerHandle, QRScannerProps>(function QRScanner(props, ref) {
  const web = useRef<{ injectJavaScript(js: string): void } | null>(null);
  const cb = useRef<BridgeCallbacks>(props);
  cb.current = props;
  const inject = (js: string) => web.current?.injectJavaScript(js);
  // iOS asks for the camera from inside the WebView; Android needs the runtime permission first.
  const [allowed, setAllowed] = useState(Platform.OS !== 'android');
  // Bumped to remount the WebView after the OS killed its content process.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let live = true;
    if (!allowed) void androidCamera().then(() => live && setAllowed(true));
    // Only 'background' – iOS reports 'inactive' while its own permission dialog is up.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'active') inject(appStateScript(s === 'active'));
    });
    return () => { live = false; sub.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg: PageConfig = {
    theme: props.theme, locale: props.locale, heading: props.heading, facing: props.facing, continuous: props.continuous,
    keepCamera: props.keepCamera, success: props.success, torch: props.torch, zoomControl: props.zoomControl, layout: props.layout,
    maxZoom: props.maxZoom, superResolution: props.superResolution, formats: props.formats, noAutoZoom: props.noAutoZoom,
    noGallery: props.noGallery, noTorch: props.noTorch, noBeep: props.noBeep, noVibrate: props.noVibrate,
    noClose: props.noClose, labels: props.labels, cssVars: props.cssVars, slots: props.slots, accept: !!props.accept,
  };
  // Rebuild (and reload) the page only when the configuration really changes.
  const key = JSON.stringify(cfg) + '|' + (props.scriptUrl ?? '');
  const html = useMemo(
    () => buildPage(cfg, props.scriptUrl ? { scriptUrl: props.scriptUrl } : { runtime, engine }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useImperativeHandle(ref, () => {
    const call = (m: string, arg?: unknown) => inject(callScript(m, arg));
    return {
      resume: () => call('resume'),
      start: () => call('start'),
      stop: () => call('stop'),
      close: () => call('close'),
      toggleTorch: (on?: boolean) => call('toggleTorch', on),
      pickImage: () => call('pickImage'),
    };
  }, []);

  const style = [BLACK, props.style];
  if (!allowed) return createElement(View as never, { style });
  const restart = () => setGeneration((g) => g + 1);
  return createElement(WebView as never, {
    key: generation,
    ref: web,
    source: { html, baseUrl: BASE_URL },
    originWhitelist: ['*'],
    // camera inside the page
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    mediaCapturePermissionGrantType: 'grant',
    // a fixed, full-bleed surface (the page lays out around the notch itself)
    scrollEnabled: false,
    bounces: false,
    overScrollMode: 'never',
    automaticallyAdjustContentInsets: false,
    contentInsetAdjustmentBehavior: 'never',
    setBuiltInZoomControls: false,
    allowsBackForwardNavigationGestures: false,
    allowsLinkPreview: false,
    setSupportMultipleWindows: false,
    textInteractionEnabled: false,
    // inspect the page from Safari / chrome://inspect in development builds
    webviewDebuggingEnabled: typeof __DEV__ !== 'undefined' && !!__DEV__,
    // the OS may kill the WebView process under memory pressure: start over instead of a black screen
    onContentProcessDidTerminate: restart,
    onRenderProcessGone: restart,
    style,
    containerStyle: { backgroundColor: '#000' },
    ...props.webViewProps,
    onMessage: (e: { nativeEvent: { data: string } }) => {
      void handleMessage(e.nativeEvent.data, cb.current, inject);
      (props.webViewProps?.onMessage as ((ev: unknown) => void) | undefined)?.(e);
    },
  });
});
