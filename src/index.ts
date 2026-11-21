export { QRScanner, ScanError } from './scanner';
export type { ScanResult, ScannerOptions, ScannerEvents, ScanErrorCode, AcceptFn, AcceptVerdict } from './scanner';
export { KQRScannerElement, defineScannerElement, LABELS, TAG_NAME, THEME_VARS } from './element';
export type { ScannerLabels, ScannerTheme } from './element';
export { scanQR } from './scan-qr';
export type { ScanQROptions } from './scan-qr';
export type { QRHint, Point } from './engine';
export { QR_FORMATS, type QRFormat } from './formats';
export { AutoZoom } from './autozoom';

import { defineScannerElement } from './element';
// Registering is a no-op on the server, so importing this in SSR code is safe.
defineScannerElement();
export type { SuperRes } from './engine';
