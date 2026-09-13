import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

// Content types for the static asset extensions scripts/precompress.mjs
// precompresses at build time. Set explicitly because serving a `.br`/`.gz`
// path directly (see below) would otherwise make express.static infer the
// type from that suffix instead of the asset's real extension.
const STATIC_CONTENT_TYPES: Record<string, string> = {
  '': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Container healthcheck target. Registered ahead of the Angular SSR handler
 * so it never reaches Angular's Host-header validation (NG_ALLOWED_HOSTS) --
 * that check rejects the "localhost" Host header Docker's healthcheck sends,
 * since only the LAN/Tailscale hostnames are allowed there.
 */
app.get('/__health', (_req, res) => {
  res.status(200).send('ok');
});

/**
 * Serve the build-time precompressed (.br/.gz) sibling of a static asset
 * when the client accepts that encoding, so hashed bundles never pay a
 * runtime compression cost. Falls through to plain express.static for
 * anything without a precompressed sibling (e.g. favicon.ico).
 */
app.use((req, res, next) => {
  const contentType = STATIC_CONTENT_TYPES[extname(req.path)];
  if (!contentType) {
    next();
    return;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] ?? '');
  const filePath = join(browserDistFolder, req.path);
  const candidates: ReadonlyArray<[encoding: string, suffix: string]> = [
    ['br', '.br'],
    ['gzip', '.gz'],
  ];

  for (const [encoding, suffix] of candidates) {
    const compressedPath = filePath + suffix;
    if (acceptEncoding.includes(encoding) && existsSync(compressedPath)) {
      res.set({
        'Content-Type': contentType,
        'Content-Encoding': encoding,
        'Cache-Control': 'public, max-age=31536000',
        Vary: 'Accept-Encoding',
      });
      res.sendFile(compressedPath);
      return;
    }
  }

  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
