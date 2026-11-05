// Compresses src/assets/images/raw/* into src/assets/images/optimized/.
// Photos -> JPEG (mozjpeg), graphics with transparency -> PNG. Long edge capped at
// 2400 px (≈ 300 dpi at 8 in), which is print quality and keeps the PDF small.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const RAW = path.join(ROOT, 'src/assets/images/raw');
const OUT = path.join(ROOT, 'src/assets/images/optimized');
const MAX = 2400;

export async function optimizeImages() {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(RAW).filter((f) => /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f));
  let done = 0;
  // Vector files (logos) are copied untouched: they stay sharp at any size
  for (const f of fs.readdirSync(RAW).filter((f) => /\.svg$/i.test(f))) {
    const dst = path.join(OUT, f);
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(path.join(RAW, f)).mtimeMs) { fs.copyFileSync(path.join(RAW, f), dst); done++; }
  }
  for (const f of files) {
    const src = path.join(RAW, f);
    const img = sharp(src).rotate();
    const meta = await img.metadata();
    const alpha = meta.hasAlpha && /png|webp/i.test(meta.format);
    const name = path.basename(f, path.extname(f)) + (alpha ? '.png' : '.jpg');
    const dst = path.join(OUT, name);
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) continue;
    const resized = img.resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    await (alpha ? resized.png({ compressionLevel: 9, palette: false }) : resized.jpeg({ quality: 82, mozjpeg: true })).toFile(dst);
    done++;
  }
  if (done) console.log(`✓ Optimized ${done} image(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await optimizeImages();
