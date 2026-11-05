// Compresses src/assets/images/raw/* into src/assets/images/optimized/.
// Photos -> JPEG (mozjpeg), graphics with transparency -> PNG, vector files copied as they are.
//
// Presets (IMG_PRESET environment variable):
//   print   (default) long edge 2400 px (≈300 dpi at 8 in), JPEG quality 82
//   compact           long edge 1600 px (≈200 dpi), JPEG quality 72: for a smaller PDF
// A compact build writes to optimized-compact/ so the two never mix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib.mjs';

export const PRESETS = {
  print: { max: 2400, quality: 82, dir: 'optimized' },
  compact: { max: 1600, quality: 72, dir: 'optimized-compact' },
};
export const preset = () => PRESETS[process.env.IMG_PRESET] || PRESETS.print;
const RAW = path.join(ROOT, 'src/assets/images/raw');
export const optimizedDir = () => path.join(ROOT, 'src/assets/images', preset().dir);

export async function optimizeImages({ quiet = false } = {}) {
  const sharp = (await import('sharp')).default;
  const { max, quality } = preset();
  const OUT = optimizedDir();
  fs.mkdirSync(OUT, { recursive: true });
  const raw = fs.readdirSync(RAW);
  const stale = (dst, src) => !fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs;
  let done = 0;
  for (const f of raw.filter((f) => /\.svg$/i.test(f))) {
    const src = path.join(RAW, f), dst = path.join(OUT, f);
    if (stale(dst, src)) { fs.copyFileSync(src, dst); done++; }
  }
  for (const f of raw.filter((f) => /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f))) {
    const src = path.join(RAW, f);
    const img = sharp(src).rotate();
    const meta = await img.metadata();
    const alpha = meta.hasAlpha && /png|webp/i.test(meta.format);
    const dst = path.join(OUT, path.basename(f, path.extname(f)) + (alpha ? '.png' : '.jpg'));
    if (!stale(dst, src)) continue;
    const resized = img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
    await (alpha ? resized.png({ compressionLevel: 9, palette: false }) : resized.jpeg({ quality, mozjpeg: true })).toFile(dst);
    done++;
  }
  // Remove optimized files whose original is gone
  const keep = new Set(raw.map((f) => (/\.svg$/i.test(f) ? f : path.basename(f, path.extname(f)))));
  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith('.')) continue;
    if (!keep.has(f) && !keep.has(path.basename(f, path.extname(f)))) fs.rmSync(path.join(OUT, f));
  }
  if (done && !quiet) console.log(`✓ Optimized ${done} image(s) (${process.env.IMG_PRESET || 'print'} preset)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await optimizeImages();
