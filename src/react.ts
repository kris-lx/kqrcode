import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { defineScannerElement, TAG_NAME, type KpayQRScannerElement, type ScannerLabels, type ScannerTheme } from './element';
import type { ScanError, ScanResult } from './scanner';

export interface QRScannerProps {
  onScan?: (result: ScanResult) => void;
  onError?: (error: ScanError) => void;
  onClose?: () => void;
  onReady?: () => void;
  facing?: 'environment' | 'user';
  continuous?: boolean;
  inline?: boolean;
  noAutoZoom?: boolean;
  noGallery?: boolean;
  noTorch?: boolean;
  noBeep?: boolean;
  noVibrate?: boolean;
  maxZoom?: number;
  /** WeChat CNN super-resolution: 'js' (default) | 'webgpu' | 'off' */
  superResolution?: 'js' | 'webgpu' | 'off';
  locale?: 'en' | 'lo' | 'zh' | (string & {});
  labels?: Partial<ScannerLabels>;
  /** 'wechat' (default) | 'alipay' | 'frame' | 'grid' | 'none' */
  theme?: ScannerTheme;
  /** Text in the top bar */
  heading?: string;
  /** 'dot' (default) | 'box' | 'none' */
  success?: 'dot' | 'box' | 'none';
  /** 'auto' (show when dark, default) | 'always' | 'never' */
  torch?: 'auto' | 'always' | 'never';
  zoomControl?: 'slider' | 'none';
  noClose?: boolean;
  /** Slotted children: <button slot="actions-left">My QR</button>, <nav slot="footer">…</nav> */
  children?: ReactNode;
  /** style also accepts CSS variables: {{ '--kqr-accent': '#e60012' }} */
  style?: CSSProperties & Record<`--${string}`, string | number>;
  className?: string;
}

/**
 * <QRScanner onScan={r => …} />  – full-screen by default; unmount it to close.
 * Works with React 17/18/19, Next.js (use in a client component), Remix, Vite, CRA.
 */
export const QRScanner = forwardRef<KpayQRScannerElement | null, QRScannerProps>(function QRScanner(props, ref) {
  const el = useRef<KpayQRScannerElement | null>(null);
  useImperativeHandle(ref, () => el.current as KpayQRScannerElement);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    defineScannerElement();
    const node = el.current;
    if (!node) return;
    const scan = (e: Event) => cb.current.onScan?.((e as CustomEvent<ScanResult>).detail);
    const err = (e: Event) => cb.current.onError?.((e as CustomEvent<ScanError>).detail);
    const close = () => cb.current.onClose?.();
    const ready = () => cb.current.onReady?.();
    node.addEventListener('scan', scan);
    node.addEventListener('error', err);
    node.addEventListener('close', close);
    node.addEventListener('ready', ready);
    return () => {
      node.removeEventListener('scan', scan);
      node.removeEventListener('error', err);
      node.removeEventListener('close', close);
      node.removeEventListener('ready', ready);
    };
  }, []);

  useEffect(() => {
    if (el.current) el.current.labels = props.labels ?? {};
  }, [props.labels]);

  const attrs: Record<string, unknown> = {
    ref: el, style: props.style, class: props.className,
    facing: props.facing, locale: props.locale, 'max-zoom': props.maxZoom, 'super-resolution': props.superResolution,
    theme: props.theme, heading: props.heading, success: props.success, torch: props.torch, 'zoom-control': props.zoomControl,
  };
  const flags: [string, boolean | undefined][] = [
    ['continuous', props.continuous], ['inline', props.inline], ['no-auto-zoom', props.noAutoZoom],
    ['no-gallery', props.noGallery], ['no-close', props.noClose], ['no-torch', props.noTorch], ['no-beep', props.noBeep], ['no-vibrate', props.noVibrate],
  ];
  for (const [k, v] of flags) if (v) attrs[k] = '';
  return createElement(TAG_NAME, attrs, props.children);
});
