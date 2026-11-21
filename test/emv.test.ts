/** EMVCo merchant-presented QR: parsing, CRC and the acceptEMV helper. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptEMV, emvCRC, parseEMV } from '../src/emv.ts';
import type { ScanResult } from '../src/scanner.ts';

/** Builds a payload from tags and appends a correct CRC. */
const tag = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v;
function emv(...parts: string[]) {
  const body = tag('00', '01') + parts.join('') + '6304';
  return body + emvCRC(body);
}
const result = (text: string) => ({ text } as ScanResult);

const LAO = emv(
  tag('01', '12'),
  tag('38', tag('00', 'A005266284662577') + tag('01', '27710418') + tag('02', '001')),
  tag('52', '5999'), tag('53', '418'), tag('54', '15000'), tag('58', 'LA'),
  tag('59', 'KHAMPHOUI SHOP'), tag('60', 'VIENTIANE'),
  tag('62', tag('01', 'INV12345') + tag('05', 'REF-9') + tag('07', 'T001')),
  tag('64', tag('00', 'LO') + tag('01', 'ຮ້ານຄຳພູ') + tag('02', 'ວຽງຈັນ')),
);

test('CRC-16/CCITT-FALSE check value', () => {
  assert.equal(emvCRC('123456789'), '29B1');
});

test('parses a merchant QR into fields', () => {
  const e = parseEMV(LAO)!;
  assert.equal(e.valid, true);
  assert.equal(e.initiation, 'dynamic');
  assert.deepEqual(e.accounts, [{ tag: '38', id: 'A005266284662577', fields: { '00': 'A005266284662577', '01': '27710418', '02': '001' } }]);
  assert.equal(e.mcc, '5999');
  assert.equal(e.currency, '418');
  assert.equal(e.currencyCode, 'LAK');
  assert.equal(e.amount, '15000');
  assert.equal(e.country, 'LA');
  assert.equal(e.merchantName, 'KHAMPHOUI SHOP');
  assert.equal(e.merchantCity, 'VIENTIANE');
  assert.equal(e.additional?.billNumber, 'INV12345');
  assert.equal(e.additional?.referenceLabel, 'REF-9');
  assert.equal(e.additional?.terminalLabel, 'T001');
  assert.deepEqual(e.language, { preference: 'LO', merchantName: 'ຮ້ານຄຳພູ', merchantCity: 'ວຽງຈັນ' });
});

test('card-network tags (02–25) are plain values', () => {
  const e = parseEMV(emv(tag('01', '11'), tag('15', '6200123456789012'), tag('53', '156'), tag('58', 'CN'), tag('59', 'A'), tag('60', 'B')))!;
  assert.equal(e.initiation, 'static');
  assert.deepEqual(e.accounts, [{ tag: '15', id: '6200123456789012', fields: {} }]);
  assert.equal(e.currencyCode, 'CNY');
});

test('a changed character fails the CRC', () => {
  const tampered = LAO.replace('15000', '95000');
  assert.equal(parseEMV(tampered)?.valid, false);
  assert.equal(parseEMV(LAO.toLowerCase().replace(/^000201/, '000201'))?.valid, false);
});

test('not EMV, or malformed: null', () => {
  assert.equal(parseEMV('https://example.com'), null);
  assert.equal(parseEMV('000201010211999'), null); // length runs past the end
  assert.equal(parseEMV('0002020102'), null); // payload format must be 01
});

test('acceptEMV lets only matching, intact payment codes through', async () => {
  assert.equal(await acceptEMV()(result(LAO)), true);
  assert.equal(await acceptEMV({ message: 'no' })(result('hello')), 'no');
  assert.equal(await acceptEMV()(result(LAO.replace('15000', '95000'))), 'Not a payment QR code');
  assert.equal(await acceptEMV({ currency: 'LAK', country: 'la' })(result(LAO)), true);
  assert.equal(await acceptEMV({ currency: ['418'] })(result(LAO)), true);
  assert.equal(await acceptEMV({ currency: 'THB' })(result(LAO)), 'Not a payment QR code');
  assert.equal(await acceptEMV({ accounts: ['a005266284662577'] })(result(LAO)), true);
  assert.equal(await acceptEMV({ accounts: ['A000000677010111'] })(result(LAO)), 'Not a payment QR code');
  assert.equal(await acceptEMV({ dynamicOnly: true })(result(LAO)), true);
  const seen: string[] = [];
  assert.equal(await acceptEMV({ check: async (e) => { seen.push(e.merchantName!); return 'over limit'; } })(result(LAO)), 'over limit');
  assert.deepEqual(seen, ['KHAMPHOUI SHOP']);
});
