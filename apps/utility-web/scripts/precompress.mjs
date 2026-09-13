// Precompresses the Angular browser bundle at build time so the server can
// hand back a hashed, immutable asset without paying any compression cost
// per request. Uses Brotli at max quality (slow, but this runs once at
// build time) plus a gzip fallback for clients that don't send `br` in
// Accept-Encoding.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const distDir = join(import.meta.dirname, '../dist/utility-web/browser');

// Already-compressed or binary formats (images, fonts, favicons) gain
// nothing from a second pass -- only precompress text-based assets.
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.js',
  '.css',
  '.html',
  '.json',
  '.svg',
  '.xml',
  '.webmanifest',
  '.txt',
  '.map',
]);

// Below this, the .br/.gz header overhead can exceed the savings.
const MIN_SIZE_BYTES = 1024;

function precompressDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      precompressDir(fullPath);
      continue;
    }
    if (
      !COMPRESSIBLE_EXTENSIONS.has(extname(entry.name)) ||
      entry.name.endsWith('.br') ||
      entry.name.endsWith('.gz')
    ) {
      continue;
    }

    const contents = readFileSync(fullPath);
    if (contents.byteLength < MIN_SIZE_BYTES) {
      continue;
    }

    writeFileSync(
      `${fullPath}.br`,
      brotliCompressSync(contents, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: contents.byteLength,
        },
      }),
    );
    writeFileSync(
      `${fullPath}.gz`,
      gzipSync(contents, { level: constants.Z_BEST_COMPRESSION }),
    );
  }
}

precompressDir(distDir);
