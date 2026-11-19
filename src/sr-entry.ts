/** kpay-qr-scanner/sr – WeChat super-resolution model for your own pipelines (not needed for the scanner). */
export { superResolve, superResolveRGBA } from './sr';
export { createOnnxSuperRes, jsSuperRes, srModelBytes } from './sr-providers';
export type { OrtLike, OrtSession } from './sr-providers';
export type { SuperRes } from './engine';
