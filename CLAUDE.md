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

## Brand (matches blisfarms.com)
- Gold `#BA9561` on white and stone `#F3F2EE`, charcoal `#2A2A2A` text, square corners, a lot of photography.
- One typeface: Urbanist, the closest Google Font to the site's Greycliff.
- Motifs from the site: small gold Greek-key icons (`{{icon key-1}}`, `key-2` and `key-3` from `src/icons/`), a short gold rule
  under headlines (`<div class="dash"></div>`), and small, letterspaced, uppercase gold labels.
- Photos and logo come from blisfarms.com (`src/assets/images/raw/`). Confirm with Blis before publishing any of them.
- Last year's Canva book is the content reference only, not the visual one. Its title page left out the required school and participant information.

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
- Inline an icon with `{{icon name}}`, which inserts `src/icons/name.svg`. Fill page text from `book.config.json` with `{{key}}`.
- Visual QA: `npm run preview`, then look at `dist/preview/*.png`.
