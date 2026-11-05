// dist/book.html -> dist/<name>.pptx, built for importing into Canva (and PowerPoint).
//
// Every page becomes one 8.5 x 11 in slide made of NATIVE objects Canva can edit:
//   • text   -> real text boxes. Consecutive paragraphs and list items share ONE box,
//               so text reflows when you edit it, as in a normal document.
//   • boxes  -> real shapes (fill, rounded corners, outline, transparency, soft shadow, rotation)
//   • rules  -> real lines (single-side borders, dividers, table rules)
//   • photos -> real pictures, pre-cut to their frame: cropped, rounded, circular or
//               diagonal (CSS clip-path polygon), so you can still swap or move them
//   • charts, inline SVG icons, anything marked data-pptx="raster" -> sharp PNG
// Markup hints: data-pptx="skip" leaves an element out, data-pptx="raster" flattens it,
// data-pptx-flatten="FFFFFF" makes a flattened element a JPEG on that colour (smaller).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DIST, openBook, config, mb } from './lib.mjs';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const sharp = (await import('sharp')).default;

const cfg = config();
const SCALE = 3; // raster/photo resolution: 3x CSS px = 288 dpi
const ASSETS = path.join(DIST, 'pptx-assets');
fs.rmSync(ASSETS, { recursive: true, force: true });
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
  const px = (v) => parseFloat(v) || 0;
  const parseColor = (c) => {
    const m = c && c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    if (a === 0) return null;
    return { hex: [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase(), alpha: a };
  };
  const firstFont = (f) => f.split(',')[0].replace(/["']/g, '').trim();
  const nameOf = (el) => `${el.tagName.toLowerCase()}${el.classList[0] ? '.' + el.classList[0] : ''}`;
  const isInline = (el) => getComputedStyle(el).display === 'inline';
  const angleOf = (cs) => {
    if (!cs.transform || cs.transform === 'none') return 0;
    const m = cs.transform.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const [a, b] = m[1].split(',').map(Number);
    return Math.round((Math.atan2(b, a) * 180) / Math.PI * 100) / 100;
  };
  const shadowOf = (cs) => {
    if (!cs.boxShadow || cs.boxShadow === 'none' || cs.boxShadow.includes('inset')) return null;
    const col = parseColor(cs.boxShadow);
    const nums = cs.boxShadow.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(px);
    if (!col || nums.length < 3) return null;
    const [ox, oy, blur] = nums;
    return { color: col.hex, opacity: col.alpha, blur: blur * 0.75, offset: Math.hypot(ox, oy) * 0.75, angle: Math.round((Math.atan2(oy, ox) * 180) / Math.PI + 360) % 360 };
  };

  return [...document.querySelectorAll('.page')].map((pageEl) => {
    const P = pageEl.getBoundingClientRect();
    const rel = (r) => ({ x: r.left - P.left, y: r.top - P.top, w: r.width, h: r.height });
    const items = [];
    const bg = parseColor(getComputedStyle(pageEl).backgroundColor);

    /* ---------- text ---------- */
    const styleOf = (el) => {
      const cs = getComputedStyle(el);
      const col = parseColor(cs.color) || { hex: '000000', alpha: 1 };
      return {
        fontFace: firstFont(cs.fontFamily), fontSize: px(cs.fontSize) * 0.75,
        bold: +cs.fontWeight >= 600, weight: +cs.fontWeight, italic: cs.fontStyle === 'italic',
        underline: cs.textDecorationLine.includes('underline'),
        color: col.hex, transparency: Math.round((1 - col.alpha) * 100),
        charSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) * 0.75,
        upper: cs.textTransform === 'uppercase', superscript: cs.verticalAlign === 'super',
      };
    };
    const collect = (node, runs) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.textContent) runs.push({ text: n.textContent, style: styleOf(n.parentElement) }); }
        else if (n.nodeType === 1) {
          if (n.tagName === 'BR') runs.push({ br: true });
          else if (isInline(n) && n.dataset.pptx !== 'skip' && !['IMG', 'svg'].includes(n.tagName)) collect(n, runs);
        }
      }
      return runs;
    };
    const normalize = (runs) => {
      const out = [];
      let lineStart = true;
      for (const r of runs) {
        if (r.br) { if (out.length && !out[out.length - 1].br) out[out.length - 1].text = out[out.length - 1].text.replace(/ $/, ''); out.push(r); lineStart = true; continue; }
        let t = r.text.replace(/\s+/g, ' ');
        if (r.style.upper) t = t.toUpperCase();
        if (lineStart) t = t.replace(/^ /, '');
        const prev = out[out.length - 1];
        if (prev && !prev.br && prev.text.endsWith(' ') && t.startsWith(' ')) t = t.slice(1);
        if (!t) continue;
        out.push({ text: t, style: r.style });
        lineStart = false;
      }
      for (let i = out.length - 1; i >= 0 && !out[i].br; i--) { out[i].text = out[i].text.replace(/ $/, ''); if (out[i].text) break; }
      return out.filter((r) => r.br || r.text);
    };
    const pseudoText = (el, which) => {
      const c = getComputedStyle(el, which).content;
      return !c || c === 'none' || c === 'normal' || !/^["']/.test(c) ? null : c.slice(1, -1);
    };
    const textNodes = (el, list = []) => {
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3 && n.textContent.trim()) list.push(n);
        else if (n.nodeType === 1 && n.tagName !== 'BR' && isInline(n) && n.dataset.pptx !== 'skip' && !['IMG', 'svg'].includes(n.tagName)) textNodes(n, list);
      });
      return list;
    };
    const range = document.createRange();
    const ctx = document.createElement('canvas').getContext('2d');

    /** One paragraph (a block element's own inline text), or null if it has none. */
    const paragraphOf = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'inline') return null;
      const runs = normalize(collect(el, []));
      if (!runs.some((x) => x.text)) return null;
      const before = pseudoText(el, '::before'), after = pseudoText(el, '::after');
      if (before) runs.unshift({ text: before, style: styleOf(el) });
      if (after) runs.push({ text: after, style: styleOf(el) });
      const rects = textNodes(el).flatMap((n) => { range.selectNodeContents(n); return [...range.getClientRects()]; }).filter((q) => q.width > 0 && q.height > 0);
      const B = rel(el.getBoundingClientRect());
      const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth), pr = px(cs.paddingRight) + px(cs.borderRightWidth);
      const pt = px(cs.paddingTop) + px(cs.borderTopWidth);
      const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
      const top = rects.length ? Math.min(...rects.map((q) => q.top)) - P.top : B.y + pt;
      const bottom = rects.length ? Math.max(...rects.map((q) => q.bottom)) - P.top : top + lh;
      let align = { start: 'left', '-webkit-left': 'left', end: 'right', '-webkit-right': 'right', '-webkit-center': 'center' }[cs.textAlign] || cs.textAlign;
      let bullet = null;
      if (el.tagName === 'LI' && cs.listStyleType !== 'none') {
        const indent = px(getComputedStyle(el.parentElement).paddingLeft);
        bullet = { type: cs.listStyleType === 'decimal' ? 'number' : 'disc', indent: indent * 0.75, offset: indent };
      }
      // Text next to an icon or other element (a flex label): the box hugs the text
      const hasOther = [...el.children].some((c) => c.tagName !== 'BR' && (!isInline(c) || ['svg', 'IMG'].includes(c.tagName)));
      const x = hasOther && rects.length ? Math.min(...rects.map((q) => q.left)) - P.left : B.x + pl - (bullet ? bullet.offset : 0);
      const w = hasOther && rects.length ? Math.max(...rects.map((q) => q.right)) - P.left - x : B.w - pl - pr + (bullet ? bullet.offset : 0);
      // Browsers split extra leading above and below a line; PowerPoint puts it above.
      const fr = runs.find((r) => r.text).style;
      ctx.font = `${fr.italic ? 'italic ' : ''}${fr.weight} ${fr.fontSize / 0.75}px "${fr.fontFace}"`;
      const fm = ctx.measureText('Hg');
      const shift = (fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent - lh) / 2;
      const lines = Math.max(1, Math.round((bottom - top) / lh));
      return { runs, align, lineSpacing: lh * 0.75, bullet, x, w, top, bottom, boxTop: B.y + pt, boxBottom: B.y + B.h - px(cs.paddingBottom) - px(cs.borderBottomWidth), shift, lines, breaks: runs.filter((r) => r.br).length, name: nameOf(el), hasOther };
    };
    const pushText = (paras) => {
      const first = paras[0], last = paras[paras.length - 1];
      items.push({
        // the gap between two paragraphs is the CSS margin between their line boxes
        type: 'text', paragraphs: paras.map((p, i) => ({ ...p, spaceBefore: i ? Math.max(0, (p.boxTop - paras[i - 1].boxBottom) * 0.75) : 0 })),
        x: Math.min(...paras.map((p) => p.x)), w: Math.max(...paras.map((p) => p.w)),
        y: first.top + first.shift, h: last.bottom - first.top,
        noWrap: paras.length === 1 && first.lines <= first.breaks + 1,
        name: paras.length > 1 ? `${first.name} ×${paras.length}` : first.name,
      });
    };
    // Simple text blocks that may share one text box with their neighbours
    const mergeable = (el) => {
      if (!['P', 'LI'].includes(el.tagName) || el.dataset.pptx) return false;
      const cs = getComputedStyle(el);
      if (parseColor(cs.backgroundColor) || cs.backgroundImage !== 'none' || px(cs.borderTopWidth) || px(cs.borderBottomWidth) || angleOf(cs)) return false;
      return ![...el.children].some((c) => !isInline(c) || ['IMG', 'svg'].includes(c.tagName));
    };

    /* ---------- shapes and lines ---------- */
    const addShape = (el, cs, R, rotate) => {
      const fill = parseColor(cs.backgroundColor);
      const opacity = +cs.opacity;
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => {
        const c = parseColor(cs[`border${s}Color`]), w = px(cs[`border${s}Width`]);
        return cs[`border${s}Style`] === 'none' || !c || !w ? null : { w, c, dashed: cs[`border${s}Style`] === 'dashed' };
      });
      const uniform = sides.every((b) => b && b.w === sides[0].w && b.c.hex === sides[0].c.hex);
      const rr = cs.borderTopLeftRadius.split(' ')[0];
      const radius = rr.endsWith('%') ? (px(rr) / 100) * Math.min(R.w, R.h) : px(rr);
      const minSide = Math.min(R.w, R.h);
      if (fill || uniform) {
        // PowerPoint centres an outline on the shape's edge; CSS draws borders inside the box
        const inset = uniform ? sides[0].w / 2 : 0;
        items.push({
          type: 'shape', x: R.x + inset, y: R.y + inset, w: R.w - inset * 2, h: R.h - inset * 2, rotate,
          shape: radius >= minSide / 2 - 0.5 && Math.abs(R.w - R.h) < 1 ? 'ellipse' : radius > 0 ? 'roundRect' : 'rect',
          radius: Math.min(radius, minSide / 2),
          fill: fill ? { hex: fill.hex, alpha: fill.alpha * opacity } : null,
          line: uniform ? { hex: sides[0].c.hex, width: sides[0].w * 0.75, alpha: sides[0].c.alpha * opacity, dashed: sides[0].dashed } : null,
          shadow: shadowOf(cs), name: nameOf(el),
        });
      }
      if (!uniform) {
        // Single-side borders become real lines, drawn along the middle of the border
        const [t, r, b, l] = sides;
        const line = (x, y, w, h, s) => s && items.push({ type: 'line', x, y, w, h, color: s.c.hex, alpha: s.c.alpha * opacity, width: s.w * 0.75, dashed: s.dashed, name: 'rule' });
        line(R.x, R.y + (t?.w || 0) / 2, R.w, 0, t);
        line(R.x, R.y + R.h - (b?.w || 0) / 2, R.w, 0, b);
        line(R.x + (l?.w || 0) / 2, R.y, 0, R.h, l);
        line(R.x + R.w - (r?.w || 0) / 2, R.y, 0, R.h, r);
      }
    };

    /* ---------- the walk ---------- */
    const walk = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const mode = el.dataset?.pptx;
      if (mode === 'skip') return;
      const tag = el.tagName.toLowerCase();
      const rect = el.getBoundingClientRect();
      const rotate = angleOf(cs);
      // A rotated element is placed by its own (unrotated) size around its centre
      const R = rotate && el.offsetWidth
        ? { x: rect.left - P.left + rect.width / 2 - el.offsetWidth / 2, y: rect.top - P.top + rect.height / 2 - el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight }
        : rel(rect);

      if (mode === 'raster' || tag === 'svg' || tag === 'canvas' || tag === 'video' || (rotate && el.children.length)) {
        el.dataset.rid = ++rid;
        items.push({ type: 'raster', rid, ...rel(rect), pad: tag === 'svg' ? 8 : 0, flatten: el.dataset.pptxFlatten || null, name: nameOf(el) });
        return;
      }
      if (tag === 'img') {
        if (/\.svg(\?|$)/i.test(el.currentSrc)) {
          el.dataset.rid = ++rid;
          items.push({ type: 'raster', rid, ...rel(rect), pad: 0, name: el.alt || 'logo' });
        } else {
          const rr = cs.borderTopLeftRadius.split(' ')[0];
          items.push({
            type: 'image', src: el.currentSrc, ...R, rotate, fit: cs.objectFit, position: cs.objectPosition,
            radius: rr.endsWith('%') ? { pct: px(rr) } : { px: px(rr) },
            clip: cs.clipPath && cs.clipPath.startsWith('polygon') ? cs.clipPath : null,
            opacity: +cs.opacity, name: el.alt || 'photo',
          });
        }
        return;
      }
      if (el !== pageEl) {
        if (cs.backgroundImage !== 'none') {
          el.dataset.rid = ++rid;
          items.push({ type: 'raster', rid, bgOnly: true, ...rel(rect), pad: 0, name: 'background' });
        } else addShape(el, cs, R, rotate);
      }
      const own = paragraphOf(el);
      if (own) pushText([own]);

      // Children, with runs of simple neighbouring paragraphs / list items merged into one box
      const kids = [...el.children].filter((c) => !(isInline(c) && !['IMG', 'svg'].includes(c.tagName)));
      for (const c of el.children) if (isInline(c) && !['IMG', 'svg'].includes(c.tagName)) c.querySelectorAll('img, svg').forEach(walk);
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (mergeable(c)) {
          const group = [c];
          const base = c.getBoundingClientRect();
          while (i + 1 < kids.length && mergeable(kids[i + 1]) && kids[i + 1].tagName === c.tagName) {
            const n = kids[i + 1].getBoundingClientRect();
            if (Math.abs(n.left - base.left) > 1 || Math.abs(n.width - base.width) > 1 || getComputedStyle(kids[i + 1]).textAlign !== getComputedStyle(c).textAlign) break;
            group.push(kids[++i]);
          }
          const paras = group.map(paragraphOf).filter(Boolean);
          if (paras.length) pushText(paras);
          continue;
        }
        walk(c);
      }
    };

    walk(pageEl);
    return { number: pageEl.dataset.pageNumber || null, background: bg ? bg.hex : 'FFFFFF', items };
  });
});

