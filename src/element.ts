/**
 * <kqr-scanner> – full-screen scanner web component.
 * Works in any framework (React, Vue, Angular, Svelte, Solid, Preact, Lit, Qwik, plain HTML…).
 *
 * Customisation layers (pick the lightest that does the job):
 *   1. theme="wechat|alipay|frame|grid|none"   – ready-made looks
 *   2. CSS custom properties  --kqr-accent, --kqr-mask, … (see THEME_VARS)
 *   3. ::part(...)            – restyle any built-in piece from outside
 *   4. <slot>s                – replace / add buttons, tabs, hint, error UI
 *   5. headless QRScanner     – build your own UI from scratch
 */
import { QRScanner, ScanError, type ScanResult } from './scanner';
import type { QRHint } from './engine';

export interface ScannerLabels {
  hint: string;
  zooming: string;
  dark: string;
  torchOn: string;
  torchOff: string;
  gallery: string;
  noQrInImage: string;
  close: string;
  permission: string;
  noCamera: string;
  busy: string;
  insecure: string;
  unsupported: string;
}

export const LABELS: Record<string, ScannerLabels> = {
  en: {
    hint: 'Scan a QR code anywhere in view',
    zooming: 'Zooming in…',
    dark: 'Too dark – turn on the light',
    torchOn: 'Tap to turn light on',
    torchOff: 'Tap to turn light off',
    gallery: 'Album',
    noQrInImage: 'No QR code found in the image',
    close: 'Close',
    permission: 'Camera permission denied. Please allow camera access.',
    noCamera: 'No camera found on this device.',
    busy: 'The camera is being used by another app.',
    insecure: 'Camera needs HTTPS.',
    unsupported: 'This browser cannot access the camera.',
  },
  lo: {
    hint: 'ສະແກນ QR code ບ່ອນໃດກໍໄດ້ໃນກ້ອງ',
    zooming: 'ກຳລັງຊູມເຂົ້າ…',
    dark: 'ມືດເກີນໄປ – ເປີດໄຟສາຍ',
    torchOn: 'ແຕະເພື່ອເປີດໄຟ',
    torchOff: 'ແຕະເພື່ອປິດໄຟ',
    gallery: 'ອັນລະບັ້ມ',
    noQrInImage: 'ບໍ່ພົບ QR code ໃນຮູບ',
    close: 'ປິດ',
    permission: 'ບໍ່ໄດ້ຮັບສິດໃຊ້ກ້ອງ ກະລຸນາອະນຸຍາດ',
    noCamera: 'ບໍ່ພົບກ້ອງໃນອຸປະກອນນີ້',
    busy: 'ກ້ອງກຳລັງຖືກໃຊ້ໂດຍແອັບອື່ນ',
    insecure: 'ກ້ອງຕ້ອງໃຊ້ HTTPS',
    unsupported: 'ບຣາວເຊີນີ້ບໍ່ຮອງຮັບການໃຊ້ກ້ອງ',
  },
  zh: {
    hint: '扫二维码 / 条码',
    zooming: '正在放大…',
    dark: '光线太暗',
    torchOn: '轻触照亮',
    torchOff: '轻触关闭',
    gallery: '相册',
    noQrInImage: '未在图片中发现二维码',
    close: '关闭',
    permission: '相机权限被拒绝，请允许访问相机',
    noCamera: '未找到相机',
    busy: '相机被其他应用占用',
    insecure: '相机需要 HTTPS',
    unsupported: '此浏览器不支持相机',
  },
};

export type ScannerTheme = 'wechat' | 'alipay' | 'frame' | 'grid' | 'none';

