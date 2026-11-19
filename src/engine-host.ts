/**
 * One decoding worker shared by every scanner on the page.
 *
 * Creating a worker means decompressing and compiling ~1 MB of WebAssembly, so instead of doing
 * that on every start() the worker is kept warm: it stays alive while any scanner uses it and for
 * `idleTimeout` ms afterwards (default 30 s). QRScanner.preload() creates it ahead of time.
 */
import type { AnalyzeOptions, AnalyzeResult } from './engine';

export type Frame = { bitmap: ImageBitmap } | { pixels: ArrayBuffer; width: number; height: number };
export interface EngineConfig { sr: 'js' | 'webgpu' | 'off'; ortUrl: string }
type Reply = { id?: number; type?: string; sr?: string; wasm?: boolean; result?: AnalyzeResult; error?: string };

// The engine (~0.5 MB gzip) is a separate chunk – downloaded on first use only.
let sourceP: Promise<string> | null = null;
export const loadEngineSource = () => (sourceP ??= import('./worker-source.generated').then((m) => m.default));

class EngineHost {
  idleTimeout = 30_000;
  srBackend = 'off';
  /** WASM or blob workers are unavailable (strict CSP) – callers use the main-thread fallback. */
  unavailable = false;

  private worker: Worker | null = null;
  private starting: Promise<Worker | null> | null = null;
  private ready: Promise<void> | null = null;
  private refs = 0;
  private idleTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private pending = new Map<number, (r: AnalyzeResult | null) => void>();
  private nextId = 0;

  /** Create the worker (if needed) and resolve once WASM is compiled. */
  warm(): Promise<void> {
    return this.ensure().then(() => this.ready ?? undefined).then(() => this.scheduleIdle());
  }

  async acquire(cfg: EngineConfig): Promise<boolean> {
    this.refs++;
    this.clearIdle();
    const w = await this.ensure();
    if (!w) { this.refs--; return false; }
    w.postMessage({ type: 'config', ...cfg });
    return true;
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0) this.scheduleIdle();
  }

  analyze(frame: Frame, opts: AnalyzeOptions): Promise<AnalyzeResult | null> {
    const w = this.worker;
    if (!w) return Promise.resolve(null);
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      if ('bitmap' in frame) w.postMessage({ id, bitmap: frame.bitmap, opts }, [frame.bitmap]);
      else w.postMessage({ id, pixels: frame.pixels, width: frame.width, height: frame.height, opts }, [frame.pixels]);
    });
  }

  get alive(): boolean { return !!this.worker; }

  /** Terminate immediately (tests, or apps that want to free memory right away). */
  dispose(): void {
    this.clearIdle();
    this.worker?.terminate();
    this.worker = null;
    this.starting = null;
    this.ready = null;
    this.pending.forEach((r) => r(null));
    this.pending.clear();
  }

  private ensure(): Promise<Worker | null> {
    if (this.worker) return Promise.resolve(this.worker);
    if (this.unavailable || typeof Worker === 'undefined') return Promise.resolve(null);
    return (this.starting ??= this.spawn());
  }

  private async spawn(): Promise<Worker | null> {
    try {
      const src = await loadEngineSource();
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      let markReady!: () => void;
      this.ready = new Promise((r) => (markReady = r));
      w.onmessage = (e: MessageEvent<Reply>) => {
        const d = e.data;
        if (d.type === 'ready') {
          if (d.wasm === false) this.fail();
          markReady();
          return;
        }
        if (d.type === 'config-done') { this.srBackend = d.sr ?? 'off'; return; }
        if (d.id === undefined) return;
        const cb = this.pending.get(d.id);
        this.pending.delete(d.id);
        if (d.error === 'no-wasm') this.fail();
        cb?.(d.result ?? null);
      };
      w.onerror = () => { this.fail(); markReady(); }; // e.g. CSP blocks blob: workers
      this.worker = w;
      return w;
    } catch {
      this.unavailable = true;
      return null;
    } finally {
      this.starting = null;
    }
  }

  private fail() {
    this.unavailable = true;
    this.dispose();
  }

  private scheduleIdle() {
    this.clearIdle();
    if (this.refs > 0 || !this.worker) return;
    this.idleTimer = setTimeout(() => { if (this.refs === 0) this.dispose(); }, this.idleTimeout);
  }

  private clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }
}

export const engineHost = new EngineHost();
