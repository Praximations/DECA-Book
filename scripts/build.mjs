// Assembles src/pages/*.html into dist/book.html (+ styles, fonts, images, chart data).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DIST, config } from './lib.mjs';
import { optimizeImages } from './optimize-images.mjs';

const cfg = config();
const SRC = path.join(ROOT, 'src');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });

// 1. Fonts: copy latin subsets from @fontsource and write fonts.css
let fontCss = '';
for (const f of cfg.fonts) {
  const dir = path.join(ROOT, 'node_modules/@fontsource', f.package, 'files');
  const faces = [...f.weights.map((w) => [w, 'normal']), ...(f.italicWeights || []).map((w) => [w, 'italic'])];
  for (const [w, style] of faces) {
    const file = `${f.package}-latin-${w}-${style}.woff2`;
    if (!fs.existsSync(path.join(dir, file))) { console.warn(`⚠ missing font file ${file}`); continue; }
    fs.copyFileSync(path.join(dir, file), path.join(DIST, 'fonts', file));
    fontCss += `@font-face{font-family:"${f.family}";font-style:${style};font-weight:${w};font-display:block;src:url("../fonts/${file}") format("woff2");}\n`;
  }
}

// 2. Styles + runtime
fs.cpSync(path.join(SRC, 'styles'), path.join(DIST, 'styles'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'styles/fonts.css'), fontCss);
fs.cpSync(path.join(SRC, 'js'), path.join(DIST, 'js'), { recursive: true });

// 3. Images (compressed copies keep the PDF under the size limit)
await optimizeImages();
fs.cpSync(path.join(SRC, 'assets/images/optimized'), path.join(DIST, 'assets/images'), { recursive: true });

// 4. Chart data
const charts = {};
for (const f of fs.readdirSync(path.join(SRC, 'charts')).filter((f) => f.endsWith('.json'))) {
  charts[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(SRC, 'charts', f), 'utf8'));
}

// 5. Pages, in filename order. {{key}} is replaced with values from book.config.json
const fill = (html) => html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
  const v = key.split('.').reduce((o, k) => (o ?? {})[k], cfg);
  if (v === undefined) { console.warn(`⚠ unknown placeholder ${m}`); return m; }
  return Array.isArray(v) ? v.join('<br>') : v;
});
const pageFiles = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort();
const pages = pageFiles.map((f) => `<!-- ${f} -->\n` + fill(fs.readFileSync(path.join(SRC, 'pages', f), 'utf8').trim()));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${cfg.projectTitle} — ${cfg.business}</title>
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/components.css">
</head>
<body>
${pages.join('\n\n')}
<script>window.BOOK = ${JSON.stringify(cfg)}; window.CHARTS = ${JSON.stringify(charts)};</script>
<script src="js/runtime.js"></script>
</body>
</html>`;
fs.writeFileSync(path.join(DIST, 'book.html'), html);
console.log(`✓ Built dist/book.html from ${pageFiles.length} page files`);
