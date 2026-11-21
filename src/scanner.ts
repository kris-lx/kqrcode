import type { AnalyzeOptions, AnalyzeResult, Point, QRFormat, QRHint } from './engine';
import { AutoZoom } from './autozoom';
import { engineHost, type Frame } from './engine-host';

export type ScanErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-busy'
  | 'unknown';

export class ScanError extends Error {
  constructor(public code: ScanErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ScanError';
  }
}

export interface ScanResult {
  text: string;
  bytes: Uint8Array;
  /** Corners TL,TR,BR,BL in *video* pixel coordinates (empty for gallery images). */
  corners: Point[];
  /** 'qr_code' (QR Code Model 1/2) | 'micro_qr_code' | 'rm_qr_code' (rMQR) */
  format: QRFormat;
  /** Symbol version: '1'…'40', 'M1'…'M4', 'R13x27'… (empty when the decoder does not report it). */
  version: string;
  /** Error-correction level 'L' | 'M' | 'Q' | 'H' (empty when unknown). */
  ecLevel: string;
  zoom: number;
  timestamp: number;
  source: 'camera' | 'image';
}

/**
 * What `accept` returns:
 *  - `true` (or nothing)  accept the code: `result` fires and the scanner stops / pauses
 *  - `false`              ignore it and keep scanning
 *  - a string             ignore it, keep scanning, and show the string as a message
 * A thrown error or rejected promise counts as `false`.
 */
export type AcceptVerdict = boolean | string | void | undefined;
export type AcceptFn = (result: ScanResult) => AcceptVerdict | Promise<AcceptVerdict>;

export interface ScannerOptions {
  video: HTMLVideoElement;
  facingMode?: 'environment' | 'user';
  deviceId?: string;
  /** Automatically zoom in on far codes (default true). */
  autoZoom?: boolean;
  /** Upper bound for zoom (default 8 hardware / 4 digital). */
  maxZoom?: number;
  continuous?: boolean;
  /** Longest side of analysed frames, default 1920. */
  maxFrameSide?: number;
  /**
   * When the browser has no hardware zoom (iOS Safari, desktop) ask for a 4K stream and
   * zoom digitally on real sensor pixels. Default true.
   */
  hiRes?: boolean;
  /**
   * WeChat CNN super-resolution for small/blurry codes.
   *  'js'     – built-in float32 kernel in the worker (default, no download)
   *  'webgpu' – ONNX Runtime Web with WebGPU (falls back to its WASM backend, then to 'js')
   *  false    – off
   */
  superResolution?: 'js' | 'webgpu' | false;
  /** UMD build of onnxruntime-web used for superResolution: 'webgpu'. Self-host it if you prefer. */
  onnxRuntimeUrl?: string;
  /**
   * QR-family members to read. Default: all of them – QR Code (Model 1 and 2), Micro QR and rMQR.
   * The jsQR fallback (strict CSP, no WebAssembly) reads QR Code only.
   */
  formats?: QRFormat[];
  /**
   * Check a decoded code before it counts as the result, e.g. only accept your own payment QR.
   * Rejected codes are ignored while they stay in view; scanning continues. May be async.
   */
  accept?: AcceptFn;
}

export interface ScannerEvents {
  result: ScanResult;
  error: ScanError;
  /** `digital`: zoom is simulated (CSS transform on the video + cropped analysis). */
  zoom: { zoom: number; min: number; max: number; auto: boolean; digital: boolean };
  hint: { hint: QRHint | null; decoded: boolean; videoWidth: number; videoHeight: number };
  dark: boolean;
  /** `accept` turned a code down; `message` is the string it returned, if any. */
  reject: { result: ScanResult; message?: string };
}

type Listener<T> = (e: T) => void;

interface NativeDetector {
  detect(src: ImageBitmapSource): Promise<{ rawValue: string; cornerPoints: Point[] }[]>;
}

interface Crop { x: number; y: number; w: number; h: number }
type Grabbed = Frame & { src: ImageBitmapSource };