/* ------------------------------------------------------------------ */
/* 2. Capture rasters (charts, icons, logos, gradients)                 */
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
  if (r.flatten) {
    const jpg = r.file.replace(/\.png$/, '.jpg');
    await sharp(r.file).flatten({ background: '#' + r.flatten }).jpeg({ quality: 88, mozjpeg: true }).toFile(jpg);
    fs.rmSync(r.file); r.file = jpg;
  }
  r.x -= r.pad; r.y -= r.pad; r.w += r.pad * 2; r.h += r.pad * 2;
  await page.evaluate((sel) => {
    document.documentElement.classList.remove('pptx-capture');
    const el = document.querySelector(sel);
    el.removeAttribute('data-capture'); el.removeAttribute('data-capture-bg');
  }, sel);
}
await browser.close();

/* ------------------------------------------------------------------ */
/* 3. Cut photos to their frames: crop, rounded corners, circles, polygons */
/* ------------------------------------------------------------------ */
const polygonPoints = (clip, w, h) => clip.slice(clip.indexOf('(') + 1, -1).split(',').map((pt) => {
  const [a, b] = pt.trim().split(/\s+/);
  const v = (s, size) => (s.endsWith('%') ? (parseFloat(s) / 100) * size : parseFloat(s) * SCALE);
  return `${v(a, w)},${v(b, h)}`;
}).join(' ');
let imgN = 0;
for (const s of slides) {
  for (const it of s.items.filter((i) => i.type === 'image')) {
    const src = fileURLToPath(it.src);
    const meta = await sharp(src).metadata();
    const W = Math.round(it.w * SCALE), H = Math.round(it.h * SCALE);
    let img = sharp(src).rotate();
    if (it.fit === 'cover') {
      const [ox, oy] = it.position.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      // crop the source to the frame's aspect ratio at the object-position, then size it
      const scale = Math.max(W / meta.width, H / meta.height);
      const cw = Math.round(W / scale), ch = Math.round(H / scale);
      img = img.extract({ left: Math.round((meta.width - cw) * ox), top: Math.round((meta.height - ch) * oy), width: Math.min(cw, meta.width), height: Math.min(ch, meta.height) })
        .resize({ width: W, height: H, fit: 'fill', withoutEnlargement: false });
    } else {
      img = img.resize({ width: W, height: H, fit: it.fit === 'fill' ? 'fill' : 'inside' });
    }
    const r = it.radius.pct ? null : it.radius.px * SCALE;
    let mask = null;
    if (it.clip) mask = `<polygon points="${polygonPoints(it.clip, W, H)}"/>`;
    else if (it.radius.pct >= 50) mask = `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W / 2}" ry="${H / 2}"/>`;
    else if (it.radius.pct) mask = `<rect width="${W}" height="${H}" rx="${(it.radius.pct / 100) * W}" ry="${(it.radius.pct / 100) * H}"/>`;
    else if (r > 0) mask = `<rect width="${W}" height="${H}" rx="${r}" ry="${r}"/>`;
    const alpha = !!mask || meta.hasAlpha;
    if (mask) {
      const buf = await img.png().toBuffer();
      img = sharp(buf).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${mask}</svg>`), blend: 'dest-in' }]);
    }
    const out = path.join(ASSETS, `photo-${++imgN}${alpha ? '.png' : '.jpg'}`);
    await (alpha ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 86, mozjpeg: true })).toFile(out);
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
const display = cfg.fonts[0].family, body = (cfg.fonts[1] || cfg.fonts[0]).family;
pres.theme = { headFontFace: display, bodyFontFace: body };

// Extra text-box width so other apps' font metrics don't force new line breaks.
const slackFor = (it) => (it.noWrap ? 0.06 : 0.01);
const tp = (a) => Math.round((1 - a) * 100) || undefined;

for (const s of slides) {
  const slide = pres.addSlide();
  slide.background = { color: s.background };
  slide.addNotes(s.number ? `Body page ${s.number}` : 'Front matter (not numbered)');
  for (const it of s.items) {
    if (it.type === 'shape') {
      if (!it.w || !it.h) continue;
      const bleed = it.shape === 'rect' && it.fill && !it.line && !it.rotate ? 0.4 : 0; // hide hairline seams between neighbours
      const o = { x: IN(it.x - bleed), y: IN(it.y - bleed), w: IN(it.w + bleed * 2), h: IN(it.h + bleed * 2), objectName: it.name };
      o.fill = it.fill ? { color: it.fill.hex, transparency: tp(it.fill.alpha) } : { type: 'none' };
      o.line = it.line ? { color: it.line.hex, width: it.line.width, transparency: tp(it.line.alpha), dashType: it.line.dashed ? 'dash' : 'solid' } : { type: 'none' };
      if (it.shape === 'roundRect') o.rectRadius = IN(it.radius);
      if (it.rotate) o.rotate = it.rotate;
      if (it.shadow) o.shadow = { type: 'outer', color: it.shadow.color, opacity: it.shadow.opacity, blur: it.shadow.blur, offset: it.shadow.offset, angle: it.shadow.angle };
      slide.addShape({ rect: pres.ShapeType.rect, roundRect: pres.ShapeType.roundRect, ellipse: pres.ShapeType.ellipse }[it.shape], o);
    } else if (it.type === 'line') {
      slide.addShape(pres.ShapeType.line, {
        x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h), objectName: it.name,
        line: { color: it.color, width: it.width, transparency: tp(it.alpha), dashType: it.dashed ? 'dash' : 'solid' },
      });
    } else if (it.type === 'image' || it.type === 'raster') {
      const o = { path: it.file, x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h), objectName: it.name, altText: it.name };
      if (it.rotate) o.rotate = it.rotate;
      if (it.opacity !== undefined && it.opacity < 1) o.transparency = Math.round((1 - it.opacity) * 100);
      slide.addImage(o);
    } else if (it.type === 'text') {
      const extra = it.w * slackFor(it) + 1;
      const align = it.paragraphs[0].align;
      const x = align === 'center' ? it.x - extra / 2 : align === 'right' ? it.x - extra : it.x;
      const runs = [];
      it.paragraphs.forEach((p, pi) => {
        let soft = false;
        const start = runs.length;
        p.runs.forEach((r) => {
          if (r.br) { soft = true; return; }
          const st = r.style;
          runs.push({
            text: r.text,
            options: {
              fontFace: st.fontFace, fontSize: Math.round(st.fontSize * 2) / 2, bold: st.bold, italic: st.italic,
              underline: st.underline ? { style: 'sng' } : undefined, color: st.color,
              transparency: st.transparency || undefined, charSpacing: st.charSpacing || undefined,
              superscript: st.superscript || undefined,
              align: p.align, lineSpacing: Math.round(p.lineSpacing * 10) / 10,
              paraSpaceBefore: pi && p.spaceBefore ? Math.round(p.spaceBefore * 10) / 10 : undefined,
              bullet: p.bullet ? (p.bullet.type === 'number' ? { type: 'number', indent: p.bullet.indent } : { indent: p.bullet.indent }) : undefined,
              softBreakBefore: soft || undefined,
            },
          });
          soft = false;
        });
        if (runs.length > start && pi < it.paragraphs.length - 1) runs[runs.length - 1].options.breakLine = true;
      });
      if (!runs.length) continue;
      slide.addText(runs, {
        x: IN(x), y: IN(it.y), w: IN(it.w + extra), h: IN(it.h), margin: 0, valign: 'top',
        wrap: !it.noWrap, fit: 'none', isTextBox: true, objectName: it.name,
      });
    }
  }
}

const out = path.join(DIST, `${cfg.outputName || 'DECA-Book'}.pptx`);
await pres.writeFile({ fileName: out });
const count = (t) => slides.reduce((n, s) => n + s.items.filter((i) => i.type === t).length, 0);
console.log(`✓ PowerPoint written: ${path.relative(process.cwd(), out)} (${mb(fs.statSync(out).size)}, ${slides.length} slides: ` +
  `${count('text')} text boxes, ${count('shape') + count('line')} shapes/lines, ${count('image')} photos, ${rasters.length} flattened)`);
