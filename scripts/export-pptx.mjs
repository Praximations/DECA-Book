// dist/book.html -> dist/<name>.pptx
// Every page becomes one 8.5x11 in slide built from NATIVE, editable objects:
//   • text  -> real text boxes (font, size, weight, color, spacing, alignment, bullets)
//   • boxes -> real shapes (fills, rounded corners, borders, transparency)
//   • photos -> real pictures (pre-cropped to the frame)
//   • charts / SVG / anything marked data-pptx="raster" -> high-res transparent PNG
// Mark an element data-pptx="skip" to leave it out, data-pptx="raster" to flatten it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DIST, openBook, config, mb } from './lib.mjs';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const sharp = (await import('sharp')).default;

const cfg = config();
const SCALE = 3; // raster resolution: 3x CSS px = 288 dpi
const ASSETS = path.join(DIST, 'pptx-assets');
fs.mkdirSync(ASSETS, { recursive: true });
const IN = (px) => px / 96;

const { browser, page } = await openBook({ scale: SCALE });

await page.addStyleTag({ content: `
  html.pptx-capture, html.pptx-capture body, html.pptx-capture .page { background: transparent !important; box-shadow: none !important; }
  html.pptx-capture * { visibility: hidden !important; }
  html.pptx-capture [data-capture], html.pptx-capture [data-capture] * { visibility: visible !important; }
  html.pptx-capture [data-capture-bg] { visibility: visible !important; }
  html.pptx-capture [data-capture-bg] * { visibility: hidden !important; }
` });