const nextFrame = (v: HTMLVideoElement): Promise<void> =>
  new Promise((res) => {
    const anyV = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (anyV.requestVideoFrameCallback) {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      anyV.requestVideoFrameCallback(fin);
      setTimeout(fin, 100); // paused / background tabs
    } else requestAnimationFrame(() => res());
  });

const asFrame = (g: Grabbed): Frame =>
  'bitmap' in g ? { bitmap: g.bitmap } : { pixels: g.pixels, width: g.width, height: g.height };

export class QRScanner {
  readonly video: HTMLVideoElement;
  private opts: Required<Omit<ScannerOptions, 'video' | 'deviceId' | 'formats' | 'accept'>> &
    { deviceId?: string; formats?: QRFormat[]; accept?: AcceptFn };
  private listeners: Partial<Record<keyof ScannerEvents, Set<Listener<any>>>> = {};

  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private running = false;
  private paused = false;
  private loopToken = 0;

  /** holding a reference on the shared decoding worker */
  private engine = false;
  private useBitmap = typeof OffscreenCanvas !== 'undefined';
  private grabCanvas: HTMLCanvasElement | null = null;
  private native: NativeDetector | null = null;

  private frame = 0;
  private lastHint: { hint: QRHint; at: number } | null = null; // video px
  private zoomCtl = new AutoZoom();
  private zoomRange = { min: 1, max: 1 };
  private zoomValue = 1;
  private digital = false;
  private lastText = '';
  private lastTextAt = 0;
  /** text → time until which `accept` is not asked again (refreshed while the code stays in view) */
  private rejected = new Map<string, number>();
  private lumaEma = 128;
  private darkState = false;
  private onVisibility = () => {
    this.paused = document.hidden;
    // iOS ends the camera track when the app or tab is backgrounded; reopen it on return.
    if (!document.hidden && this.running && this.track?.readyState === 'ended') {
      this.stop();
      void this.start().catch(() => {});
    }
  };

  constructor(options: ScannerOptions) {
    this.video = options.video;
    this.opts = {
      facingMode: 'environment',
      autoZoom: true,
      maxZoom: 8,
      continuous: false,
      maxFrameSide: 1920,
      hiRes: true,
      superResolution: 'js',
      onnxRuntimeUrl: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.js',
      ...options,
    };
    this.opts.deviceId = options.deviceId;
  }

  /* ---------------- events ---------------- */

  on<K extends keyof ScannerEvents>(type: K, fn: Listener<ScannerEvents[K]>): () => void {
    const set = (this.listeners[type] ??= new Set()) as Set<Listener<ScannerEvents[K]>>;
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit<K extends keyof ScannerEvents>(type: K, e: ScannerEvents[K]) {
    (this.listeners[type] as Set<Listener<ScannerEvents[K]>> | undefined)?.forEach((fn) => fn(e));
  }

  /* ---------------- capabilities ---------------- */

  /**
   * Download the decoding engine and compile its WebAssembly now, so the first scan starts
   * instantly. Call it when your "Scan" button appears. Idempotent.
   */
  static preload(): Promise<void> {
    return engineHost.warm();
  }

  /** Free the shared decoding worker now instead of after the idle timeout. */
  static dispose(): void {
    engineHost.dispose();
  }

  /** How long (ms) the shared worker stays warm after the last scanner stops. Default 30 000. */
  static get engineIdleTimeout(): number { return engineHost.idleTimeout; }
  static set engineIdleTimeout(ms: number) { engineHost.idleTimeout = ms; }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }
  get zoom() { return this.zoomValue; }
  get zoomMin() { return this.zoomRange.min; }
  get zoomMax() { return this.zoomRange.max; }
  get canZoom() { return this.zoomRange.max > this.zoomRange.min * 1.05; }
  /** true when zoom is simulated on the video (no hardware zoom API). */
  get isDigitalZoom() { return this.digital; }
  /** Which super-resolution backend the worker ended up with: js | onnx-webgpu | onnx-wasm | off */
  get superResolutionBackend() { return engineHost.srBackend; }
  get canTorch() {
    const c = this.track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return !!c?.torch;
  }

  /* ---------------- lifecycle ---------------- */

