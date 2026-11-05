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

## Brand: inspired by the NEW Blis Farms theme (repo Praximations/blis, VIEW ONLY: never change it)
- The new theme in `/home/user/blis` is the reference for the look, not a template to copy. The book should
  fit the website's style without matching it exactly. Read its `assets/blis-*.css` and `sections/*.liquid`.
  Never edit, commit or run code in that repo.
- Type: EB Garamond (titles, plus small letterspaced caps for labels), DM Sans (text; the site uses Google Sans,
  and DM Sans is the closest match that Canva has built in), Caveat (handwritten notes).
- Colors: gold `#BA9561`, gold-deep `#9C6C28` for small gold text, charcoal `#2A2A2A`, soft text `#4F4F4F`,
  warm paper `#FCF9F3`, sand `#EFE6D8` on the cover, and the shop's section tones.
- The title page keeps LAST YEAR'S cover layout (date top left, spaced-out event, rule, BLIS FARMS, logo
  medallion, 45° photo corners with gold bands, arcs bottom right, gold frame), refined, plus the required
  school and participant details. The table of contents pairs with it (same sand, frame and a photo corner).
  Both live in `src/styles/front.css`; the TOC rows come from `outline` in `book.config.json`, with page
  numbers read from the body pages (sections by `data-section`, sub-items by their letter in the `<h2>`).
- Photos: the user has given permission to use Blis photos. Copy them from `/home/user/blis/assets/` into
  `src/assets/images/raw/`. Where no photo fits, use a labelled placeholder.

## Studio and file size
- `npm run studio` serves a local editor (http://localhost:4321): live preview, click-to-edit text, photo swap,
  brand kit, book details, export buttons. It writes back into `src/pages`, `tokens.css` and `book.config.json`
  (scripts/studio.mjs + studio/index.html). Elements the runtime generates carry `data-generated` and are not editable there.
- Keep the PDF light: photos go through `optimize-images.mjs` (2400 px max). `npm run condense` makes a 1600 px copy.
  Don't add heavy decoration (big textures, many full-page photos) that would bloat the PDF.

## Canva
- `npm run canva` writes the PowerPoint and `dist/<name>-Canva-Kit.zip` (pptx, photos, logo, fonts, page images).
- Keep pages Canva-friendly: real text, not images of text. Use simple shapes (rect, rounded rect, circle, lines,
  45° rotated bars). Cut photos with `border-radius` or `clip-path: polygon(...)`; the exporter bakes those shapes.
  Avoid gradients, masks and blend modes on anything that should stay editable. Those get flattened.
- Paragraphs (`p`) and list items (`li`) that are neighbours, with the same width, share one text box in Canva.

## Conventions
- Change colors, fonts and spacing only in `src/styles/tokens.css`. Don't hard-code hex values in pages.
- Each page is a `<section class="page body">` in its own file. Filenames set the order.
- Subsection `<h2>`s start with the outline letter (`A. …`) so the table of contents can find their page.
- Reuse the classes in `components.css` (`card`, `stat`, `callout`, `grid-2/3/4`, `table.data`, `figure.chart`). Add new components there, not inline.
- Charts: `<figure class="chart" data-chart="name" data-height="2">` with data in `src/charts/name.json`.
  Types: `bar`, `hbar`, `donut`, `line`, `stacked`.
- Photos: originals go in `src/assets/images/raw/`. Reference them as `assets/images/<name>.jpg` (`.png` if they have transparency).
- PowerPoint export: don't draw visible decoration with `::before`/`::after`, because it can't be exported. Use real elements.
  Use `data-pptx="raster"` to flatten a complex element into an image, and `data-pptx="skip"` to omit one.
- Fonts must be Google Fonts (Canva has them). Add them through `@fontsource/*` and the `fonts` list in `book.config.json`.
- Inline an icon with `{{icon name}}`, which inserts `src/icons/name.svg`. Fill page text from `book.config.json` with `{{key}}`.
- Visual QA: `npm run preview`, then look at `dist/preview/*.png`.