/** CSS custom properties you can set on the element (or any ancestor). */
export const THEME_VARS = {
  '--kqr-accent': 'scan line / corner colour (theme default: wechat #07c160, alipay #1677ff, frame/grid #1fd17a)',
  '--kqr-success': 'colour of the "found it" dot (default: accent)',
  '--kqr-mask': 'dim colour outside the frame (frame theme), default rgba(0,0,0,.45)',
  '--kqr-frame-size': 'frame side, default min(70vmin, 300px)',
  '--kqr-frame-top': 'vertical centre of the frame, default 42%',
  '--kqr-frame-radius': 'default 14px',
  '--kqr-corner-size': 'default 24px',
  '--kqr-corner-width': 'default 4px',
  '--kqr-scan-duration': 'one sweep, default 2.4s',
  '--kqr-line-width': 'scan line thickness, default 3px',
  '--kqr-text': 'text colour, default #fff',
  '--kqr-font': 'font stack',
  '--kqr-button-bg': 'round button background, default rgba(40,40,40,.55)',
  '--kqr-button-size': 'default 52px',
  '--kqr-bg': 'background behind the video, default #000',
} as const;

const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  torch: '<svg viewBox="0 0 24 24"><path d="M8 2h8l-1.5 6h-5L8 2zm1.5 6h5V13l2 3v6h-9v-6l2-3V8z" fill="currentColor"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 18l5.5-5.5 4 4 3-3L21 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

