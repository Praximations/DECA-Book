// Assembles src/pages/*.html into dist/book.html (+ styles, fonts, images, chart data).
// `node scripts/build.mjs` builds once; the studio imports build() and runs it on every change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DIST, config } from './lib.mjs';
import { optimizeImages, optimizedDir } from './optimize-images.mjs';

export const SRC = path.join(ROOT, 'src');
const ICONS = path.join(SRC, 'icons');

/**
 * Fills {{key}}, {{key|dots}} and {{icon name}} in a page's source text.
 * Returns the filled html and a map of every replacement (source range -> output range),
 * so the studio can turn a position in the built page back into a position in the source.
 */
export function fillPage(src, cfg) {
  const map = [];
  let out = '', last = 0;
  const re = /\{\{\s*(?:icon\s+([\w-]+)|([\w.]+)\s*(\|\s*dots)?)\s*\}\}/g;
  let m;
  while ((m = re.exec(src))) {
    let value;
    if (m[1]) {
      const f = path.join(ICONS, `${m[1]}.svg`);
      if (!fs.existsSync(f)) { console.warn(`⚠ unknown icon ${m[1]}`); value = ''; }
      else value = fs.readFileSync(f, 'utf8').trim();
    } else {
      const v = m[2].split('.').reduce((o, k) => (o ?? {})[k], cfg);
      if (v === undefined) { console.warn(`⚠ unknown placeholder ${m[0]}`); value = m[0]; }
      else value = Array.isArray(v) ? v.join(m[3] ? ' · ' : '<br>') : String(v);
    }
    out += src.slice(last, m.index);
    map.push({ srcStart: m.index, srcEnd: m.index + m[0].length, outStart: out.length, outEnd: out.length + value.length, token: m[0] });
    out += value;
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  return { html: out, map };
}

export const pageFiles = () => fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort();

export async function build({ quiet = false } = {}) {
  const cfg = config();
  for (const d of ['fonts', 'styles', 'js', 'assets']) fs.rmSync(path.join(DIST, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });

  // 1. Fonts: latin subsets from @fontsource, plus fonts.css
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

  // 3. Images (compressed copies keep the PDF small; IMG_PRESET=compact shrinks them further)
  await optimizeImages({ quiet });
  fs.cpSync(optimizedDir(), path.join(DIST, 'assets/images'), { recursive: true });

  // 4. Chart data
  const charts = {};
  for (const f of fs.readdirSync(path.join(SRC, 'charts')).filter((f) => f.endsWith('.json'))) {
    charts[path.basename(f, '.json')] = JSON.parse(fs.readFileSync(path.join(SRC, 'charts', f), 'utf8'));
  }

  // 5. Pages, in filename order; each page section remembers which file it came from
  const files = pageFiles();
  const pages = files.map((f) => {
    const { html } = fillPage(fs.readFileSync(path.join(SRC, 'pages', f), 'utf8'), cfg);
    return `<!-- ${f} -->\n` + html.trim().replace(/<section\b/, `<section data-file="${f}"`);
  });

  // base.css imports fonts + tokens; every other stylesheet in src/styles is linked after it
  const extraCss = fs.readdirSync(path.join(SRC, 'styles')).filter((f) => f.endsWith('.css') && !['base.css', 'tokens.css', 'fonts.css', 'components.css'].includes(f)).sort();
  const styleLinks = ['base.css', 'components.css', ...extraCss].map((f) => `<link rel="stylesheet" href="styles/${f}">`).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${cfg.projectTitle} — ${cfg.business}</title>
${styleLinks}
</head>
<body>
${pages.join('\n\n')}
<script>window.BOOK = ${JSON.stringify(cfg)}; window.CHARTS = ${JSON.stringify(charts)};</script>
<script src="js/runtime.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(DIST, 'book.html'), html);
  if (!quiet) console.log(`✓ Built dist/book.html from ${files.length} page files`);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