  async start(): Promise<void> {
    if (this.running) return;
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      throw this.fail(new ScanError('insecure-context', 'Camera needs HTTPS (or localhost).'));
    }
    if (!QRScanner.isSupported()) throw this.fail(new ScanError('unsupported', 'getUserMedia is not available.'));

    try {
      const video: MediaTrackConstraints = this.opts.deviceId
        ? { deviceId: { exact: this.opts.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : {
            facingMode: { ideal: this.opts.facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          };
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      throw this.fail(mapMediaError(e));
    }

    this.track = this.stream.getVideoTracks()[0];
    const v = this.video;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.srcObject = this.stream;
    try { await v.play(); } catch { /* autoplay quirks: frames still arrive */ }

    await Promise.all([this.tune(), this.setupDetectors()]);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.running = true;
    this.paused = false;
    const token = ++this.loopToken;
    void this.loop(token);
  }

  stop(): void {
    this.running = false;
    this.loopToken++;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.video.srcObject = null;
    this.video.style.transform = '';
    this.releaseEngine();
    this.lastHint = null;
    this.zoomValue = 1;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this.lastText = ''; this.rejected.clear(); }

  /** Change which QR-family members are read (takes effect on the next frame). */
  setFormats(formats: QRFormat[] | undefined) { this.opts.formats = formats?.length ? [...formats] : undefined; this.setupNative(); }

  /** Replace the `accept` callback. */
  setAccept(fn: AcceptFn | undefined) { this.opts.accept = fn; this.rejected.clear(); }

  async switchCamera(): Promise<void> {
    this.opts.facingMode = this.opts.facingMode === 'environment' ? 'user' : 'environment';
    this.opts.deviceId = undefined;
    this.stop();
    await this.start();
  }

  /* ---------------- camera controls ---------------- */

  /** Set zoom (hardware when available, otherwise digital on real sensor pixels). */
  async setZoom(z: number, byUser = true): Promise<void> {
    if (!this.track || !this.canZoom) return;
    const zoom = Math.max(this.zoomRange.min, Math.min(this.zoomRange.max, z));
    const now = performance.now();
    if (byUser) this.zoomCtl.hold(now);
    this.zoomCtl.settle(now, this.digital ? 90 : 380);
    this.zoomValue = zoom;
    this.lastHint = null;
    this.emit('zoom', { zoom, min: this.zoomRange.min, max: this.zoomRange.max, auto: !byUser, digital: this.digital });
    if (this.digital) return;
    try {
      await this.track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
    } catch { /* device refused – ignore */ }
  }

  async setTorch(on: boolean): Promise<boolean> {
    if (!this.track || !this.canTorch) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }

  /** Tap-to-focus. x,y are normalised 0..1 in the video image. */
  async focusAt(x: number, y: number): Promise<void> {
    if (!this.track) return;
    this.zoomCtl.settle(performance.now(), 600);
    try {
      await this.track.applyConstraints({
        advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet],
      });
      setTimeout(() => {
        this.track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
      }, 1500);
    } catch { /* not supported (iOS) */ }
  }

  /**
   * Decode a still image (gallery pick). Tries several scales; returns null if nothing was found
   * or `accept` turned the code down (a `reject` event fires in that case).
   */
  async scanImage(src: Blob | ImageBitmap): Promise<ScanResult | null> {
    const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
    // camera not started (e.g. permission denied → user picks a photo): still use the WASM worker
    const temporary = !this.engine;
    if (temporary) await this.setupDetectors();
    try {
      const long = Math.max(bmp.width, bmp.height);
      const sizes = [...new Set([Math.min(long, 1600), Math.min(long, 1000), Math.min(long, 2600)])];
      for (const side of sizes) {
        const s = side / long;
        const w = Math.max(1, Math.round(bmp.width * s));
        const h = Math.max(1, Math.round(bmp.height * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const r = await this.analyzeFrame(
          { pixels: img.data.buffer, width: w, height: h }, { invert: true, thorough: true, formats: this.opts.formats },
        );
        if (r && r.text !== undefined) {
          const result = toResult(r, [], 1, 'image');
          const verdict = await this.check(result);
          if (verdict === true) return result;
          this.emit('reject', { result, message: verdict || undefined });
          return null;
        }
      }
      return null;
    } finally {
      if (src instanceof Blob) bmp.close();
      if (temporary && !this.running) this.releaseEngine();
    }
  }

  /* ---------------- internals ---------------- */

  private fail(err: ScanError) {
    this.emit('error', err);
    return err;
  }

  private async tune() {
    const t = this.track!;
    const caps = (t.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      zoom?: { min: number; max: number };
      focusMode?: string[];
    };
    if (caps.zoom && typeof caps.zoom.max === 'number') {
      this.digital = false;
      this.zoomRange = { min: caps.zoom.min ?? 1, max: Math.min(caps.zoom.max, this.opts.maxZoom) };
      this.zoomValue = ((t.getSettings() as { zoom?: number }).zoom ?? this.zoomRange.min) as number;
      this.zoomCtl = new AutoZoom({ settleMs: 380 });
    } else {
      // iOS Safari & co: no zoom API. Ask for a 4K stream and zoom digitally on real pixels.
      this.digital = true;
      if (this.opts.hiRes) {
        try {
          await t.applyConstraints({ width: { ideal: 3840 }, height: { ideal: 2160 } });
          await new Promise((r) => setTimeout(r, 250));
        } catch { /* keep 1080p */ }
      }
      const vw = this.video.videoWidth || 1920;
      const maxDigital = Math.min(this.opts.maxZoom, 4, Math.max(1.5, vw / 960));
      this.zoomRange = { min: 1, max: maxDigital };
      this.zoomValue = 1;
      this.zoomCtl = new AutoZoom({ settleMs: 120 });
    }
    if (caps.focusMode?.includes('continuous')) {
      try { await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }); } catch { /* */ }
    }
    this.emit('zoom', { zoom: this.zoomValue, min: this.zoomRange.min, max: this.zoomRange.max, auto: true, digital: this.digital });
  }

  private async setupDetectors() {
    // native detector: fastest where it exists (Android Chrome, macOS – not iOS Safari yet)
    this.setupNative();
    // shared, warm decoding worker (inline blob → works with every bundler)
    if (!this.engine) {
      const sr = this.opts.superResolution;
      this.engine = await engineHost.acquire({ sr: sr === false ? 'off' : sr, ortUrl: this.opts.onnxRuntimeUrl });
    }
  }

  private setupNative() {
    // The Barcode Detection API knows plain QR only; Micro QR / rMQR always go through ZXing.
    this.native = null;
    if (this.opts.formats && !this.opts.formats.includes('qr_code')) return;
    const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: object): NativeDetector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (BD) {
      BD.getSupportedFormats()
        .then((f) => { if (f.includes('qr_code')) this.native = new BD({ formats: ['qr_code'] }); })
        .catch(() => {});
    }
  }

