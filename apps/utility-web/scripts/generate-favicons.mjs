// One-off generator for the app's favicon set, from the same nested-square mark used in
// header.component.html (ported from the Design project's "Brand Marks" canvas — keep this
// in sync with that canvas if the mark ever changes). Not wired into `npm run build`: run
// manually (`node scripts/generate-favicons.mjs`) whenever the mark changes, and commit the
// resulting files in `public/` as static assets.
//
// Produces:
//   public/favicon.svg          scalable, primary icon for modern browsers
//   public/favicon.ico          16/32/48 multi-resolution, legacy fallback
//   public/apple-touch-icon.png 180x180, iOS home-screen/bookmarks
//
// `sharp` can't emit .ico directly, and adding a second one-off npm dependency just to pack
// an ICO felt unwarranted for a file format this simple — so the ICO container below is
// hand-rolled instead. Modern ICO files can embed PNG-compressed frames directly (supported
// since Windows Vista, and by every current browser), so this just concatenates the PNGs
// sharp already produces behind a minimal ICONDIR/ICONDIRENTRY header.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const publicDir = join(import.meta.dirname, '../public');

/**
 * Ports the Design canvas's `mark()` helper: a filled square inside an open one, on a fixed
 * 32-unit grid. `size` only sets the rendered pixel footprint (the viewBox stays 0 0 32 32);
 * every other option affects the actual rect geometry.
 */
function markSvg({ size, stroke, fill, plate = null, weight = 2.5, inset = 2.25, solid = false, radius = 0 }) {
  const span = 32 - inset * 2;
  const parts = [];

  if (plate) {
    parts.push(`<rect x="0" y="0" width="32" height="32" rx="${radius}" fill="${plate}" />`);
  }

  if (solid) {
    // At 16px the outline drops away and the mark becomes two solid blocks -- the shape
    // still reads at tab size, where a hairline stroke would smear.
    parts.push(`<rect x="${inset}" y="${inset}" width="${span}" height="${span}" fill="${stroke}" />`);
  } else {
    parts.push(
      `<rect x="${inset}" y="${inset}" width="${span}" height="${span}" stroke="${stroke}" stroke-width="${weight}" fill="none" />`
    );
  }

  const gap = solid ? 3 : weight / 2 + 1.25;
  const fSpan = (span - gap) * 0.55;
  const fXY = inset + gap;
  parts.push(`<rect x="${fXY}" y="${fXY}" width="${fSpan}" height="${fSpan}" fill="${fill}" />`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">${parts.join('')}</svg>`;
}

// Shared ink per the favicon spec in the Brand Marks canvas.
const INK = '#221D16';
const PRIMARY = '#FF3EA5';
const PLATE = '#EFE6D2';

const favicon32Svg = markSvg({ size: 32, stroke: INK, fill: PRIMARY, plate: PLATE, weight: 4 });
const appleTouchIconSvg = markSvg({ size: 180, stroke: INK, fill: PRIMARY, plate: PLATE, weight: 3.25, radius: 6 });
// Not a size in the canvas's own favicon table -- ICO also wants a 48px frame. Reuses the
// 32px definition's proportions with `weight` scaled up so the stroke doesn't read as
// disproportionately thin at the larger size.
const favicon48Svg = markSvg({ size: 48, stroke: INK, fill: PRIMARY, plate: PLATE, weight: 4 * (48 / 32) });
const favicon16Svg = markSvg({ size: 16, stroke: INK, fill: PRIMARY, plate: PLATE, inset: 4, solid: true });

/** Minimal ICO container (ICONDIR + ICONDIRENTRY per frame) wrapping already-encoded PNG buffers. */
function packIco(pngFrames) {
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * pngFrames.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngFrames.length, 4);

  const entries = [];
  let offset = dirSize;
  for (const { size, png } of pngFrames) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.byteLength, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.byteLength;
  }

  return Buffer.concat([header, ...entries, ...pngFrames.map((f) => f.png)]);
}

async function main() {
  const [png16, png32, png48, appleTouchPng] = await Promise.all([
    sharp(Buffer.from(favicon16Svg)).png().toBuffer(),
    sharp(Buffer.from(favicon32Svg)).png().toBuffer(),
    sharp(Buffer.from(favicon48Svg)).png().toBuffer(),
    sharp(Buffer.from(appleTouchIconSvg)).png().toBuffer(),
  ]);

  const ico = packIco([
    { size: 16, png: png16 },
    { size: 32, png: png32 },
    { size: 48, png: png48 },
  ]);

  writeFileSync(join(publicDir, 'favicon.svg'), favicon32Svg);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
  writeFileSync(join(publicDir, 'apple-touch-icon.png'), appleTouchPng);

  console.log('Wrote public/favicon.svg, public/favicon.ico, public/apple-touch-icon.png');
}

main();