/* ------------------------------------------------------------------ */
/* 1. Walk the DOM of every page and describe it as slide objects       */
/* ------------------------------------------------------------------ */
const slides = await page.evaluate(() => {
  let rid = 0;
  const parseColor = (c) => {
    const m = c && c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    if (a === 0) return null;
    const hex = [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, alpha: a };
  };
  const firstFont = (f) => f.split(',')[0].replace(/["']/g, '').trim();
  const px = (v) => parseFloat(v) || 0;

  return [...document.querySelectorAll('.page')].map((pageEl) => {
    const P = pageEl.getBoundingClientRect();
    const rel = (r) => ({ x: r.left - P.left, y: r.top - P.top, w: r.width, h: r.height });
    const items = [];
    const pcs = getComputedStyle(pageEl);
    const bg = parseColor(pcs.backgroundColor);

    const styleOf = (el) => {
      const cs = getComputedStyle(el);
      const col = parseColor(cs.color) || { hex: '000000', alpha: 1 };
      return {
        fontFace: firstFont(cs.fontFamily),
        fontSize: px(cs.fontSize) * 0.75,
        bold: +cs.fontWeight >= 600,
        weight: +cs.fontWeight,
        italic: cs.fontStyle === 'italic',
        underline: cs.textDecorationLine.includes('underline'),
        color: col.hex,
        transparency: Math.round((1 - col.alpha) * 100),
        charSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) * 0.75,
        upper: cs.textTransform === 'uppercase',
        superscript: cs.verticalAlign === 'super',
      };
    };

    const collect = (node, runs) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.textContent) runs.push({ text: n.textContent, style: styleOf(n.parentElement) }); }
        else if (n.nodeType === 1) {
          if (n.tagName === 'BR') runs.push({ br: true });
          else if (getComputedStyle(n).display === 'inline' && n.dataset.pptx !== 'skip') collect(n, runs);
        }
      }
      return runs;
    };

    const normalizeRuns = (runs) => {
      // Apply CSS white-space collapsing across runs
      const out = [];
      let atLineStart = true;
      for (const r of runs) {
        if (r.br) { out.push(r); atLineStart = true; continue; }
        let t = r.text.replace(/\s+/g, ' ');
        if (r.style.upper) t = t.toUpperCase();
        if (atLineStart) t = t.replace(/^ /, '');
        const prev = out[out.length - 1];
        if (prev && !prev.br && prev.text.endsWith(' ') && t.startsWith(' ')) t = t.slice(1);
        if (!t) continue;
        out.push({ text: t, style: r.style });
        atLineStart = false;
      }
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].br) continue;
        out[i].text = out[i].text.replace(/ $/, '');
        if (out[i].text) break;
      }
      // also trim trailing spaces before each <br>
      out.forEach((r, i) => { if (!r.br && out[i + 1]?.br) r.text = r.text.replace(/ $/, ''); });
      return out.filter((r) => r.br || r.text);
    };

    const pseudoText = (el, which) => {
      const c = getComputedStyle(el, which).content;
      if (!c || c === 'none' || c === 'normal' || !/^["']/.test(c)) return null;
      return c.slice(1, -1);
    };

    const addShape = (el, cs, r) => {
      const fill = parseColor(cs.backgroundColor);
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({
        w: px(cs[`border${s}Width`]), c: parseColor(cs[`border${s}Color`]), style: cs[`border${s}Style`],
      })).map((b) => (b.style === 'none' || !b.c || b.w === 0 ? null : b));
      const uniform = bw.every((b) => b && b.w === bw[0].w && b.c.hex === bw[0].c.hex);
      let radius = cs.borderTopLeftRadius.endsWith('%') ? (px(cs.borderTopLeftRadius) / 100) * Math.min(r.width, r.height) : px(cs.borderTopLeftRadius);
      const R = rel(r);
      const opacity = +cs.opacity;
      if (fill || uniform) {
        const minSide = Math.min(R.w, R.h);
        const shape = radius >= minSide / 2 - 0.5 && Math.abs(R.w - R.h) < 1 ? 'ellipse' : radius > 0 ? 'roundRect' : 'rect';
        items.push({
          type: 'shape', shape, ...R, radius: Math.min(radius, minSide / 2),
          fill: fill ? { hex: fill.hex, alpha: fill.alpha * opacity } : null,
          line: uniform ? { hex: bw[0].c.hex, width: bw[0].w * 0.75, alpha: bw[0].c.alpha, dashed: bw[0].style === 'dashed' } : null,
          name: `${el.tagName.toLowerCase()}${el.classList[0] ? '.' + el.classList[0] : ''}`,
        });
      }
      if (!uniform) {
        // Individual borders (dividers, table rules) -> thin filled rectangles
        const [t, rt, b, l] = bw;
        const side = (x, y, w, h, s) => s && items.push({ type: 'shape', shape: 'rect', x, y, w, h, radius: 0, fill: { hex: s.c.hex, alpha: s.c.alpha }, line: null, name: 'border' });
        side(R.x, R.y, R.w, t?.w, t); side(R.x + R.w - (rt?.w || 0), R.y, rt?.w, R.h, rt);
        side(R.x, R.y + R.h - (b?.w || 0), R.w, b?.w, b); side(R.x, R.y, l?.w, R.h, l);
      }
    };

    const walk = (el, inheritedOpacity = 1) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const mode = el.dataset?.pptx;
      if (mode === 'skip') return;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();

      if (mode === 'raster' || tag === 'svg' || tag === 'canvas' || tag === 'video') {
        el.dataset.rid = ++rid;
        items.push({ type: 'raster', rid, ...rel(r), pad: tag === 'svg' ? 8 : 0, name: `${tag}${el.classList[0] ? '.' + el.classList[0] : ''}` });
        return;
      }
      if (tag === 'img') {
        if (px(cs.borderTopLeftRadius) > 0) {
          el.dataset.rid = ++rid;
          items.push({ type: 'raster', rid, ...rel(r), pad: 0, name: 'img' });
        } else {
          items.push({ type: 'image', src: el.currentSrc, ...rel(r), fit: cs.objectFit, position: cs.objectPosition, name: el.alt || 'image' });
        }
        return;
      }

      if (el !== pageEl) {
        if (cs.backgroundImage !== 'none') {
          el.dataset.rid = ++rid;
          items.push({ type: 'raster', rid, bgOnly: true, ...rel(r), pad: 0, name: 'background' });
        } else addShape(el, cs, r);
      }

      // Text: block-level element with inline content
      const runs = normalizeRuns(collect(el, []));
      if (runs.some((x) => x.text) && cs.display !== 'inline') {
        const before = pseudoText(el, '::before'), after = pseudoText(el, '::after');
        if (before) runs.unshift({ text: before, style: styleOf(el) });
        if (after) runs.push({ text: after, style: styleOf(el) });
        const bx = rel(r);
        const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth), pr = px(cs.paddingRight) + px(cs.borderRightWidth);
        const pt = px(cs.paddingTop) + px(cs.borderTopWidth), pb = px(cs.paddingBottom) + px(cs.borderBottomWidth);
        // Tight vertical bounds of the rendered text
        const range = document.createRange(); range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        const top = rects.length ? Math.min(...rects.map((q) => q.top)) - P.top : bx.y + pt;
        const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
        let align = cs.textAlign;
        if (align === 'start' || align === '-webkit-left') align = 'left';
        if (align === 'end' || align === '-webkit-right') align = 'right';
        if (align === '-webkit-center') align = 'center';
        let bullet = null;
        if (tag === 'li' && cs.listStyleType !== 'none') {
          const parentPad = px(getComputedStyle(el.parentElement).paddingLeft);
          bullet = { type: cs.listStyleType === 'decimal' ? 'number' : 'disc', indent: parentPad * 0.75, offset: parentPad };
        }
        // Text box spans the content box; flex/table-cell centering is preserved via the measured top
        const contentY = bx.y + pt, contentH = bx.h - pt - pb;
        const textH = rects.length ? Math.max(...rects.map((q) => q.bottom)) - P.top - top : contentH;
        const lines = Math.round(textH / lh);
        // Browsers split extra leading above/below each line; PowerPoint puts it all above.
        // Shift the box so the first baseline lands where the browser drew it.
        const fr = runs.find((x) => x.text).style;
        const ctx = (window.__metricsCtx ||= document.createElement('canvas').getContext('2d'));
        ctx.font = `${fr.italic ? 'italic ' : ''}${fr.weight} ${fr.fontSize / 0.75}px "${fr.fontFace}"`;
        const fm = ctx.measureText('Hg');
        const baselineShift = (fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent - lh) / 2;
        items.push({
          type: 'text',
          x: bx.x + pl - (bullet ? bullet.offset : 0), y: top + baselineShift, shift: baselineShift, w: bx.w - pl - pr + (bullet ? bullet.offset : 0), h: Math.max(textH, lh),
          contentY, contentH, runs, align, lineSpacing: lh * 0.75, singleLine: lines <= 1, bullet,
          name: `${tag}${el.classList[0] ? '.' + el.classList[0] : ''}`,
        });
      }

      for (const child of el.children) {
        const d = getComputedStyle(child).display;
        if (d === 'inline' && !['IMG', 'svg'].includes(child.tagName) && child.tagName !== 'SVG') {
          // inline content is part of the parent's text runs, but may contain block-ish children
          for (const g of child.querySelectorAll('img, svg')) walk(g);
          continue;
        }
        walk(child);
      }
    };

    walk(pageEl);
    return {
      number: pageEl.dataset.pageNumber || null,
      background: bg ? bg.hex : 'FFFFFF',
      items,
    };
  });
});

