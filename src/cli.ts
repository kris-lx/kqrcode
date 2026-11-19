/**
 * kqrcode CLI
 *
 *   npx kqrcode init      detect framework + package manager, install kqrcode, add a starter component
 *   npx kqrcode doctor    check the project setup
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0';

/* ------------------------------------------------------------------ */
/* tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1), dim = c(2), green = c(32), yellow = c(33), red = c(31), cyan = c(36);
const log = (s = '') => process.stdout.write(s + '\n');

type Framework = 'next' | 'nuxt' | 'sveltekit' | 'svelte' | 'angular' | 'vue' | 'react' | 'vanilla';
type PM = 'npm' | 'pnpm' | 'yarn' | 'bun';
const THEMES = ['wechat', 'alipay', 'grid', 'frame', 'none'];

interface Args {
  cmd: string;
  cwd: string;
  framework?: Framework;
  pm?: PM;
  theme: string;
  locale: string;
  from?: string;
  install: boolean;
  force: boolean;
  dryRun: boolean;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help', cwd: process.cwd(), theme: 'wechat', locale: 'en', install: true, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--cwd') a.cwd = v();
    else if (k === '--framework' || k === '-f') a.framework = v() as Framework;
    else if (k === '--pm') a.pm = v() as PM;
    else if (k === '--theme') a.theme = v();
    else if (k === '--locale') a.locale = v();
    else if (k === '--from') a.from = v();
    else if (k === '--out') a.out = v();
    else if (k === '--no-install') a.install = false;
    else if (k === '--force') a.force = true;
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--version' || k === '-v') a.cmd = 'version';
    else if (k === '--help' || k === '-h') a.cmd = 'help';
  }
  return a;
}

function readPkg(cwd: string): Record<string, any> | null {
  const f = join(cwd, 'package.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

export function detectFramework(pkg: Record<string, any> | null): Framework {
  const d = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (d.next) return 'next';
  if (d.nuxt) return 'nuxt';
  if (d['@sveltejs/kit']) return 'sveltekit';
  if (d.svelte) return 'svelte';
  if (d['@angular/core']) return 'angular';
  if (d.vue) return 'vue';
  if (d.react) return 'react';
  return 'vanilla';
}

export function detectPM(cwd: string): PM {
  const ua = process.env.npm_config_user_agent ?? '';
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

/* ------------------------------------------------------------------ */
/* starter components                                                  */
/* ------------------------------------------------------------------ */

interface Template { file: string; code: string; usage: string }

export function template(fw: Framework, opts: { ts: boolean; theme: string; locale: string; srcDir: boolean }): Template {
  const { ts, theme, locale } = opts;
  const src = opts.srcDir ? 'src/' : '';
  switch (fw) {
    case 'next':
    case 'react': {
      const file = `${fw === 'next' ? src : 'src/'}components/QrScanner.${ts ? 'tsx' : 'jsx'}`;
      const props = ts ? ': { onResult: (text: string) => void; onClose?: () => void }' : '';
      return {
        file,
        code: `${fw === 'next' ? "'use client';\n\n" : ''}import { QRScanner } from 'kqrcode/react';

/** Full-screen QR scanner. Render it when you want to scan, unmount it to close. */
export default function QrScanner({ onResult, onClose }${props}) {
  return (
    <QRScanner
      theme="${theme}"
      locale="${locale}"
      onScan={(result) => onResult(result.text)}
      onClose={onClose}
    />
  );
}
`,
        usage: `{open && <QrScanner onResult={(text) => { setOpen(false); console.log(text); }} onClose={() => setOpen(false)} />}`,
      };
    }
    case 'nuxt':
    case 'vue': {
      // Nuxt: the .client.vue suffix makes the component browser-only automatically
      const file = fw === 'nuxt' ? 'components/QrScanner.client.vue' : 'src/components/QrScanner.vue';
      return {
        file,
        code: `<script setup${ts ? ' lang="ts"' : ''}>
import { QRScanner } from 'kqrcode/vue';

const emit = defineEmits${ts ? '<{ result: [text: string]; close: [] }>()' : "(['result', 'close'])"};
</script>

<template>
  <QRScanner
    theme="${theme}"
    locale="${locale}"
    @scan="(r) => emit('result', r.text)"
    @close="emit('close')"
  />
</template>
`,
        usage: `<QrScanner v-if="open" @result="(text) => { open = false; console.log(text) }" @close="open = false" />`,
      };
    }
    case 'sveltekit':
    case 'svelte':
      return {
        file: 'src/lib/QrScanner.svelte',
        code: `<script${ts ? ' lang="ts"' : ''}>
  import { qrScanner } from 'kqrcode/svelte';

  let { onresult, onclose }${ts ? ': { onresult: (text: string) => void; onclose?: () => void }' : ''} = $props();
</script>

<!-- Full-screen QR scanner. Render it when you want to scan, remove it to close. -->
<div use:qrScanner={{ theme: '${theme}', locale: '${locale}', onScan: (r) => onresult(r.text), onClose: () => onclose?.() }}></div>
`,
        usage: `{#if open}<QrScanner onresult={(text) => { open = false; console.log(text); }} onclose={() => (open = false)} />{/if}`,
      };
    case 'angular':
      return {
        file: 'src/app/qr-scanner.component.ts',
        code: `import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Output } from '@angular/core';
import 'kqrcode';
import type { ScanResult } from 'kqrcode';

/** Full-screen QR scanner. Render it with @if when you want to scan. */
@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`<kqr-scanner theme="${theme}" locale="${locale}" (scan)="onScan($any($event).detail)" (close)="closed.emit()"></kqr-scanner>\`,
})
export class QrScannerComponent {
  @Output() result = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  onScan(r: ScanResult) { this.result.emit(r.text); }
}
`,
        usage: `@if (open) { <app-qr-scanner (result)="onResult($event)" (closed)="open = false" /> }  // add QrScannerComponent to imports`,
      };
    default:
      return {
        file: `${src}qr-scanner.${ts ? 'ts' : 'js'}`,
        code: `import { scanQR, QRScanner } from 'kqrcode';

// Optional: start downloading the decoder early, e.g. when the page loads.
QRScanner.preload();

/** Opens the full-screen scanner and resolves with the decoded text. */
export async function scan()${ts ? ': Promise<string>' : ''} {
  const result = await scanQR({ theme: '${theme}', locale: '${locale}' });
  return result.text;
}
`,
        usage: `document.querySelector('#scan').addEventListener('click', async () => console.log(await scan()));`,
      };
  }
}

