// Builds dist/<name>-Canva-Kit.zip: everything needed to finish the book in Canva.
//   photos/  every photo the book uses, full quality (swap one in a frame or re-crop it)
//   logo/    the Blis Farms logo as SVG and transparent PNG
//   fonts/   the fonts as .woff, only needed if Canva is missing one
//   pages/   a 2x reference image of every page, to compare against after importing
//   README.txt  the import steps
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DIST, config, mb, openBook } from './lib.mjs';

const cfg = config();
const sharp = (await import('sharp')).default;
const name = cfg.outputName || 'DECA-Book';
const KIT = path.join(DIST, 'canva-kit');
fs.rmSync(KIT, { recursive: true, force: true });
for (const d of ['photos', 'logo', 'fonts', 'pages']) fs.mkdirSync(path.join(KIT, d), { recursive: true });

// Photos and logo, from the images the book actually uses
const { browser, page } = await openBook({ scale: 2 });
const used = await page.evaluate(() => [...new Set([...document.images].map((i) => decodeURIComponent(new URL(i.currentSrc).pathname)))]);
for (const file of used) {
  const base = path.basename(file);
  if (/\.svg$/i.test(base)) {
    fs.copyFileSync(file, path.join(KIT, 'logo', base));
    await sharp(file).resize({ width: 2000 }).png().toFile(path.join(KIT, 'logo', base.replace(/\.svg$/i, '.png')));
  } else fs.copyFileSync(file, path.join(KIT, 'photos', base));
}

// Reference image of every page
const pages = await page.$$('.page');
for (let i = 0; i < pages.length; i++) {
  const n = await pages[i].evaluate((el) => (el.dataset.pageNumber ? `page-${el.dataset.pageNumber.padStart(2, '0')}` : null));
  await pages[i].screenshot({ path: path.join(KIT, 'pages', `${String(i + 1).padStart(2, '0')}-${n || (i === 0 ? 'title' : 'contents')}.png`) });
}
await browser.close();

// Fonts (.woff, which Canva's font upload accepts)
for (const f of cfg.fonts) {
  const dir = path.join(ROOT, 'node_modules/@fontsource', f.package, 'files');
  const faces = [...f.weights.map((w) => [w, 'normal']), ...(f.italicWeights || []).map((w) => [w, 'italic'])];
  for (const [w, style] of faces) {
    const file = `${f.package}-latin-${w}-${style}.woff`;
    if (fs.existsSync(path.join(dir, file))) fs.copyFileSync(path.join(dir, file), path.join(KIT, 'fonts', file));
  }
}

const families = cfg.fonts.map((f) => f.family).join(', ');
fs.writeFileSync(path.join(KIT, 'README.txt'), `${cfg.business} DECA book: Canva kit
=====================================

IMPORT
1. In Canva: Create a design > Import file > choose ${name}.pptx.
   Canva keeps the 8.5 x 11 in page size. Every page is one page in Canva.
2. Fonts used: ${families}. All three are in Canva's font library.
   If a font shows a warning, upload it from the fonts/ folder (Brand Kit > Fonts),
   then re-open the design.
3. Compare each page with the matching image in pages/. Small spacing differences
   are normal: Canva measures fonts slightly differently.

WHAT IS EDITABLE
- All text is real text. Paragraphs and bullet lists sit in one text box each, so
  they reflow when you edit them.
- Boxes, cards, lines, rings and the gold frame are Canva shapes: change colour,
  size or corners freely.
- Photos are separate pictures, already cut to their shape (circle, diagonal corner,
  rounded card). To swap one, upload the new photo, drag it in, and crop it to the
  same shape (or use a Canva frame). The originals are in photos/.
- Charts and small icons are pictures. Change chart numbers in the code
  (src/charts/*.json) and export again.

TIPS
- Change the design in the code when you can, then re-export. It keeps the
  PDF, the PowerPoint and Canva identical. Use Canva for final touches.
- DECA: the finished PDF must be 8.5 x 11 in, at most 20 numbered pages
  plus the title page and table of contents, and under 50 MB.
  Download from Canva as "PDF Standard" to stay small.
`);

// Zip it (with the PowerPoint inside, so one download has everything)
const pptx = path.join(DIST, `${name}.pptx`);
if (fs.existsSync(pptx)) fs.copyFileSync(pptx, path.join(KIT, `${name}.pptx`));
const zip = path.join(DIST, `${name}-Canva-Kit.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: KIT });
console.log(`✓ Canva kit written: ${path.relative(process.cwd(), zip)} (${mb(fs.statSync(zip).size)}: ${used.length} images, ${pages.length} page references)`);
