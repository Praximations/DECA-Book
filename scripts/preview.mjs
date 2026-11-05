// Screenshots every page to dist/preview/NN-pXX.png for quick review.
// `npm run preview -- 3 4` renders only sheets 3 and 4 (1-based, counting the title page).
import fs from 'node:fs';
import path from 'node:path';
import { DIST, openBook } from './lib.mjs';

const only = process.argv.slice(2).map(Number);
const dir = path.join(DIST, 'preview');
fs.mkdirSync(dir, { recursive: true });
const { browser, page } = await openBook({ scale: 1.5 });
const pages = await page.$$('.page');
for (let i = 0; i < pages.length; i++) {
  if (only.length && !only.includes(i + 1)) continue;
  const label = await pages[i].evaluate((el) => (el.dataset.pageNumber ? `p${el.dataset.pageNumber.padStart(2, '0')}` : 'front'));
  await pages[i].screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${label}.png`) });
}
await browser.close();
console.log(`✓ Previews in ${path.relative(process.cwd(), dir)}/`);