  /** Ask `accept`: true = take it, false / string = turn it down. */
  private async check(result: ScanResult): Promise<true | false | string> {
    const fn = this.opts.accept;
    if (!fn) return true;
    try {
      const v = await fn(result);
      if (v === undefined || v === true) return true;
      return typeof v === 'string' ? v : false;
    } catch {
      return false;
    }
  }

  private releaseEngine() {
    if (this.engine) { this.engine = false; engineHost.release(); }
  }

  private async loop(token: number) {
    while (this.running && token === this.loopToken) {
      await nextFrame(this.video);
      if (!this.running || token !== this.loopToken) break;
      if (this.paused) continue;
      try {
        await this.step();
      } catch (e) {
        if (this.running && token === this.loopToken) this.emit('error', new ScanError('unknown', String(e)));
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  /** Copy a region of the video, scaled to tw×th, in whichever form the analyser wants. */
  private async grab(c: Crop, tw: number, th: number): Promise<Grabbed> {
    const v = this.video;
    if (this.useBitmap && this.engine && engineHost.alive) {
      try {
        const b = await createImageBitmap(v, c.x, c.y, c.w, c.h, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'low' });
        if (Math.abs(b.width - tw) <= 1) return { bitmap: b, src: b };
        b.close(); // Safari ignores resize options → use the canvas route from now on
      } catch { /* fall through */ }
      this.useBitmap = false;
    }
    const cv = (this.grabCanvas ??= document.createElement('canvas'));
    if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; }
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, c.x, c.y, c.w, c.h, 0, 0, tw, th);
    const img = ctx.getImageData(0, 0, tw, th);
    return { pixels: img.data.buffer, width: tw, height: th, src: img };
  }