const CSS = /* css */ `
:host{--_accent:var(--kqr-accent,#07c160);--_ok:var(--kqr-success,var(--_accent));--_dur:var(--kqr-scan-duration,2.4s);
  --_fs:var(--kqr-frame-size,min(70vmin,300px));--_ft:var(--kqr-frame-top,42%);--_fr:var(--kqr-frame-radius,14px);
  --_cs:var(--kqr-corner-size,24px);--_cw:var(--kqr-corner-width,4px);--_lw:var(--kqr-line-width,3px);
  --_btn:var(--kqr-button-bg,rgba(40,40,40,.55));--_bs:var(--kqr-button-size,52px);
  position:fixed;inset:0;z-index:2147483000;display:block;overflow:hidden;
  background:var(--kqr-bg,#000);color:var(--kqr-text,#fff);
  font:14px/1.4 var(--kqr-font,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Lao","PingFang SC","Noto Sans SC",sans-serif);
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
:host([theme=alipay]){--_accent:var(--kqr-accent,#1677ff)}
:host([theme=frame]),:host([theme=grid]){--_accent:var(--kqr-accent,#1fd17a)}
:host([inline]){position:relative;inset:auto;width:100%;height:100%;min-height:240px;z-index:auto}
:host([hidden]){display:none}
*{box-sizing:border-box}
.stage{position:absolute;inset:0;touch-action:none}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--kqr-bg,#000);transform-origin:50% 50%}
canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx{position:absolute;inset:0;pointer-events:none}

/* ---------- full-screen sweep (wechat / alipay) ---------- */
.sweep{position:absolute;left:0;right:0;top:0;display:none;will-change:transform,opacity}
:host(:not([theme])) .sweep,:host([theme=wechat]) .sweep{display:block;height:var(--_lw);
  background:radial-gradient(50% 50% at 50% 50%,var(--_accent) 0%,color-mix(in srgb,var(--_accent) 60%,transparent) 45%,transparent 100%);
  box-shadow:0 0 18px 2px color-mix(in srgb,var(--_accent) 55%,transparent);
  margin:0 6%;animation:kqr-wechat var(--_dur) ease-in-out infinite}
@keyframes kqr-wechat{0%{transform:translateY(16vh);opacity:0}12%{opacity:1}80%{opacity:1}100%{transform:translateY(72vh);opacity:0}}
:host([theme=alipay]) .sweep{display:block;height:28vh;
  background:linear-gradient(to bottom,transparent 0%,color-mix(in srgb,var(--_accent) 10%,transparent) 55%,color-mix(in srgb,var(--_accent) 45%,transparent) 100%);
  border-bottom:var(--_lw) solid color-mix(in srgb,var(--_accent) 85%,#fff);
  animation:kqr-alipay var(--_dur) linear infinite}
@keyframes kqr-alipay{0%{transform:translateY(-28vh);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(78vh);opacity:0}}

/* ---------- frame (frame / grid) ---------- */
.frame{position:absolute;left:50%;top:var(--_ft);width:var(--_fs);aspect-ratio:1;transform:translate(-50%,-50%);
  border-radius:var(--_fr);display:none;overflow:hidden}
:host([theme=frame]) .frame,:host([theme=grid]) .frame{display:block}
:host([theme=frame]) .frame{box-shadow:0 0 0 100vmax var(--kqr-mask,rgba(0,0,0,.45));overflow:visible}
.frame i{position:absolute;width:var(--_cs);height:var(--_cs);border:0 solid var(--_accent);z-index:1}
:host([theme=grid]) .frame i{border-color:#fff}
.frame i:nth-of-type(1){left:0;top:0;border-left-width:var(--_cw);border-top-width:var(--_cw);border-top-left-radius:var(--_fr)}
.frame i:nth-of-type(2){right:0;top:0;border-right-width:var(--_cw);border-top-width:var(--_cw);border-top-right-radius:var(--_fr)}
.frame i:nth-of-type(3){left:0;bottom:0;border-left-width:var(--_cw);border-bottom-width:var(--_cw);border-bottom-left-radius:var(--_fr)}
.frame i:nth-of-type(4){right:0;bottom:0;border-right-width:var(--_cw);border-bottom-width:var(--_cw);border-bottom-right-radius:var(--_fr)}
.scan{position:absolute;left:0;right:0;top:0}
:host([theme=frame]) .scan{left:8%;right:8%;height:var(--_lw);border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--_accent),transparent);box-shadow:0 0 12px var(--_accent);
  animation:kqr-frame calc(var(--_dur) * .9) ease-in-out infinite alternate}
@keyframes kqr-frame{from{transform:translateY(calc(var(--_fs) * .05))}to{transform:translateY(calc(var(--_fs) * .93))}}
:host([theme=grid]) .scan{height:55%;
  background-image:linear-gradient(color-mix(in srgb,var(--_accent) 55%,transparent) 1px,transparent 1px),
    linear-gradient(90deg,color-mix(in srgb,var(--_accent) 55%,transparent) 1px,transparent 1px);
  background-size:11px 11px;
  -webkit-mask-image:linear-gradient(to bottom,transparent,#000 92%,transparent);mask-image:linear-gradient(to bottom,transparent,#000 92%,transparent);
  animation:kqr-grid var(--_dur) linear infinite}
@keyframes kqr-grid{from{transform:translateY(-100%)}to{transform:translateY(190%)}}
:host([found]) .sweep,:host([found]) .scan{animation:none!important;visibility:hidden}

/* ---------- success dot ---------- */
.dot{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;display:none;
  background:var(--_ok);border:3px solid #fff;box-shadow:0 2px 14px rgba(0,0,0,.35);pointer-events:none}
.dot::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:8px;border:solid #fff;border-width:0 0 3px 3px;
  transform:translate(-50%,-70%) rotate(-45deg)}
.dot.go{display:block;animation:kqr-pop .38s cubic-bezier(.2,1.6,.4,1)}
.dot.go::before{content:"";position:absolute;inset:-3px;border-radius:50%;border:3px solid var(--_ok);animation:kqr-ripple 1s ease-out .2s infinite}
@keyframes kqr-pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes kqr-ripple{from{transform:scale(1);opacity:.9}to{transform:scale(2.2);opacity:0}}
:host([success=box]) .dot{display:none!important}

/* ---------- chrome ---------- */
.top{position:absolute;left:0;right:0;top:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;
  padding:max(12px,env(safe-area-inset-top)) 14px 10px}
.top .r{justify-self:end;display:flex;gap:10px}.top .l{display:flex;gap:10px}
.title{font-size:17px;font-weight:600;text-shadow:0 1px 3px #0008}
.bottom{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:16px;
  padding:20px 22px max(18px,env(safe-area-inset-bottom));pointer-events:none}
.bottom>*{pointer-events:auto}
button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;
  font-size:12px;color:inherit}
button:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:12px}
.ic{width:var(--_bs);height:var(--_bs);border-radius:50%;background:var(--_btn);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:grid;place-items:center}
.ic svg{width:24px;height:24px}
.close .ic{width:36px;height:36px;background:rgba(0,0,0,.35)}.close .ic svg{width:20px;height:20px}
.msg{min-height:20px;text-align:center;text-shadow:0 1px 3px #000a;padding:0 8px;opacity:.95}
.msg.warn{color:#ffd24d}
.torch{flex-direction:column;gap:4px;font-size:12px;padding:6px 10px}
.torch .ic{width:44px;height:44px;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}
.torch.on{color:var(--_accent)}
.actions{display:flex;align-items:flex-end;justify-content:space-between;width:100%}
.actions:empty{display:none}
.zoom{display:flex;align-items:center;gap:10px;width:min(86vw,340px)}
.zoom button .ic{width:30px;height:30px}.zoom button .ic svg{width:16px;height:16px}
.zoom input{flex:1;accent-color:var(--_accent);height:28px;margin:0}
.zoom span{min-width:42px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
[hidden]{display:none!important}
.ring{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid #fff;border-radius:50%;
  pointer-events:none;opacity:0}
.ring.go{animation:kqr-ring .6s ease-out}
@keyframes kqr-ring{0%{opacity:1;transform:scale(1.4)}100%{opacity:0;transform:scale(.8)}}
.err{position:absolute;inset:0;display:none;place-items:center;text-align:center;padding:32px;background:var(--kqr-bg,#000)}
:host([error]) .err{display:grid}
input[type=file]{display:none}
@media (prefers-reduced-motion:reduce){.sweep,.scan{animation-duration:6s!important}}
`;

