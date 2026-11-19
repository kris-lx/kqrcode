// Shared paths/options for test & benchmark scripts – portable across machines and OSes.
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Repository root, forward slashes, trailing slash. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').split(path.sep).join('/') + '/';
/** Scratch directory for fake-camera videos and screenshots. */
export const TMP = path.join(os.tmpdir(), 'kqrcode-test').split(path.sep).join('/') + '/';
mkdirSync(TMP, { recursive: true });
/** Launch options for Google Chrome: CHROME_PATH if set, otherwise the installed stable channel. */
export const chromeOpts = (): { executablePath?: string; channel?: string } =>
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
