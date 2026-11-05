import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist');
export const BOOK_HTML = path.join(DIST, 'book.html');
export const config = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'book.config.json'), 'utf8'));

// Playwright is pre-installed globally in this environment; fall back to a local install.
export async function chromium() {
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require('playwright'); } catch { pw = await import('playwright'); }
  return pw.chromium;
}

/** Open dist/book.html and wait until runtime.js finished numbering, TOC and charts. */
export async function openBook({ scale = 1 } = {}) {
  if (!fs.existsSync(BOOK_HTML)) throw new Error('dist/book.html missing — run `npm run build` first');
  const browser = await (await chromium()).launch();
  const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(pathToFileURL(BOOK_HTML).href);
  await page.waitForFunction(() => window.__bookReady === true, null, { timeout: 30000 });
  if (errors.length) console.warn('⚠ Browser errors:\n  ' + errors.join('\n  '));
  return { browser, page };
}

export const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