  private async analyzeFrame(f: Frame, opts: AnalyzeOptions): Promise<AnalyzeResult | null> {
    if (this.engine && engineHost.alive) return engineHost.analyze(f, opts);
    // no worker (blocked by CSP): jsQR on the main thread – loaded only in this rare case
    const [{ analyze }, { jsqrDecoder }] = await Promise.all([import('./engine'), import('./decoder-jsqr')]);
    let img: { data: Uint8ClampedArray; width: number; height: number };
    if ('bitmap' in f) {
      const c = document.createElement('canvas');
      c.width = f.bitmap.width; c.height = f.bitmap.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(f.bitmap, 0, 0);
      f.bitmap.close();
      img = ctx.getImageData(0, 0, c.width, c.height);
    } else img = { data: new Uint8ClampedArray(f.pixels), width: f.width, height: f.height };
    return analyze(img, opts, jsqrDecoder);
  }

  private async step() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const now = performance.now();
    this.frame++;

    // region of the sensor we analyse: whole frame, or the centre crop for digital zoom
    const dz = this.digital ? this.zoomValue : 1;
    const crop: Crop = { w: vw / dz, h: vh / dz, x: 0, y: 0 };
    crop.x = (vw - crop.w) / 2;
    crop.y = (vh - crop.h) / 2;
    const s = Math.min(1, this.opts.maxFrameSide / Math.max(crop.w, crop.h)); // frame px per video px
    const tw = Math.max(2, Math.round(crop.w * s));
    const th = Math.max(2, Math.round(crop.h * s));
    const toVideo = (p: Point): Point => ({ x: crop.x + p.x / s, y: crop.y + p.y / s });
    const hintToFrame = (h: QRHint): QRHint => ({
      cx: (h.cx - crop.x) * s, cy: (h.cy - crop.y) * s, size: h.size * s, module: h.module * s, full: h.full,
    });

    const grabbed = await this.grab(crop, tw, th);
    let res: AnalyzeResult | null = null;

    if (this.native) {
      try {
        const codes = await this.native.detect(grabbed.src);
        if (codes.length && codes[0].rawValue) {
          const c = codes[0];
          const size = Math.hypot(c.cornerPoints[0].x - c.cornerPoints[1].x, c.cornerPoints[0].y - c.cornerPoints[1].y);
          res = {
            text: c.rawValue,
            bytes: new TextEncoder().encode(c.rawValue),
            corners: c.cornerPoints,
            hint: { cx: (c.cornerPoints[0].x + c.cornerPoints[2].x) / 2, cy: (c.cornerPoints[0].y + c.cornerPoints[2].y) / 2, size, module: size / 25, full: true },
            format: 'qr_code',
            version: '',
            ecLevel: '',
            luma: 128,
          };
        }
      } catch { this.native = null; }
    }

    if (res) {
      if ('bitmap' in grabbed) grabbed.bitmap.close();
    } else {
      const lh = this.lastHint && now - this.lastHint.at < 700 ? hintToFrame(this.lastHint.hint) : null;
      res = await this.analyzeFrame(asFrame(grabbed), {
        hint: lh, invert: this.frame % 6 === 5, thorough: this.frame % 5 === 0, formats: this.opts.formats,
      });
    }
    if (!this.running) return;

    // map to video pixel space
    const videoHint: QRHint | null = res?.hint
      ? { cx: crop.x + res.hint.cx / s, cy: crop.y + res.hint.cy / s, size: res.hint.size / s, module: res.hint.module / s, full: res.hint.full }
      : null;
    let corners: Point[] = res?.corners ? res.corners.map(toVideo) : [];

