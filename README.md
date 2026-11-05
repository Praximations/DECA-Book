# DECA Book — Business Operations Research (2026–27)

The written entry is built from code: every page is an HTML file and every color or font comes from one CSS file. One command turns that into:

| Output | What it's for |
|---|---|
| `dist/Blis-Farms-DECA-Book.pdf` | The final entry: 8.5 × 11 in pages, vector text, embedded fonts, under 50 MB |
| `dist/Blis-Farms-DECA-Book.pptx` | An editable copy for Canva or PowerPoint, one 8.5 × 11 slide per page. Text boxes, shapes and photos stay native objects; charts come in as sharp, high-resolution images |
| `dist/preview/*.png` | Quick page images for review |

## Commands

```bash
npm install          # once
npm run all          # build, then PDF, then PPTX, then previews, then the penalty check
npm run pdf          # PDF only
npm run pptx         # PowerPoint only
npm run preview      # PNG of every page (npm run preview -- 3 4 renders only sheets 3 and 4)
npm run check        # penalty-point checklist + layout lint
```

Playwright/Chromium is preinstalled in the Claude Code cloud environment. To run it on your own computer, install it with `npm i -D playwright` and then `npx playwright install chromium`.

## Where things live

```
book.config.json          title-page facts (event, school, names, date), fonts, limits
src/styles/tokens.css     ALL colors, fonts, sizes, margins: change the look here
src/styles/base.css       page frame + typography
src/styles/components.css cards, stats, callouts, tables, charts, cover, TOC
src/pages/                one file per page, in order:
   00-title.html            title page (not numbered)
   01-contents.html         table of contents (built automatically, not numbered)
   p01-…html … p20-…html    body pages 1–20 (numbered automatically)
src/charts/*.json         chart data: edit numbers here and the chart redraws
src/assets/images/raw/    drop original photos here (any size); build compresses them
src/styles/cover.css      title page
src/icons/*.svg           small icons, used as {{icon key-1}}
src/js/runtime.js         page numbers, table of contents, chart drawing
scripts/                  build + export + check tooling
docs/                     page plan, visual ideas
```

## Penalty Point Checklist: what's automated

| Checklist item | How it's handled |
|---|---|
| Statement of Assurances signed and submitted | Separate signed form; not part of this book. `npm run check` reminds you |
| 20 pages max (plus title page and TOC) | `check` fails if there are more than 20 body pages |
| Pages numbered from Executive Summary through the appendix, with no divider pages | Numbering is automatic; title page and TOC stay unnumbered |
| Follows the Written Entry outline | `check` confirms sections I–VIII exist, are named correctly and are in order, and that the Executive Summary is 1–3 pages |
| Typed, 8.5 × 11 | Every PDF page is verified as 612 × 792 pt |
| 50 MB file limit | Images are compressed at build time; the PDF export fails if it's over the limit |

`check` also flags text that runs past the margins or gets clipped, and lists pages still holding placeholder blocks.

## Importing into Canva

1. In Canva, choose **Create a design → Import file** and pick `dist/Blis-Farms-DECA-Book.pptx`.
2. The fonts are EB Garamond, Google Sans and Caveat, the same as the new Blis website. PowerPoint only knows regular and bold, so medium-weight text (500) imports as regular. If Canva doesn't offer Google Sans, upload it from `node_modules/@fontsource/google-sans` or switch that text to a similar sans.
3. The title page's photo and products come in as one flattened picture. Everything written on the page stays editable.
4. Text boxes are slightly wider than their text, so Canva's font rendering doesn't add new line breaks. Small spacing differences are normal; tidy them in Canva.
5. Charts arrive as images. To change a number, edit `src/charts/*.json` and export again.

Do your edits in code first and keep Canva for final touches. Changes made in Canva don't flow back into the code.
