// dist/book.html -> dist/<name>.pdf  (vector text, embedded fonts, 8.5x11 in)
import fs from 'node:fs';
import path from 'node:path';
import { DIST, openBook, config, mb } from './lib.mjs';

const cfg = config();
const suffix = process.env.IMG_PRESET === 'compact' ? '-compact' : '';
const out = path.join(DIST, `${cfg.outputName || 'DECA-Book'}${suffix}.pdf`);
const { browser, page } = await openBook();
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
await browser.close();

const size = fs.statSync(out).size;
const limit = cfg.limits.pdfMegabytes * 1024 * 1024;
console.log(`✓ PDF written: ${path.relative(process.cwd(), out)} (${mb(size)})`);
if (size > limit) {
  console.error(`✗ PDF is over the ${cfg.limits.pdfMegabytes} MB limit. Compress images in src/assets/images/raw or lower MAX in optimize-images.mjs.`);
  process.exit(1);
}