    // 2nd pass: code located but undecodable and we downscaled → re-grab that area at native resolution
    if (res && res.text === undefined && videoHint && s < 0.95 && videoHint.module < 5 / s) {
      const side = Math.min(Math.max(160, videoHint.size * 1.6), Math.min(vw, vh), 1400);
      const rc: Crop = {
        w: side, h: side,
        x: Math.max(0, Math.min(vw - side, videoHint.cx - side / 2)),
        y: Math.max(0, Math.min(vh - side, videoHint.cy - side / 2)),
      };
      const g2 = await this.grab(rc, Math.round(side), Math.round(side));
      const k = Math.min(3, Math.max(1, 4 / Math.max(1, videoHint.module)));
      const r2 = await this.analyzeFrame(asFrame(g2), { roiOnly: true, upscale: k, invert: this.frame % 3 === 0, formats: this.opts.formats });
      if (r2 && r2.text !== undefined && r2.corners) {
        res = { ...r2, hint: res.hint, luma: res.luma };
        corners = r2.corners.map((p) => ({ x: rc.x + p.x, y: rc.y + p.y }));
      }
    }
    if (!this.running) return;

    // luma → "too dark" hint (with hysteresis)
    if (res && res.luma) {
      this.lumaEma = this.lumaEma * 0.85 + res.luma * 0.15;
      const dark = this.darkState ? this.lumaEma < 70 : this.lumaEma < 45;
      if (dark !== this.darkState) { this.darkState = dark; this.emit('dark', dark); }
    }

    if (videoHint) this.lastHint = { hint: videoHint, at: now };
    const decoded = !!res && res.text !== undefined;
    this.emit('hint', { hint: videoHint, decoded, videoWidth: vw, videoHeight: vh });

    // auto zoom. For digital zoom the controller works in *view* coordinates (what the user sees).
    if (this.opts.autoZoom && this.canZoom && !decoded) {
      const z = this.zoomValue;
      const view = videoHint && this.digital
        ? {
            cx: (videoHint.cx - vw / 2) * z + vw / 2,
            cy: (videoHint.cy - vh / 2) * z + vh / 2,
            size: videoHint.size * z, module: videoHint.module * z, full: videoHint.full,
          }
        : videoHint;
      const next = this.zoomCtl.update({
        now, zoom: z, min: this.zoomRange.min, max: this.zoomRange.max,
        hint: view, decoded, videoWidth: vw, videoHeight: vh,
      });
      if (next !== null) void this.setZoom(next, false);
    }

    if (decoded && res) {
      const text = res.text!;
      if (this.opts.continuous && text === this.lastText && now - this.lastTextAt < 1500) {
        this.lastTextAt = now;
        return;
      }
      // turned down recently and still in view: stay quiet
      const until = this.rejected.get(text);
      if (until !== undefined && now < until) {
        this.rejected.set(text, now + REJECT_COOLDOWN);
        return;
      }
      const result = toResult(res, corners, this.zoomValue, 'camera');
      const token = this.loopToken;
      const verdict = await this.check(result);
      if (!this.running || token !== this.loopToken) return;
      if (verdict !== true) {
        const t = performance.now();
        for (const [k, u] of this.rejected) if (u < t) this.rejected.delete(k);
        this.rejected.set(text, t + REJECT_COOLDOWN);
        this.emit('reject', { result, message: verdict || undefined });
        return;
      }
      this.lastText = text;
      this.lastTextAt = performance.now();
      if (!this.opts.continuous) this.paused = true;
      this.emit('result', result);
    }
  }
}

/** A turned-down code is not offered to `accept` again until it has been out of view this long (ms). */
const REJECT_COOLDOWN = 2000;

function toResult(r: AnalyzeResult, corners: Point[], zoom: number, source: ScanResult['source']): ScanResult {
  const text = r.text!;
  return {
    text,
    bytes: r.bytes ?? new TextEncoder().encode(text),
    corners,
    format: r.format ?? 'qr_code',
    version: r.version ?? '',
    ecLevel: r.ecLevel ?? '',
    zoom,
    timestamp: Date.now(),
    source,
  };
}

function mapMediaError(e: unknown): ScanError {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return new ScanError('permission-denied', 'Camera permission denied.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new ScanError('no-camera', 'No camera found.');
  if (name === 'NotReadableError' || name === 'AbortError') return new ScanError('camera-busy', 'Camera is in use by another app.');
  return new ScanError('unknown', String(e));
}