/* ------------------------------------------------------------------ */
/* commands                                                            */
/* ------------------------------------------------------------------ */

function installCmd(pm: PM, spec: string): [string, string[]] {
  switch (pm) {
    case 'pnpm': return ['pnpm', ['add', spec]];
    case 'yarn': return ['yarn', ['add', spec]];
    case 'bun': return ['bun', ['add', spec]];
    default: return ['npm', ['install', spec]];
  }
}

function init(a: Args): number {
  const pkg = readPkg(a.cwd);
  if (!pkg) {
    log(red('✖ No package.json found in ' + a.cwd));
    log(dim('  Run this inside your project, or pass --cwd <dir>.'));
    return 1;
  }
  if (!THEMES.includes(a.theme)) { log(red(`✖ Unknown theme "${a.theme}". Use one of: ${THEMES.join(', ')}`)); return 1; }
  const fw = a.framework ?? detectFramework(pkg);
  const pm = a.pm ?? detectPM(a.cwd);
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  // Nuxt / SvelteKit generate their tsconfig, so a missing root tsconfig.json doesn't mean JavaScript
  const ts = existsSync(join(a.cwd, 'tsconfig.json')) || !!deps.typescript || fw === 'nuxt' || fw === 'angular';
  const srcDir = existsSync(join(a.cwd, 'src'));
  log(`${bold('kqrcode')} ${dim('v' + VERSION)}`);
  log(`  framework        ${cyan(fw)}${a.framework ? '' : dim(' (detected)')}`);
  log(`  package manager  ${cyan(pm)}${a.pm ? '' : dim(' (detected)')}`);
  log(`  language         ${cyan(ts ? 'TypeScript' : 'JavaScript')}`);
  log('');

  // 1) install
  const spec = a.from ?? 'kqrcode';
  if (a.install) {
    const [bin, args] = installCmd(pm, spec);
    log(`${dim('$')} ${bin} ${args.join(' ')}`);
    if (!a.dryRun) {
      // one quoted command string: works with npm.cmd/pnpm.cmd on Windows without DEP0190
      if (spec.includes('"') || spec.includes('\n') || spec.includes('\r')) { log(red('✖ invalid --from value')); return 1; }
      const r = spawnSync(`${bin} ${args.map((x) => `"${x}"`).join(" ")}`, { cwd: a.cwd, stdio: 'inherit', shell: true });
      if (r.status !== 0) { log(red(`✖ ${bin} failed (exit ${r.status}).`)); return r.status ?? 1; }
    }
    log(green('✔ installed kqrcode'));
  }

  // 2) starter component
  const t = template(fw, { ts, theme: a.theme, locale: a.locale, srcDir });
  const target = join(a.cwd, a.out ?? t.file);
  const shown = relative(a.cwd, target).split('\\').join('/');
  if (existsSync(target) && !a.force) {
    log(yellow(`! ${shown} already exists – left untouched (use --force to overwrite)`));
  } else {
    if (!a.dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, t.code);
    }
    log(green(`✔ created ${shown}`));
  }

  // 3) next steps
  log('');
  log(bold('Next steps'));
  log(`  Use it:  ${t.usage}`);
  log(`  Camera access needs ${bold('HTTPS')} (localhost is fine during development).`);
  log(`  Themes, slots and options: ${cyan('https://github.com/kris-lx/kqrcode#readme')}`);
  return 0;
}

