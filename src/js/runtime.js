/* Runs in the browser (preview, PDF and PPTX export all use it).
   1. Numbers body pages  2. Builds the table of contents  3. Draws charts
   Sets window.__bookReady = true when finished. */
(function () {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const PT = 96 / 72; // px per pt

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ---------- 1. Page numbers ---------- */
  function numberPages() {
    const bodyPages = [...document.querySelectorAll('.page.body')];
    bodyPages.forEach((page, i) => {
      page.dataset.pageNumber = String(i + 1);
      let footer = page.querySelector('.page-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'page-footer';
        page.appendChild(footer);
      }
      footer.innerHTML =
        `<span class="footer-left">${window.BOOK.business}</span>` +
        `<span class="page-number">${i + 1}</span>`;
    });
  }

  /* ---------- 2. Table of contents ---------- */
  // Rows come from `outline` in book.config.json (the official Written Entry outline).
  // Section page numbers come from <h1 data-section>; sub-item numbers from an <h2>
  // in that section starting with the same letter ("A. ...").
  function buildToc() {
    const toc = document.querySelector('[data-toc-target]');
    if (!toc) return;
    const sectionPage = {}, subPage = {};
    let cur = null;
    document.querySelectorAll('.page.body').forEach((page) => {
      const h1 = page.querySelector('h1[data-section]');
      if (h1) { cur = h1.dataset.section; sectionPage[cur] ??= page.dataset.pageNumber; }
      page.querySelectorAll('h2').forEach((h) => {
        const m = h.textContent.trim().match(/^([A-Z])\./);
        if (m && cur) subPage[cur + m[1]] ??= page.dataset.pageNumber;
      });
    });
    const rows = [];
    (window.BOOK.outline || []).forEach((s) => {
      rows.push(`<div class="toc-sec"><span class="toc-num">${s.section}.</span><span class="toc-title">${esc(s.title)}</span>` +
                `<span class="toc-leader"></span><span class="toc-page">${sectionPage[s.section] ?? ''}</span></div>`);
      if (s.desc) rows.push(`<div class="toc-sub toc-desc"><span class="toc-sub-label"></span><span class="toc-sub-text">${esc(s.desc)}</span></div>`);
      (s.items || []).forEach((item) => {
        const m = item.match(/^([A-Z])\.\s*(.*)$/);
        rows.push(`<div class="toc-sub"><span class="toc-sub-label">${m[1]}.</span><span class="toc-sub-text">${esc(m[2])}</span>` +
                  `<span class="toc-sub-page">${subPage[s.section + m[1]] ?? ''}</span></div>`);
      });
    });
    toc.innerHTML = rows.join('');
  }

  /* ---------- 3. Charts (pure SVG, styles inlined so they export cleanly) ---------- */
  const palette = () => [1, 2, 3, 4, 5, 6].map((n) => token(`--chart-${n}`));
  const fmt = (v, unit) => (unit === '$' ? '$' + v.toLocaleString() : v.toLocaleString() + (unit || ''));

  function textEl(x, y, str, o = {}) {
    const fam = o.display ? token('--font-display') : token('--font-body');
    return `<text x="${x}" y="${y}" font-family='${fam}' font-size="${(o.size || 7.5) * PT}" ` +
      `font-weight="${o.weight || 400}" fill="${o.color || token('--color-ink-soft')}" ` +
      `text-anchor="${o.anchor || 'start'}" dominant-baseline="${o.baseline || 'alphabetic'}">${esc(str)}</text>`;
  }

  function barChart(d, W, H) {
    const colors = palette(), ink = token('--color-ink'), line = token('--color-line');
    const max = d.max || Math.max(...d.series.flatMap((s) => s.values)) * 1.15;
    const padB = 30, padT = 16, padL = 4;
    const n = d.labels.length, groups = d.series.length;
    const slot = (W - padL) / n, bw = Math.min(46, (slot * 0.62) / groups);
    let out = `<line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="${line}" stroke-width="1"/>`;
    d.labels.forEach((lab, i) => {
      const cx = padL + slot * i + slot / 2;
      d.series.forEach((s, j) => {
        const v = s.values[i], h = ((H - padB - padT) * v) / max;
        const x = cx - (bw * groups) / 2 + bw * j, y = H - padB - h;
        const fill = groups > 1 ? colors[j] : (d.highlight === i ? token('--color-accent') : colors[0]);
        out += `<rect x="${x + 1}" y="${y}" width="${bw - 2}" height="${h}" rx="3" fill="${fill}"/>`;
        out += textEl(x + bw / 2, y - 4, fmt(v, d.unit), { anchor: 'middle', weight: 700, color: ink });
      });
      out += textEl(cx, H - padB + 14, lab, { anchor: 'middle' });
    });
    return out;
  }

  function hbarChart(d, W, H) {
    const colors = palette(), ink = token('--color-ink'), track = token('--color-line');
    const vals = d.series[0].values, max = d.max || Math.max(...vals);
    const labelW = d.labelWidth || W * 0.34, valW = 40, n = vals.length;
    const rowH = H / n, bh = Math.min(16, rowH * 0.6);
    let out = '';
    vals.forEach((v, i) => {
      const y = rowH * i + rowH / 2, w = ((W - labelW - valW) * v) / max;
      out += textEl(0, y, d.labels[i], { baseline: 'middle', color: ink });
      out += `<rect x="${labelW}" y="${y - bh / 2}" width="${W - labelW - valW}" height="${bh}" rx="${bh / 2}" fill="${track}"/>`;
      out += `<rect x="${labelW}" y="${y - bh / 2}" width="${Math.max(w, bh)}" height="${bh}" rx="${bh / 2}" fill="${d.highlight === i ? token('--color-accent') : colors[0]}"/>`;
      out += textEl(W, y, fmt(v, d.unit), { anchor: 'end', baseline: 'middle', weight: 700, color: ink });
    });
    return out;
  }

  function donutChart(d, W, H) {
    const colors = palette(), ink = token('--color-ink');
    const vals = d.series[0].values, total = vals.reduce((a, b) => a + b, 0);
    const r = Math.min(H / 2 - 4, W * 0.22), cx = r + 4, cy = H / 2, sw = r * 0.36;
    let a0 = -Math.PI / 2, out = '';
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2, rr = r - sw / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
      out += `<path d="M ${p(a0)} A ${rr} ${rr} 0 ${large} 1 ${p(a1 - 0.0001)}" fill="none" stroke="${colors[i % 6]}" stroke-width="${sw}"/>`;
      a0 = a1;
    });
    if (d.center) {
      out += textEl(cx, cy - 2, d.center.value, { anchor: 'middle', size: 18, weight: 800, display: true, color: ink, baseline: 'middle' });
      out += textEl(cx, cy + 16, d.center.label, { anchor: 'middle', size: 6.5, baseline: 'middle' });
    }
    const lx = cx + r + 22, step = Math.min(22, (H - 8) / vals.length);
    const ly0 = cy - (step * (vals.length - 1)) / 2;
    vals.forEach((v, i) => {
      const y = ly0 + step * i;
      out += `<rect x="${lx}" y="${y - 5}" width="10" height="10" rx="2" fill="${colors[i % 6]}"/>`;
      out += textEl(lx + 16, y, d.labels[i], { baseline: 'middle', color: ink });
      out += textEl(W, y, fmt(v, d.unit), { anchor: 'end', baseline: 'middle', weight: 700, color: ink });
    });
    return out;
  }

  function lineChart(d, W, H) {
    const colors = palette(), line = token('--color-line'), ink = token('--color-ink');
    const all = d.series.flatMap((s) => s.values), max = d.max || Math.max(...all) * 1.15, min = d.min || 0;
    const padB = 24, padT = 14, padX = 16, n = d.labels.length;
    const X = (i) => padX + ((W - padX * 2) * i) / (n - 1);
    const Y = (v) => H - padB - ((H - padB - padT) * (v - min)) / (max - min);
    let out = `<line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="${line}"/>`;
    d.labels.forEach((lab, i) => (out += textEl(X(i), H - 8, lab, { anchor: 'middle' })));
    d.series.forEach((s, j) => {
      const pts = s.values.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
      out += `<polyline points="${pts}" fill="none" stroke="${colors[j]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => {
        out += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="#fff" stroke="${colors[j]}" stroke-width="2"/>`;
        if (i === s.values.length - 1 || d.labelAll) out += textEl(X(i), Y(v) - 8, fmt(v, d.unit), { anchor: 'middle', weight: 700, color: ink });
      });
    });
    return out;
  }

  function stackedChart(d, W, H) {
    // 100% stacked horizontal bars: labels = rows, series = segments
    const colors = palette(), ink = token('--color-ink');
    const labelW = d.labelWidth || W * 0.28, legendH = 18, n = d.labels.length;
    const rowH = (H - legendH) / n, bh = Math.min(18, rowH * 0.62), bw = W - labelW;
    let out = '';
    d.labels.forEach((lab, i) => {
      const y = legendH + rowH * i + rowH / 2;
      const total = d.series.reduce((a, s) => a + s.values[i], 0);
      let x = labelW;
      out += textEl(0, y, lab, { baseline: 'middle', color: ink });
      d.series.forEach((s, j) => {
        const w = (bw * s.values[i]) / total;
        out += `<rect x="${x}" y="${y - bh / 2}" width="${w}" height="${bh}" fill="${colors[j % 6]}"/>`;
        if (w > 22) out += textEl(x + w / 2, y, Math.round((s.values[i] / total) * 100) + '%', { anchor: 'middle', baseline: 'middle', weight: 700, color: '#fff', size: 6.5 });
        x += w;
      });
    });
    let lx = labelW;
    d.series.forEach((s, j) => {
      out += `<rect x="${lx}" y="2" width="9" height="9" rx="2" fill="${colors[j % 6]}"/>`;
      out += textEl(lx + 13, 7, s.name, { baseline: 'middle', size: 6.5 });
      lx += 20 + s.name.length * 4.6;
    });
    return out;
  }

  const RENDERERS = { bar: barChart, hbar: hbarChart, donut: donutChart, line: lineChart, stacked: stackedChart };

  function drawCharts() {
    document.querySelectorAll('figure.chart[data-chart]').forEach((fig) => {
      const d = (window.CHARTS || {})[fig.dataset.chart];
      if (!d) { fig.innerHTML = `<div class="todo">Missing chart data: ${fig.dataset.chart}</div>`; return; }
      const W = fig.clientWidth, H = parseFloat(fig.dataset.height || 2.2) * 96;
      const svg = RENDERERS[d.type](d, W, H);
      fig.innerHTML =
        (d.title ? `<div class="chart-title">${esc(d.title)}</div>` : '') +
        `<svg class="chart-svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="visible">${svg}</svg>` +
        (d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : '');
    });
  }

  async function run() {
    await document.fonts.ready;
    numberPages();
    buildToc();
    drawCharts();
    window.__bookReady = true;
  }
  run();
})();
