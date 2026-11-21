import { defineComponent, h, onMounted, ref } from 'vue';
import type { PropType } from 'vue';
import { defineScannerElement, TAG_NAME, type KQRScannerElement, type ScannerLabels, type ScannerTheme } from './element';
import type { AcceptFn, ScanResult } from './scanner';
import type { QRFormat } from './formats';

/**
 * <QRScanner @scan="r => …" /> for Vue 3 / Nuxt (wrap in <ClientOnly>).
 * Emits: scan, reject, error, close, ready.
 */
export const QRScanner = defineComponent({
  name: 'QRScanner',
  props: {
    facing: { type: String as PropType<'environment' | 'user'>, default: 'environment' },
    continuous: Boolean,
    inline: Boolean,
    noAutoZoom: Boolean,
    noGallery: Boolean,
    noTorch: Boolean,
    noBeep: Boolean,
    noVibrate: Boolean,
    maxZoom: Number,
    superResolution: String as PropType<'js' | 'webgpu' | 'off'>,
    locale: String,
    labels: Object as PropType<Partial<ScannerLabels>>,
    theme: String as PropType<ScannerTheme>,
    heading: String,
    success: String as PropType<'dot' | 'box' | 'none'>,
    torch: String as PropType<'auto' | 'always' | 'never'>,
    zoomControl: String as PropType<'slider' | 'none'>,
    noClose: Boolean,
    /** QR-family members to read. Default: all – 'qr_code', 'micro_qr_code', 'rm_qr_code'. */
    formats: Array as PropType<QRFormat[]>,
    /** true (or nothing) accepts, false ignores the code, a string ignores it and shows the string. */
    accept: Function as PropType<AcceptFn>,
  },
  emits: {
    scan: (_r: ScanResult) => true,
    reject: (_r: ScanResult, _message?: string) => true,
    error: (_e: unknown) => true,
    close: () => true,
    ready: () => true,
  },
  setup(props, { emit, expose, slots }) {
    const el = ref<KQRScannerElement | null>(null);
    defineScannerElement();
    onMounted(() => {
      if (!el.value) return;
      if (props.labels) el.value.labels = props.labels;
      el.value.accept = (r) => (props.accept ? props.accept(r) : true);
    });
    expose({ el });
    return () => {
      const a: Record<string, unknown> = {
        ref: el, facing: props.facing, locale: props.locale, 'max-zoom': props.maxZoom, 'super-resolution': props.superResolution,
        theme: props.theme, heading: props.heading, success: props.success, torch: props.torch, 'zoom-control': props.zoomControl,
        formats: props.formats?.join(' '),
        onScan: (e: CustomEvent<ScanResult>) => emit('scan', e.detail),
        onReject: (e: CustomEvent<{ result: ScanResult; message?: string }>) => emit('reject', e.detail.result, e.detail.message),
        onError: (e: CustomEvent) => emit('error', e.detail),
        onClose: () => emit('close'),
        onReady: () => emit('ready'),
      };
      if (props.continuous) a.continuous = '';
      if (props.inline) a.inline = '';
      if (props.noAutoZoom) a['no-auto-zoom'] = '';
      if (props.noGallery) a['no-gallery'] = '';
      if (props.noTorch) a['no-torch'] = '';
      if (props.noBeep) a['no-beep'] = '';
      if (props.noVibrate) a['no-vibrate'] = '';
      if (props.noClose) a['no-close'] = '';
      // <QRScanner><button slot="actions-left">…</button></QRScanner> → native slots
      return h(TAG_NAME, a, slots.default?.());
    };
  },
});
