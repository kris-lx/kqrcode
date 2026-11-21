/**
 * EMVCo merchant-presented QR codes: the payment format behind LAO QR, PromptPay, VietQR, DuitNow,
 * QRIS, SGQR, NETS and many more. `parseEMV` reads one into fields and checks its CRC; `acceptEMV`
 * turns that into an `accept` callback. Pure string code, no dependencies, tree-shakeable.
 *
 *   accept: acceptEMV({ currency: 'LAK', message: 'ນີ້ບໍ່ແມ່ນ QR ຈ່າຍເງິນ' })
 *   onScan: (r) => { const emv = parseEMV(r.text)!; pay(emv.merchantName, emv.amount); }
 */
import type { AcceptVerdict, ScanResult } from './scanner';

/** A merchant account: tags 02–25 (card networks, plain value) or 26–51 (templates). */
export interface EMVAccount {
  /** Tag number, '02'…'51'. */
  tag: string;
  /** Globally unique identifier (sub-tag 00 of a template: an AID or reverse domain), or the plain value. */
  id: string;
  /** Sub-tags of a template, e.g. { '00': 'A000000677010111', '01': '0066812345678' }. Empty for 02–25. */
  fields: Record<string, string>;
}

/** Additional data field template (tag 62). */
export interface EMVAdditionalData {
  billNumber?: string;
  mobileNumber?: string;
  storeLabel?: string;
  loyaltyNumber?: string;
  referenceLabel?: string;
  customerLabel?: string;
  terminalLabel?: string;
  purpose?: string;
  /** Every sub-tag, including scheme-specific ones. */
  fields: Record<string, string>;
}

export interface EMVQR {
  /** The CRC (tag 63) matches the payload. Treat a code with `valid: false` as damaged or altered. */
  valid: boolean;
  /** 'static' (tag 01 = 11, reusable) or 'dynamic' (12, one payment); undefined when absent. */
  initiation?: 'static' | 'dynamic';
  accounts: EMVAccount[];
  /** Merchant category code (tag 52). */
  mcc?: string;
  /** ISO 4217 numeric currency (tag 53), e.g. '418'. */
  currency?: string;
  /** ISO 4217 letters for well-known currencies, e.g. 'LAK'. */
  currencyCode?: string;
  /** Transaction amount (tag 54), as written, e.g. '15000' or '12.50'. */
  amount?: string;
  /** Tip or convenience fee: indicator 01 = ask, 02 = fixed fee, 03 = percentage (tags 55–57). */
  tip?: { indicator: string; fixed?: string; percent?: string };
  /** ISO 3166 country (tag 58), e.g. 'LA'. */
  country?: string;
  merchantName?: string;
  merchantCity?: string;
  postalCode?: string;
  additional?: EMVAdditionalData;
  /** Merchant information in another language (tag 64). */
  language?: { preference?: string; merchantName?: string; merchantCity?: string };
  /** Every top-level tag as written. */
  tags: Record<string, string>;
}

const CURRENCIES: Record<string, string> = {
  '418': 'LAK', '764': 'THB', '156': 'CNY', '840': 'USD', '704': 'VND', '116': 'KHR', '104': 'MMK', '458': 'MYR',
  '702': 'SGD', '360': 'IDR', '608': 'PHP', '356': 'INR', '344': 'HKD', '446': 'MOP', '901': 'TWD', '392': 'JPY',
  '410': 'KRW', '978': 'EUR', '826': 'GBP', '036': 'AUD', '096': 'BND', '524': 'NPR', '050': 'BDT', '144': 'LKR',
};