/* ------------------------------------------------------------------ */
/* 2. Capture rasters (charts, SVG, rounded photos, gradients)          */
/* ------------------------------------------------------------------ */
const rasters = slides.flatMap((s) => s.items.filter((i) => i.type === 'raster'));
for (const r of rasters) {
  const sel = `[data-rid="${r.rid}"]`;
  await page.evaluate(({ sel, bgOnly }) => {
    document.documentElement.classList.add('pptx-capture');
    document.querySelector(sel).setAttribute(bgOnly ? 'data-capture-bg' : 'data-capture', '');
  }, { sel, bgOnly: !!r.bgOnly });
  const box = await page.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: b.left + window.scrollX, y: b.top + window.scrollY, width: b.width, height: b.height };
  }, sel);
  const clip = { x: box.x - r.pad, y: box.y - r.pad, width: box.width + r.pad * 2, height: box.height + r.pad * 2 };
  r.file = path.join(ASSETS, `raster-${r.rid}.png`);
  await page.screenshot({ path: r.file, clip, fullPage: true, omitBackground: true });
  r.x -= r.pad; r.y -= r.pad; r.w += r.pad * 2; r.h += r.pad * 2;
  await page.evaluate((sel) => {
    document.documentElement.classList.remove('pptx-capture');
    const el = document.querySelector(sel);
    el.removeAttribute('data-capture'); el.removeAttribute('data-capture-bg');
  }, sel);
}
await browser.close();

/* ------------------------------------------------------------------ */
/* 3. Pre-crop photos to their frames (object-fit: cover)               */
/* ------------------------------------------------------------------ */
let imgN = 0;
for (const s of slides) {
  for (const it of s.items.filter((i) => i.type === 'image')) {
    const src = fileURLToPath(it.src);
    const meta = await sharp(src).metadata();
    const target = { w: Math.round(it.w * SCALE), h: Math.round(it.h * SCALE) };
    const out = path.join(ASSETS, `image-${++imgN}${meta.hasAlpha ? '.png' : '.jpg'}`);
    let img = sharp(src).rotate();
    if (it.fit === 'cover') {
      const [px, py] = it.position.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      const pos = py < 0.34 ? (px < 0.34 ? 'northwest' : px > 0.66 ? 'northeast' : 'north') : py > 0.66 ? (px < 0.34 ? 'southwest' : px > 0.66 ? 'southeast' : 'south') : px < 0.34 ? 'west' : px > 0.66 ? 'east' : 'centre';
      img = img.resize({ width: Math.min(target.w, meta.width), height: Math.round(Math.min(target.w, meta.width) * (it.h / it.w)), fit: 'cover', position: pos });
    } else {
      img = img.resize({ width: target.w, height: target.h, fit: 'inside', withoutEnlargement: true });
    }
    await (meta.hasAlpha ? img.png() : img.jpeg({ quality: 85, mozjpeg: true })).toFile(out);
    it.file = out;
  }
}

