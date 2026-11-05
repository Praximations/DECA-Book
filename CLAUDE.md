# Working on the DECA book

A DECA Business Operations Research written entry (2026–27 topic: customer loyalty and repeat engagement). It is meant as a model example, so it has to look professional and follow the official guidelines exactly.

## Rules that must never break (penalty points)
- Body is at most 20 pages: `src/pages/p01…p20`. The title page and TOC sit outside that count and stay unnumbered.
- No divider or section title pages. Every body page carries content.
- Section order and names are fixed (see `requiredSections` in `book.config.json`). Each section starts with
  `<h1 data-section="I">Executive Summary</h1>` inside a `.section-head`. Subsections are `<h2>` and appear in the TOC automatically.
- The Executive Summary runs 1–3 pages.
- The PDF must stay under 50 MB.
- Run `npm run all` after changes. It must end with "No penalty risks found" and no overflow warnings.

## Conventions
- Change colors, fonts and spacing only in `src/styles/tokens.css`. Don't hard-code hex values in pages.
- Each page is a `<section class="page body">` in its own file. Filenames set the order.
- Reuse the classes in `components.css` (`card`, `stat`, `callout`, `grid-2/3/4`, `table.data`, `figure.chart`). Add new components there, not inline.
- Charts: `<figure class="chart" data-chart="name" data-height="2">` with data in `src/charts/name.json`.
  Types: `bar`, `hbar`, `donut`, `line`, `stacked`.
- Photos: originals go in `src/assets/images/raw/`. Reference them as `assets/images/<name>.jpg` (`.png` if they have transparency).
- PowerPoint export: don't draw visible decoration with `::before`/`::after`, because it can't be exported. Use real elements.
  Use `data-pptx="raster"` to flatten a complex element into an image, and `data-pptx="skip"` to omit one.
- Fonts must be Google Fonts (Canva has them). Add them through `@fontsource/*` and the `fonts` list in `book.config.json`.
- Visual QA: `npm run preview`, then look at `dist/preview/*.png`.
