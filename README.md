# DECA Book — Business Operations Research (2026–27)

The written entry is built from code: every page is an HTML file and every color or font comes from one CSS file. One command turns that into:

| Output | What it's for |
|---|---|
| `dist/Blis-Farms-DECA-Book.pdf` | The final entry: 8.5 × 11 in pages, vector text, embedded fonts, under 50 MB |
| `dist/Blis-Farms-DECA-Book.pptx` | An editable copy for Canva or PowerPoint, one 8.5 × 11 slide per page. Text boxes, shapes and photos stay native objects; charts come in as sharp, high-resolution images |
| `dist/Blis-Farms-DECA-Book-Canva-Kit.zip` | The PowerPoint plus every photo, the logo, the fonts and a reference image of each page, with import steps |
| `dist/preview/*.png` | Quick page images for review |

## Studio: edit the book like a simple Canva, next to VS Code

```bash
npm run studio
```

Then open http://localhost:4321 (in a browser, or inside VS Code with the **Live Preview** extension's "Open Browser" view). You get:

- **Live preview.** Save a file in VS Code and the page refreshes; drag the window to zoom.
- **Click to edit.** Click anything on a page to select it. Double-click text to edit it in place (Enter saves, Esc cancels); the change is written straight into `src/pages/*.html`. Click a photo to replace it with any image from `src/assets/images/raw`. "Open in VS Code" jumps to the element's source line.
- **Brand kit.** Every colour, font and size from `tokens.css`, with colour pickers and live preview.
- **Book details.** The title-page facts from `book.config.json`.
- **Export.** Buttons for the PDF, PowerPoint + Canva kit, a condensed PDF and the penalty check, with the log and the file sizes.

Text that comes from `book.config.json` (the `{{placeholders}}`) is edited under Book details, and generated parts (page numbers, the contents rows, charts) are edited in their data, not on the page. VS Code: **Terminal → Run Task → DECA Book: Studio** starts it.

## Commands

```bash
npm install          # once
npm run all          # build, then PDF, then PPTX, then previews, then the penalty check
npm run pdf          # PDF only
npm run pptx         # PowerPoint only
npm run canva        # PowerPoint + Canva kit zip
npm run condense     # a smaller PDF (dist/<name>-compact.pdf) with 1600 px photos, if the full one gets heavy
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
   01-contents.html         table of contents (rows from `outline` in book.config.json, page numbers automatic)
   p01-…html … p20-…html    body pages 1–20 (numbered automatically)
src/charts/*.json         chart data: edit numbers here and the chart redraws
src/assets/images/raw/    drop original photos here (any size); build compresses them
src/styles/front.css      title page and table of contents
src/icons/*.svg           small icons, used as {{icon key-1}}
src/js/runtime.js         page numbers, table of contents, chart drawing
scripts/                  build + export + check tooling, and the studio server
studio/                   the studio's web page
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
| 50 MB file limit | Images are compressed at build time; the PDF export fails if it's over the limit. `npm run condense` makes a smaller copy with 1600 px photos |

`check` also flags text that runs past the margins or gets clipped, and lists pages still holding placeholder blocks.

## Importing into Canva

1. Unzip `dist/Blis-Farms-DECA-Book-Canva-Kit.zip`. In Canva, choose **Create a design → Import file** and pick the `.pptx` inside it.
2. Fonts: EB Garamond, DM Sans and Caveat are all in Canva's font library. If one shows a warning, upload it from the kit's `fonts/` folder.
3. Text is real text. Neighbouring paragraphs and bullet lists share one text box, so they reflow when you edit them.
4. Boxes, lines, rings and the frame are Canva shapes. Photos are separate pictures already cut to their shape (circle, diagonal corner, rounded card); the originals are in `photos/`.
5. Charts and small icons arrive as pictures. To change a number, edit `src/charts/*.json` and export again.
6. Compare each page with the matching image in `pages/`. Small spacing differences are normal.

Do your edits in code first and keep Canva for final touches. Changes made in Canva don't flow back into the code.