/* ------------------------------------------------------------------ */
/* 4. Write the PowerPoint                                              */
/* ------------------------------------------------------------------ */
const pres = new PptxGenJS();
pres.defineLayout({ name: 'LETTER_PORTRAIT', width: 8.5, height: 11 });
pres.layout = 'LETTER_PORTRAIT';
pres.title = `${cfg.projectTitle} — ${cfg.business}`;
pres.author = cfg.participants.join(', ');
pres.subject = cfg.event;
const fontFor = (family) => cfg.fonts.find((f) => f.family === family)?.family || family;
pres.theme = { headFontFace: fontFor(cfg.fonts[1]?.family || cfg.fonts[0].family), bodyFontFace: fontFor(cfg.fonts[0].family) };

// Extra text-box width so slightly different font metrics in PowerPoint/Canva don't force new
// line breaks. Single lines don't wrap at all, so they get more room for free.
const slackFor = (it) => (it.singleLine ? 0.06 : 0.008);

for (const s of slides) {
  const slide = pres.addSlide();
  slide.background = { color: s.background };
  slide.addNotes(s.number ? `Body page ${s.number}` : 'Front matter (not numbered)');
  for (const it of s.items) {
    if (it.type === 'shape') {
      if (!it.w || !it.h) continue;
      const shapeType = { rect: pres.ShapeType.rect, roundRect: pres.ShapeType.roundRect, ellipse: pres.ShapeType.ellipse }[it.shape];
      // Square-cornered fills overlap by a hair so neighbours (table cells) don't show seams
      const bleed = it.shape === 'rect' && it.fill && !it.line ? 0.4 : 0;
      const o = { x: IN(it.x - bleed), y: IN(it.y - bleed), w: IN(it.w + bleed * 2), h: IN(it.h + bleed * 2), objectName: it.name };
      o.fill = it.fill ? { color: it.fill.hex, transparency: Math.round((1 - it.fill.alpha) * 100) } : { type: 'none' };
      o.line = it.line ? { color: it.line.hex, width: it.line.width, transparency: Math.round((1 - it.line.alpha) * 100), dashType: it.line.dashed ? 'dash' : 'solid' } : { type: 'none' };
      if (it.shape === 'roundRect') o.rectRadius = IN(it.radius);
      slide.addShape(shapeType, o);
    } else if (it.type === 'image' || it.type === 'raster') {
      slide.addImage({ path: it.file, x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h), objectName: it.name, altText: it.name });
    } else if (it.type === 'text') {
      const extra = it.w * slackFor(it) + 1;
      let x = it.x;
      if (it.align === 'center') x -= extra / 2;
      else if (it.align === 'right') x -= extra;
      const runs = [];
      it.runs.forEach((r, i) => {
        if (r.br) { if (runs.length) runs[runs.length - 1].options.breakLine = true; return; }
        const st = r.style;
        runs.push({
          text: r.text,
          options: {
            fontFace: st.fontFace, fontSize: Math.round(st.fontSize * 2) / 2, bold: st.bold, italic: st.italic,
            underline: st.underline ? { style: 'sng' } : undefined, color: st.color,
            transparency: st.transparency || undefined, charSpacing: st.charSpacing || undefined,
            superscript: st.superscript || undefined,
            align: it.align === 'justify' ? 'justify' : it.align, lineSpacing: Math.round(it.lineSpacing * 10) / 10,
            bullet: it.bullet ? (it.bullet.type === 'number' ? { type: 'number', indent: it.bullet.indent } : { indent: it.bullet.indent }) : undefined,
          },
        });
      });
      if (!runs.length) continue;
      slide.addText(runs, {
        x: IN(x), y: IN(it.y), w: IN(it.w + extra), h: IN(it.h), margin: 0, valign: 'top',
        wrap: !it.singleLine, fit: 'none', isTextBox: true, objectName: it.name,
      });
    }
  }
}

const out = path.join(DIST, `${cfg.outputName || 'DECA-Book'}.pptx`);
await pres.writeFile({ fileName: out });
console.log(`✓ PowerPoint written: ${path.relative(process.cwd(), out)} (${mb(fs.statSync(out).size)}, ${slides.length} slides, ${rasters.length} raster element(s))`);