function doctor(a: Args): number {
  const pkg = readPkg(a.cwd);
  let problems = 0;
  const ok = (m: string) => log(green('✔ ') + m);
  const warn = (m: string) => { log(yellow('! ') + m); };
  const bad = (m: string) => { problems++; log(red('✖ ') + m); };

  const major = parseInt(process.versions.node, 10);
  major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} – Node 18+ is required for the build tooling`);
  if (!pkg) { bad('No package.json in ' + a.cwd); return 1; }

  const fw = detectFramework(pkg);
  ok(`framework: ${fw}`);
  const declared = pkg.dependencies?.kqrcode ?? pkg.devDependencies?.kqrcode;
  const installedPkg = readPkg(join(a.cwd, 'node_modules', 'kqrcode'));
  if (!declared) bad('kqrcode is not in dependencies – run: npx kqrcode init');
  else if (!installedPkg) bad(`kqrcode ${declared} is declared but not installed – run your package manager's install`);
  else ok(`kqrcode ${installedPkg.version} installed`);

  const d = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (fw === 'react' || fw === 'next') {
    const v = parseInt(String(d.react ?? '').replace(/[^\d]/, ''), 10);
    v && v < 17 ? bad('React 17+ is required') : ok('React version ok');
  }
  if (fw === 'vue' || fw === 'nuxt') {
    warn('If you use the raw <kqr-scanner> tag in Vue templates (instead of kqrcode/vue), add it to compilerOptions.isCustomElement');
  }
  if (fw === 'angular') warn('Add CUSTOM_ELEMENTS_SCHEMA to components that use <kqr-scanner>');
  if (fw === 'nuxt') warn('Render the scanner client-side only: <ClientOnly> or a *.client.vue component');

  for (const f of ['index.html', 'public/index.html', 'src/index.html', 'src/app.html']) {
    const p = join(a.cwd, f);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    const csp = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)/i)?.[1];
    if (csp) {
      if (!/worker-src[^;]*blob:/.test(csp) && !/default-src[^;]*blob:/.test(csp)) bad(`${f}: CSP must allow "worker-src blob:"`);
      if (!/'wasm-unsafe-eval'|'unsafe-eval'/.test(csp)) bad(`${f}: CSP must allow "script-src 'wasm-unsafe-eval'"`);
      else ok(`${f}: CSP allows workers and WebAssembly`);
    }
  }
  log('');
  log(problems ? red(`${problems} problem(s) found`) : green('All good.'));
  return problems ? 1 : 0;
}

function help() {
  log(`${bold('kqrcode')} ${dim('v' + VERSION)} – QR code scanner for the web

${bold('Usage')}
  npx kqrcode init [options]     install kqrcode and add a starter component
  npx kqrcode doctor             check the project setup

${bold('Options for init')}
  --framework <name>   next | nuxt | sveltekit | svelte | angular | vue | react | vanilla  (auto-detected)
  --pm <name>          npm | pnpm | yarn | bun  (auto-detected from the lockfile)
  --theme <name>       ${THEMES.join(' | ')}  (default: wechat)
  --locale <code>      en | lo | zh  (default: en)
  --out <path>         where to write the component (default depends on the framework)
  --from <spec>        install from a version, tag or tarball instead of "kqrcode"
  --no-install         only create the component
  --force              overwrite an existing component file
  --dry-run            show what would happen
  --cwd <dir>          project directory (default: current directory)
`);
}

export function main(argv = process.argv.slice(2)): number {
  const a = parseArgs(argv);
  switch (a.cmd) {
    case 'init': return init(a);
    case 'doctor': return doctor(a);
    case 'version': log(VERSION); return 0;
    case 'help': help(); return 0;
    default: log(red(`Unknown command "${a.cmd}"`)); help(); return 1;
  }
}

process.exitCode = main();
