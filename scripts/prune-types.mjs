// Removes .d.ts files that no public entry point reaches (internal modules, generated sources).
// Runs after `tsc -p tsconfig.build.json`; keeps the package small and its types tidy.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const ENTRIES = ['index', 'react', 'vue', 'svelte', 'react-native', 'sr-entry'];

const keep = new Set();
const todo = [...ENTRIES];
while (todo.length) {
  const name = todo.pop();
  if (keep.has(name)) continue;
  const file = new URL(`${name}.d.ts`, dist);
  if (!existsSync(file)) throw new Error(`missing dist/${name}.d.ts`);
  keep.add(name);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:from\s+|import\()\s*['"]\.\/([\w.\-]+?)(?:\.js)?['"]/g)) todo.push(m[1]);
}

const removed = [];
for (const f of readdirSync(dist)) {
  if (f.endsWith('.d.ts') && !keep.has(f.slice(0, -5))) {
    rmSync(new URL(f, dist));
    removed.push(f);
  }
}
console.log(`types: kept ${keep.size}, removed ${removed.length} internal (${removed.join(', ')})`);
