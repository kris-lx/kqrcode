/**
 * Writes the latest benchmark numbers (bench/out/results.json from `bench/run.mts`)
 * into README.md between <!-- BENCH:START --> and <!-- BENCH:END -->.
 *
 *   npx tsx bench/run.mts && npx tsx bench/update-readme.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('bench/out/results.json', ROOT), 'utf8'));
const { manifest, results } = data as {
  manifest: { id: string; module: number; blur: number; contrast: string; empty: boolean }[];
  results: Record<string, Record<string, { ok: boolean; ms: number }>>;
};

const pick = (re: RegExp) => {
  const k = Object.keys(results).find((n) => re.test(n));
  if (!k) throw new Error('engine not found in results.json: ' + re);
  return results[k];
};
const engines: [string, Record<string, { ok: boolean; ms: number }>][] = [
  ['**k-qr-scanner**', pick(/(kqrcode|kpay).*ONNX/)],
  ['WeChat ¹', pick(/WeChat.*1 thr/)],
  ['ZXing-WASM', pick(/^ZXing/)],
  ['jsQR', pick(/^jsQR$/)],
];

const codes = manifest.filter((m) => !m.empty);
const empty = manifest.filter((m) => m.empty);
const rate = (r: Record<string, { ok: boolean }>, f: (m: (typeof manifest)[0]) => boolean) => {
  const g = codes.filter(f);
  return (100 * g.filter((m) => r[m.id]?.ok).length) / g.length;
};
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

type Row = { label: string; values: number[]; unit: '%' | 'ms'; better: 'high' | 'low' };
const rows: Row[] = [
  { label: '🎯 Decode rate: all frames', unit: '%', better: 'high', values: engines.map(([, r]) => rate(r, () => true)) },
  { label: '🔭 Far: 1.5 px modules', unit: '%', better: 'high', values: engines.map(([, r]) => rate(r, (m) => m.module === 1.5)) },
  { label: '🔭 Far: 2.5 px modules', unit: '%', better: 'high', values: engines.map(([, r]) => rate(r, (m) => m.module === 2.5)) },
  { label: '🌫️ Blurred (σ 0.8)', unit: '%', better: 'high', values: engines.map(([, r]) => rate(r, (m) => m.blur === 0.8)) },
  { label: '🌗 Low contrast', unit: '%', better: 'high', values: engines.map(([, r]) => rate(r, (m) => m.contrast === 'low')) },
  { label: '⏱️ Latency per frame (p50 / p95)', unit: 'ms', better: 'low', values: engines.map(([, r]) => q(codes.map((m) => r[m.id].ms), 0.5)) },
  { label: '💤 Frame without a code (p50)', unit: 'ms', better: 'low', values: engines.map(([, r]) => q(empty.map((m) => r[m.id].ms), 0.5)) },
];
const p95 = engines.map(([, r]) => q(codes.map((m) => r[m.id].ms), 0.95));

const fmt = (v: number, unit: string) => (unit === '%' ? `${Math.round(v)}%` : `${v.toFixed(1)} ms`);
let md = `| Scenario | ${engines.map(([n]) => n).join(' | ')} |\n| :--- |${' :---: |'.repeat(engines.length)}\n`;
for (const row of rows) {
  const best = row.better === 'high' ? Math.max(...row.values) : Math.min(...row.values);
  const cells = row.values.map((v, i) => {
    const isBest = Math.abs(v - best) < (row.unit === '%' ? 0.5 : 0.05);
    let s = isBest ? `**\`${fmt(v, row.unit)}\`** 🏆` : `\`${fmt(v, row.unit)}\``;
    if (row.label.startsWith('⏱️')) s += `<br><sub>p95: ${p95[i].toFixed(1)} ms</sub>`;
    return s;
  });
  md += `| **${row.label}** | ${cells.join(' | ')} |\n`;
}
md += `\n> ${codes.length} synthetic 1280×720 frames + ${empty.length} without a code · single CPU thread · last updated ${new Date().toISOString().slice(0, 10)}\n`;

const readmeUrl = new URL('README.md', ROOT);
const readme = readFileSync(readmeUrl, 'utf8');
const start = '<!-- BENCH:START -->', end = '<!-- BENCH:END -->';
const a = readme.indexOf(start), b = readme.indexOf(end);
if (a < 0 || b < 0) throw new Error('README markers not found');
writeFileSync(readmeUrl, readme.slice(0, a + start.length) + '\n\n' + md + '\n' + readme.slice(b));
console.log(md);
