// Penalty Point Checklist + layout lint. Run after `npm run pdf` (npm run all does both).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DIST, openBook, config, mb } from './lib.mjs';

const cfg = config();
const errors = [], warnings = [];
const { browser, page } = await openBook();

const report = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('.page')];
  const body = pages.filter((p) => p.classList.contains('body'));
  const out = { total: pages.length, body: body.length, sizes: [], sections: [], overflow: [], todos: [], execPages: 0, front: [] };
  pages.forEach((p, i) => {
    const r = p.getBoundingClientRect();
    out.sizes.push([Math.round(r.width), Math.round(r.height)]);
    if (!p.classList.contains('body')) out.front.push(i + 1);
    const name = p.dataset.pageNumber ? `page ${p.dataset.pageNumber}` : `front sheet ${i + 1}`;
    const cs = getComputedStyle(p);
    const limitB = r.bottom - parseFloat(cs.paddingBottom) + 2;
    const limitR = r.right - parseFloat(cs.paddingRight) + 2;
    const limitL = r.left + parseFloat(cs.paddingLeft) - 2;
    const reported = new Set();
    p.querySelectorAll('*').forEach((el) => {
      if (el.closest('.page-footer, [data-bleed]') || !el.getClientRects().length) return;
      if (el instanceof SVGElement && el.tagName !== 'svg') return;
      const e = el.getBoundingClientRect();
      if (e.width === 0 || e.height === 0) return;
      const label = `<${el.tagName.toLowerCase()} class="${el.className.baseVal ?? el.className}"> "${(el.textContent || '').trim().slice(0, 40)}"`;
      if ((e.bottom > limitB || e.right > limitR || e.left < limitL) && !p.classList.contains('cover')) {
        if (![...reported].some((a) => a.contains(el))) { reported.add(el); out.overflow.push(`${name}: ${label} runs past the page margin`); }
      }
      const ecs = getComputedStyle(el);
      if (ecs.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.tagName !== 'IMG')
        out.overflow.push(`${name}: content is clipped inside ${label}`);
    });
    p.querySelectorAll('.todo').forEach(() => out.todos.push(name));
  });
  let inExec = false;
  body.forEach((p) => {
    const h = p.querySelector('h1[data-section]');
    if (h) {
      out.sections.push({ label: `${h.dataset.section}. ${h.textContent.trim()}`, page: +p.dataset.pageNumber });
      inExec = h.dataset.section === 'I';
    }
    if (inExec) out.execPages++;
  });
  return out;
});
await browser.close();

// Checklist 2: page limit (5 points per page over)
if (report.body > cfg.limits.bodyPages) errors.push(`Body is ${report.body} pages; limit is ${cfg.limits.bodyPages} (5 penalty points per extra page)`);
// Checklist 5: 8.5 x 11 in
report.sizes.forEach(([w, h], i) => { if (w !== 816 || h !== 1056) errors.push(`Sheet ${i + 1} is ${w}x${h}px, not 8.5x11 in`); });
// Checklist 3: title page + TOC unnumbered, body numbered from 1 (handled by runtime.js)
if (report.front.length !== 2) warnings.push(`Expected exactly 2 unnumbered front sheets (title page + table of contents), found ${report.front.length}`);
// Checklist 4: outline followed, in order
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const found = report.sections.map((s) => norm(s.label));
let last = -1;
for (const req of cfg.requiredSections) {
  const idx = found.indexOf(norm(req));
  if (idx === -1) (/appendix/i.test(req) ? warnings : errors).push(`Section missing or misnamed: "${req}"`);
  else if (idx < last) errors.push(`Section out of order: "${req}"`);
  else last = idx;
}
if (report.execPages < 1 || report.execPages > 3) errors.push(`Executive Summary is ${report.execPages} page(s); must be 1 to 3`);
// Layout lint
report.overflow.forEach((m) => warnings.push(m));
if (report.todos.length) warnings.push(`Placeholder blocks still to write on: ${[...new Set(report.todos)].join(', ')}`);

// PDF file checks
const pdf = path.join(DIST, `${cfg.outputName || 'DECA-Book'}.pdf`);
if (fs.existsSync(pdf)) {
  const size = fs.statSync(pdf).size;
  if (size > cfg.limits.pdfMegabytes * 1024 * 1024) errors.push(`PDF is ${mb(size)}; limit is ${cfg.limits.pdfMegabytes} MB`);
  try {
    const info = execFileSync('pdfinfo', ['-l', '999', pdf]).toString();
    const pagesN = +info.match(/Pages:\s+(\d+)/)[1];
    if (pagesN !== report.total) errors.push(`PDF has ${pagesN} pages but the book has ${report.total} sheets (did a page spill over?)`);
    [...info.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/g)].forEach((m, i) => {
      if (Math.round(+m[1]) !== 612 || Math.round(+m[2]) !== 792) errors.push(`PDF page ${i + 1} is not 8.5x11 in`);
    });
    console.log(`PDF: ${pagesN} pages, ${mb(size)}`);
  } catch { warnings.push('pdfinfo not available; skipped PDF page-size check'); }
} else warnings.push('No PDF found; run `npm run pdf` to include file checks');

console.log(`Body pages: ${report.body}/${cfg.limits.bodyPages}   Executive Summary: ${report.execPages} page(s)`);
report.sections.forEach((s) => console.log(`  p.${String(s.page).padStart(2)}  ${s.label}`));
console.log('Reminder: the signed Statement of Assurances and Academic Integrity is submitted separately and is not numbered.\n');
warnings.forEach((w) => console.log('⚠ ' + w));
errors.forEach((e) => console.log('✗ ' + e));
console.log(errors.length ? `\n✗ ${errors.length} penalty risk(s) found` : '\n✓ No penalty risks found');
process.exit(errors.length ? 1 : 0);