const Base: typeof HTMLElement = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class KQRScannerElement extends Base {
  static observedAttributes = ['locale', 'heading', 'torch', 'zoom-control'];

  /** Override any label (merged over the current locale). */
  labels: Partial<ScannerLabels> = {};
  /** Underlying headless scanner (available after start()). */
  scanner: QRScanner | null = null;

  private root!: ShadowRoot;
  private $: Record<string, HTMLElement> = {};
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private audio: AudioContext | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
  private tapStart: { x: number; y: number; t: number } | null = null;
  private lastTap = 0;
  private lastDraw: { hint: QRHint | null; decoded: boolean; vw: number; vh: number } | null = null;
  private torchOn = false;
  private dark = false;
  private dz = 1;
  private prevOverflow = '';
  private msgTimer = 0;
  private stopTimer = 0;
  private started = false;

  /* ---- attribute helpers ---- */
  private flag(name: string) { return this.hasAttribute(name) && this.getAttribute(name) !== 'false'; }
  private attr(name: string, def: string) { return this.getAttribute(name) ?? def; }
  private get L(): ScannerLabels {
    const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
    const base = LABELS[(this.getAttribute('locale') || nav || 'en').slice(0, 2).toLowerCase()] ?? LABELS.en;
    return { ...base, ...this.labels };
  }

  private onResize = () => this.redraw();

  connectedCallback() {
    window.addEventListener('resize', this.onResize);
    if (this.root) {
      if (!this.flag('manual')) void this.start();
      return;
    }
    if (!this.hasAttribute('theme')) this.setAttribute('theme', 'wechat');
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>${CSS}</style>
      <div class="stage" part="stage"><video part="video" muted playsinline></video><canvas part="candidates"></canvas></div>
      <div class="fx" part="effect">
        <div class="sweep" part="scanline"></div>
        <div class="frame" part="frame"><i></i><i></i><i></i><i></i><div class="scan" part="scanline"></div></div>
        <div class="dot" part="success"></div>
        <div class="ring" part="focus-ring"></div>
      </div>
      <div class="top" part="top">
        <div class="l"><slot name="top-left"><button class="close" part="close"><span class="ic">${ICON.close}</span></button></slot></div>
        <slot name="top-center"><div class="title" part="title"></div></slot>
        <div class="r"><slot name="top-right"></slot></div>
      </div>
      <div class="bottom" part="bottom">
        <slot name="hint"><div class="msg" part="hint" role="status" aria-live="polite"></div></slot>
        <button class="torch" part="torch" hidden><span class="ic">${ICON.torch}</span><span class="t"></span></button>
        <div class="zoom" part="zoom" hidden>
          <button class="zm" aria-label="zoom out"><span class="ic">${ICON.minus}</span></button>
          <input type="range" min="1" max="8" step="0.05" value="1" aria-label="zoom">
          <button class="zp" aria-label="zoom in"><span class="ic">${ICON.plus}</span></button>
          <span class="zl">1.0×</span>
        </div>
        <div class="actions" part="actions">
          <slot name="actions-left"></slot>
          <slot name="actions-right"><button class="gallery" part="gallery"><span class="ic">${ICON.image}</span><span class="t"></span></button></slot>
        </div>
        <slot name="footer"></slot>
      </div>
      <div class="err" part="error" role="alert"><slot name="error"><div class="et"></div></slot></div>
      <input type="file" accept="image/*">`;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.$ = {
      stage: q('.stage'), ring: q('.ring'), dot: q('.dot'), msg: q('.msg'), title: q('.title'), zoom: q('.zoom'),
      range: q('.zoom input'), zl: q('.zl'), torch: q('.torch'), gallery: q('.gallery'), file: q('input[type=file]'),
      err: q('.et'), close: q('.close'), zm: q('.zm'), zp: q('.zp'),
    };
    this.video = q('video') as HTMLVideoElement;
    this.canvas = q('canvas') as HTMLCanvasElement;
    this.applyLabels();
    this.$.gallery.hidden = this.flag('no-gallery');
    this.$.close.hidden = this.flag('no-close');

    const on = (el: EventTarget, ev: string, fn: (e: any) => void) => el.addEventListener(ev, fn);
    on(this.$.close, 'click', () => this.close());
    on(this.$.gallery, 'click', () => this.pickImage());
    on(this.$.file, 'change', () => this.onFile());
    on(this.$.torch, 'click', () => this.toggleTorch());
    on(this.$.range, 'input', () => this.scanner?.setZoom(parseFloat((this.$.range as HTMLInputElement).value), true));
    on(this.$.zm, 'click', () => this.zoomStep(-1));
    on(this.$.zp, 'click', () => this.zoomStep(1));
    on(this.$.stage, 'pointerdown', (e: PointerEvent) => this.pdown(e));
    on(this.$.stage, 'pointermove', (e: PointerEvent) => this.pmove(e));
    on(this.$.stage, 'pointerup', (e: PointerEvent) => this.pup(e));
    on(this.$.stage, 'pointercancel', (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pinch = null; });

    if (!this.flag('manual')) void this.start();
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.onResize);
    this.stop();
  }

  attributeChangedCallback(name: string) {
    if (!this.root) return;
    if (name === 'locale' || name === 'heading') this.applyLabels();
    if (name === 'torch') this.updateTorchButton();
    if (name === 'zoom-control' && this.scanner) this.onZoom({ zoom: this.scanner.zoom, min: this.scanner.zoomMin, max: this.scanner.zoomMax, auto: false, digital: this.scanner.isDigitalZoom });
  }

  /* ---------------- public API ---------------- */

  async start(): Promise<void> {
    if (!this.video || this.started) return;
    this.started = true;
    this.hidden = false;
    this.removeAttribute('error');
    this.removeAttribute('found');
    this.$.dot.classList.remove('go');
    if (!this.flag('inline')) {
      this.prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (this.flag('request-fullscreen')) this.requestFullscreen?.().catch(() => {});
    }
    const sr = this.getAttribute('super-resolution');
    const s = (this.scanner = new QRScanner({
      video: this.video,
      facingMode: (this.getAttribute('facing') as 'environment' | 'user') || 'environment',
      autoZoom: !this.flag('no-auto-zoom'),
      maxZoom: parseFloat(this.getAttribute('max-zoom') || '') || 8,
      continuous: this.flag('continuous'),
      superResolution: sr === 'off' || sr === 'false' ? false : sr === 'webgpu' ? 'webgpu' : 'js',
      ...(this.getAttribute('onnx-runtime-url') ? { onnxRuntimeUrl: this.getAttribute('onnx-runtime-url')! } : {}),
    }));
    s.on('result', (r) => this.onResult(r));
    s.on('error', (e) => this.onError(e));
    s.on('zoom', (z) => this.onZoom(z));
    s.on('hint', (h) => { this.lastDraw = { hint: h.hint, decoded: h.decoded, vw: h.videoWidth, vh: h.videoHeight }; this.redraw(); });
    s.on('dark', (d) => { this.dark = d; this.updateTorchButton(); if (d && !this.torchOn) this.say(this.L.dark, 0, true); else this.say(this.L.hint); });
    try {
      await s.start();
      this.updateTorchButton();
      this.say(this.L.hint);
      this.dispatchEvent(new CustomEvent('ready'));
    } catch { /* surfaced through the error event */ }
  }

  stop(): void {
    clearTimeout(this.stopTimer);
    this.scanner?.stop();
    this.scanner = null;
    if (this.started && !this.flag('inline')) document.documentElement.style.overflow = this.prevOverflow;
    this.started = false;
    this.torchOn = false;
    if (this.audio) { this.audio.close().catch(() => {}); this.audio = null; }
  }

  /** ✕ pressed (or call it yourself): stop camera, hide, fire `close`. start() reopens. */
  close(): void {
    this.stop();
    this.hidden = true;
    this.dispatchEvent(new CustomEvent('close'));
  }

  /** Resume scanning after a result (with keep-camera / continuous). */
  resume() {
    this.removeAttribute('found');
    this.$.dot.classList.remove('go');
    void this.video.play().catch(() => {});
    this.scanner?.resume();
    this.say(this.L.hint);
  }

  /** Open the photo picker (use from your own slotted album button). */
  pickImage() { (this.$.file as HTMLInputElement).click(); }

  /** Toggle / set the flashlight (use from your own slotted button). */
  async toggleTorch(on = !this.torchOn): Promise<boolean> {
    if (!this.scanner) return false;
    if (await this.scanner.setTorch(on)) {
      this.torchOn = on;
      this.updateTorchButton();
      if (on) this.say(this.L.hint);
      return true;
    }
    return false;
  }

  /* ---------------- handlers ---------------- */

  private onResult(r: ScanResult) {
    this.setAttribute('found', '');
    const continuous = this.flag('continuous');
    // WeChat/Alipay feel: freeze the frame and mark where the code was
    if (!continuous && r.source === 'camera') this.video.pause();
    this.showSuccess(r);
    if (!this.flag('no-vibrate')) try { navigator.vibrate?.(40); } catch { /* */ }
    if (!this.flag('no-beep')) this.beep();
    const delay = r.source === 'camera' && this.attr('success', 'dot') !== 'none' ? 380 : 0;
    window.setTimeout(() => this.dispatchEvent(new CustomEvent('scan', { detail: r, bubbles: true, composed: true })), delay);
    if (!continuous && !this.flag('keep-camera')) this.stopTimer = window.setTimeout(() => this.stop(), delay + 120);
    else if (continuous) setTimeout(() => { this.removeAttribute('found'); this.$.dot.classList.remove('go'); }, 900);
  }

  private showSuccess(r: ScanResult) {
    const style = this.attr('success', 'dot');
    if (style !== 'dot' || !r.corners.length) return;
    const m = this.mapper();
    if (!m) return;
    const cx = (r.corners[0].x + r.corners[2].x) / 2, cy = (r.corners[0].y + r.corners[2].y) / 2;
    const dot = this.$.dot;
    dot.style.left = m.x(cx) + 'px';
    dot.style.top = m.y(cy) + 'px';
    dot.classList.remove('go'); void dot.offsetWidth; dot.classList.add('go');
  }

  private onError(e: ScanError) {
    const L = this.L;
    const text = ({
      'permission-denied': L.permission, 'no-camera': L.noCamera, 'camera-busy': L.busy,
      'insecure-context': L.insecure, unsupported: L.unsupported, unknown: e.message,
    } as Record<string, string>)[e.code];
    this.$.err.textContent = text;
    this.setAttribute('error', e.code);
    this.started = false;
    this.dispatchEvent(new CustomEvent('error', { detail: e }));
  }

  private onZoom(z: { zoom: number; min: number; max: number; auto: boolean; digital: boolean }) {
    this.dz = z.digital ? z.zoom : 1;
    this.video.style.transition = 'transform .14s ease-out';
    this.video.style.transform = z.digital ? `scale(${z.zoom})` : '';
    const range = this.$.range as HTMLInputElement;
    range.min = String(z.min); range.max = String(z.max); range.value = String(z.zoom);
    // default 'none' like WeChat/Alipay: pinch, double-tap and auto-zoom instead of a slider
    this.$.zoom.hidden = this.attr('zoom-control', 'none') !== 'slider' || z.max <= z.min * 1.05;
    this.$.zl.textContent = z.zoom.toFixed(1) + '×';
    if (z.auto && z.zoom > z.min * 1.05) this.say(this.L.zooming, 1200);
    this.redraw();
    this.dispatchEvent(new CustomEvent('zoom', { detail: z }));
  }

  private zoomStep(dir: number) {
    const s = this.scanner;
    if (s) s.setZoom(s.zoom + dir * Math.max(0.5, s.zoomMax / 8), true);
  }

  /** torch="auto" (default): appear when it is dark, like WeChat · "always" · "never" */
  private updateTorchButton() {
    const mode = this.flag('no-torch') ? 'never' : this.attr('torch', 'auto');
    const can = !!this.scanner?.canTorch;
    const show = can && (mode === 'always' || (mode === 'auto' && (this.dark || this.torchOn)));
    this.$.torch.hidden = !show;
    this.$.torch.classList.toggle('on', this.torchOn);
    (this.$.torch.querySelector('.t') as HTMLElement).textContent = this.torchOn ? this.L.torchOff : this.L.torchOn;
  }

  private async onFile() {
    const input = this.$.file as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const temp = this.scanner ? null : new QRScanner({ video: this.video });
    const scanner = this.scanner ?? temp!;
    try {
      const r = await scanner.scanImage(f);
      if (r) this.onResult(r);
      else this.say(this.L.noQrInImage, 2500, true);
    } catch { this.say(this.L.noQrInImage, 2500, true); }
    finally { temp?.stop(); } // terminate the temporary worker
  }

  /* ---------------- gestures: pinch zoom, double-tap zoom, tap focus ---------------- */

  private pdown(e: PointerEvent) {
    (this.$.stage as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    else { this.tapStart = null; this.pinch = { dist: this.pdist(), zoom: this.scanner?.zoom ?? 1 }; }
  }
  private pmove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2 && this.scanner) this.scanner.setZoom(this.pinch.zoom * (this.pdist() / this.pinch.dist), true);
  }
  private pup(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const t = this.tapStart;
    this.tapStart = null;
    const s = this.scanner;
    if (!t || !s || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10 || performance.now() - t.t > 400) return;
    const now = performance.now();
    if (now - this.lastTap < 300 && s.canZoom) { // double tap: toggle zoom (WeChat)
      this.lastTap = 0;
      const target = s.zoom > s.zoomMin * 1.3 ? s.zoomMin : Math.min(s.zoomMax, s.zoomMin * 2.5);
      s.setZoom(target, true);
      return;
    }
    this.lastTap = now;
    const r = this.getBoundingClientRect();
    const ring = this.$.ring;
    ring.style.left = e.clientX - r.left + 'px';
    ring.style.top = e.clientY - r.top + 'px';
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    const m = this.mapper();
    if (m) s.focusAt(Math.min(1, Math.max(0, m.invX(e.clientX - r.left))), Math.min(1, Math.max(0, m.invY(e.clientY - r.top))));
  }
  private pdist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  /* ---------------- drawing ---------------- */

  /** video-pixel ↔ element-pixel mapping for object-fit: cover (+ digital zoom) */
  private mapper() {
    const v = this.video;
    if (!v?.videoWidth) return null;
    const cw = this.clientWidth, ch = this.clientHeight;
    const s = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
    const dz = this.dz;
    return {
      x: (x: number) => (x * s + ox - cw / 2) * dz + cw / 2,
      y: (y: number) => (y * s + oy - ch / 2) * dz + ch / 2,
      s: s * dz,
      invX: (x: number) => ((x - cw / 2) / dz + cw / 2 - ox) / s / v.videoWidth,
      invY: (y: number) => ((y - ch / 2) / dz + ch / 2 - oy) / s / v.videoHeight,
    };
  }

  private redraw() {
    const c = this.canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.clientWidth, h = this.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const d = this.lastDraw, m = this.mapper();
    if (!d || !d.hint || !m || this.flag('no-candidates')) return;
    if (d.decoded && this.attr('success', 'dot') !== 'box') return; // the dot element handles it
    const cx = m.x(d.hint.cx), cy = m.y(d.hint.cy);
    const half = Math.max(18, (d.hint.size * m.s) / 2);
    const L = Math.min(16, half * 0.5);
    const accent = getComputedStyle(this).getPropertyValue('--kqr-accent').trim() || '#fff';
    ctx.strokeStyle = d.decoded ? accent : 'rgba(255,255,255,.9)';
    ctx.lineWidth = d.decoded ? 3.5 : 2.5;
    ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = cx + sx * half, py = cy + sy * half;
      ctx.beginPath(); ctx.moveTo(px - sx * L, py); ctx.lineTo(px, py); ctx.lineTo(px, py - sy * L); ctx.stroke();
    }
  }

  /* ---------------- misc ---------------- */

  private applyLabels() {
    const L = this.L;
    const g = this.$.gallery.querySelector('.t') as HTMLElement;
    g.textContent = L.gallery;
    this.$.close.setAttribute('aria-label', L.close);
    this.$.title.textContent = this.getAttribute('heading') ?? '';
    this.updateTorchButton();
    this.say(L.hint);
  }

  private say(text: string, ms = 0, warn = false) {
    clearTimeout(this.msgTimer);
    const m = this.$.msg;
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('warn', warn);
    if (ms) this.msgTimer = window.setTimeout(() => { m.textContent = this.L.hint; m.classList.remove('warn'); }, ms);
  }

  private beep() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (this.audio ??= new AC());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1800;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.13);
    } catch { /* audio blocked */ }
  }
}

export const TAG_NAME = 'kqr-scanner';

/** Register the custom element (idempotent, SSR-safe). */
export function defineScannerElement(tag: string = TAG_NAME): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, KQRScannerElement as unknown as CustomElementConstructor);
  }
}