/** Splits "IDLLvalue…" into tags; null if the lengths don't add up. */
function tlv(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(s.slice(i + 2, i + 4)) || i + 4 + len > s.length) return null;
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** UTF-8 bytes without TextEncoder (older Hermes has none). */
function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** CRC-16/CCITT-FALSE as EMVCo specifies it, over the UTF-8 bytes; 4 uppercase hex digits. */
export function emvCRC(data: string): string {
  let crc = 0xffff;
  for (const b of utf8(data)) {
    crc ^= b << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Reads an EMVCo merchant-presented QR payload. Returns null when the text is not one. */
export function parseEMV(text: string): EMVQR | null {
  const s = text.trim();
  if (!s.startsWith('000201')) return null;
  const tags = tlv(s);
  if (!tags || tags['00'] !== '01') return null;
  const crcAt = s.lastIndexOf('6304');
  const valid = !!tags['63'] && crcAt === s.length - 8 && emvCRC(s.slice(0, crcAt + 4)) === tags['63'].toUpperCase();

  const accounts: EMVAccount[] = [];
  for (const [tag, value] of Object.entries(tags)) {
    const n = Number(tag);
    if (n >= 2 && n <= 25) accounts.push({ tag, id: value, fields: {} });
    else if (n >= 26 && n <= 51) {
      const fields = tlv(value) ?? {};
      accounts.push({ tag, id: fields['00'] ?? '', fields });
    }
  }
  accounts.sort((a, b) => Number(a.tag) - Number(b.tag));

  const out: EMVQR = { valid, accounts, tags };
  if (tags['01'] === '11') out.initiation = 'static';
  else if (tags['01'] === '12') out.initiation = 'dynamic';
  if (tags['52']) out.mcc = tags['52'];
  if (tags['53']) { out.currency = tags['53']; if (CURRENCIES[tags['53']]) out.currencyCode = CURRENCIES[tags['53']]; }
  if (tags['54']) out.amount = tags['54'];
  if (tags['55']) out.tip = { indicator: tags['55'], ...(tags['56'] && { fixed: tags['56'] }), ...(tags['57'] && { percent: tags['57'] }) };
  if (tags['58']) out.country = tags['58'];
  if (tags['59']) out.merchantName = tags['59'];
  if (tags['60']) out.merchantCity = tags['60'];
  if (tags['61']) out.postalCode = tags['61'];
  if (tags['62']) {
    const f = tlv(tags['62']) ?? {};
    const names = ['', 'billNumber', 'mobileNumber', 'storeLabel', 'loyaltyNumber', 'referenceLabel', 'customerLabel', 'terminalLabel', 'purpose'] as const;
    const add: EMVAdditionalData = { fields: f };
    names.forEach((name, k) => { const v = f['0' + k]; if (name && v) add[name] = v; });
    out.additional = add;
  }
  if (tags['64']) {
    const f = tlv(tags['64']) ?? {};
    out.language = { preference: f['00'], merchantName: f['01'], merchantCity: f['02'] };
  }
  return out;
}

export interface AcceptEMVOptions {
  /** Allowed currencies, numeric ('418') or letters ('LAK'). */
  currency?: string | string[];
  /** Allowed countries, e.g. 'LA'. */
  country?: string | string[];
  /** Accept only codes that carry one of these account ids (AID / GUID, or the value of tags 02–25). */
  accounts?: string[];
  /** Accept only dynamic codes (with a fixed amount for one payment). */
  dynamicOnly?: boolean;
  /** Shown for anything that is not a valid payment code. Default: 'Not a payment QR code'. */
  message?: string;
  /** Your own last check, e.g. ask your server. Same return values as `accept`. */
  check?: (emv: EMVQR, result: ScanResult) => AcceptVerdict | Promise<AcceptVerdict>;
}

const list = (v?: string | string[]) => (v === undefined ? undefined : (Array.isArray(v) ? v : [v]).map((x) => x.toUpperCase()));

/**
 * An `accept` callback that lets only valid EMV payment codes through: the CRC must match and the
 * code must meet your options. Anything else is turned down with `message`, and scanning goes on.
 */
export function acceptEMV(options: AcceptEMVOptions = {}): (result: ScanResult) => AcceptVerdict | Promise<AcceptVerdict> {
  const msg = options.message ?? 'Not a payment QR code';
  const currencies = list(options.currency), countries = list(options.country);
  const ids = options.accounts?.map((x) => x.toUpperCase());
  return (result) => {
    const emv = parseEMV(result.text);
    if (!emv || !emv.valid) return msg;
    if (currencies && !currencies.includes(emv.currency ?? '') && !currencies.includes(emv.currencyCode ?? '')) return msg;
    if (countries && !countries.includes((emv.country ?? '').toUpperCase())) return msg;
    if (ids && !emv.accounts.some((a) => ids.includes(a.id.toUpperCase()))) return msg;
    if (options.dynamicOnly && emv.initiation !== 'dynamic') return msg;
    return options.check ? options.check(emv, result) : true;
  };
}
