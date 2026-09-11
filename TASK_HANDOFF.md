# Task Handoff

## Milestone Status

- **M0 — Foundation & Vertical Slice**: Completed ✅
- **M2 — PDF (Poppler)**: Completed ✅ — backend (`pdf.inspect`, `pdf.render-pages`, `pdf.extract-images`, `pdf.merge`, `pdf.split`) and UI (`PDF Documents` + `Merge & Split` workbenches) both shipped — see summaries below.
- **Next Milestone**: M3 — Jobs (async execution, progress, cancellation, in-memory job registry)

---

## M0 Implementation Summary

The first complete vertical slice has been successfully implemented and verified end-to-end:
**Angular Web Client → Authenticated NestJS API → Effect Tool Registry → `image.resize` → Sharp Adapter → Workspace Isolation → Artifact Store & Download.**

### 1. Monorepo & Workspaces Structure

- Configured root npm workspace (`package.json`, `tsconfig.base.json`) managing `apps/*` and `packages/*`.
- **Apps**:
  - `apps/utility-api`: NestJS 12 API server shell hosting Effect application runtime on Node 24.
  - `apps/utility-web`: Angular 22 web client with Tailwind CSS and standalone reactive architecture.
- **Packages**:
  - `packages/domain` (`@utility/domain`): Pure domain types, brands (`FileId`, `ArtifactId`, `WorkspaceId`, `DeviceId`), and error classes.
  - `packages/runtime` (`@utility/runtime`): Effect services and live layers for `FileSystem`, `WorkspaceManager`, `Process`, and `ArtifactStore`.
  - `packages/protocol` (`@utility/protocol`): Effect Schema contracts for tools, operations, artifacts, and device identity.
  - `packages/toolkit` (`@utility/toolkit`): Generic `Tool`, `Operation`, and `ToolRegistry` interfaces and registry layer.
  - `packages/image` (`@utility/image`): Sharp image processing adapter, typed image errors, and `image.resize` operation.
  - `packages/pdf` (`@utility/pdf`): Poppler adapter architecture and interface foundation for M2.

---

### 2. Capabilities & Architecture

- **Runtime Services (`@utility/runtime`)**:
  - `FileSystem`: Typed Effect filesystem operations (`read`, `write`, `copy`, `move`, `stat`, `remove`, `exists`).
  - `WorkspaceManager`: Ephemeral sandboxes per operation (`input/`, `temp/`, `output/`) with path traversal guards and automatic cleanup.
  - `Process`: Controlled binary spawning using argument arrays (never executing shell strings).
  - `ArtifactStore`: Artifact registration, SHA-256 calculation, metadata persistence (`~/.utility/artifacts`), and secure path lookup.
- **Image Adapter (`@utility/image`)**:
  - `SharpImageServiceLive`: Handles resize, aspect ratios (`inside`, `cover`, `contain`, `fill`, `outside`), format conversions (`webp`, `jpeg`, `png`, `avif`), and metadata extraction.
- **Security & Device Auth (`apps/utility-api`)**:
  - `DeviceAuthGuard` & `DeviceAuthService`: Auto-authorizes localhost development traffic (`127.0.0.1`, `localhost`) while supporting cryptographic device signature verification (`x-device-id`, `x-timestamp`, `x-nonce`, `x-signature`) for remote/LAN requests.
- **Angular Client (`apps/utility-web`)**:
  - Drag-and-drop file upload with live preview and dimension/size inspector.
  - Granular resize controls: target width/height, quick scaling presets (50%, 25%, 1080p, square), fit modes, output format selector, and upscale toggles.
  - Result view: side-by-side comparison, file size reduction percentage, SHA-256 fingerprint, and one-click artifact download.

---

## M2 Implementation Summary (PDF Backend)

Poppler-backed PDF operations are implemented end-to-end and reachable over HTTP, following the exact same `Tool`/`Operation`/`ToolRegistry` pattern `image.resize` established in M0 — no new controller code was needed; they ride the existing generic `POST /api/v1/tools/:operationId` route.

- **`packages/pdf`**:
  - `PdfService` (`PopplerPdfServiceLive`): shells out to `pdfinfo`, `pdftoppm -png`, and `pdfimages -png` (all via the sandboxed `Process` service — argument arrays only, never shell strings). Requires `Process` and `FileSystem`.
  - `inspect`: page count, and title/author when present in the PDF's metadata.
  - `renderPages`: renders every page (or a `firstPage`–`lastPage` range) to PNG at a configurable DPI (default 150); lists the workspace output directory to collect the rendered files.
  - `extractImages`: extracts every embedded raster image to PNG; returns an empty list (not an error) when a PDF has none.
  - `InvalidPdfError` / `PdfProcessingError` (`errors.ts`): a malformed/non-PDF input is distinguished from an operational failure by sniffing Poppler's stderr, and maps to `400 Bad Request` in the API (see `effect-runtime.service.ts`).
  - `tool.ts`: `pdfTool` (category `"Document"`) registers `pdf.inspect`, `pdf.render-pages` (params: `dpi`, `firstPage`, `lastPage`), and `pdf.extract-images`. Both multi-output operations save one `Artifact` per page/image via the existing `ArtifactStore`, so they download through the existing `/api/v1/artifacts/:id/download` route unchanged.
- **`packages/protocol/src/pdf.ts`**: `PdfInspectInput/Output`, `PdfRenderPagesInput/Output`, `PdfExtractImagesInput/Output` — the render/extract outputs carry `pages: Artifact[]` / `images: Artifact[]`.
- **`apps/utility-api`**: `pdfTool` + `PopplerPdfServiceLive` registered in `AppLive` alongside the image layer; `@utility/pdf` added as a dependency.
- **System requirement**: `poppler-utils` (`pdfinfo`, `pdftoppm`, `pdfimages`) must be installed on the host — same category of dependency as Sharp is for image, just a system package instead of an npm one.

## M2 Implementation Summary (Merge & Split Backend)

Added after the PDF Documents UI shipped, completing the roadmap's M2 `merge/split` item.

- **`packages/pdf/src/service.ts`**: `splitRanges` (Ghostscript `gs -sDEVICE=pdfwrite -dFirstPage=X -dLastPage=Y`, one invocation per range, run sequentially) and `merge` (`pdfunite in1 in2 ... out.pdf`). Both real-file-verified: a 13-page extract from a live 110-page/96MB document, and a 3-page merge across two files in a **user-reordered** sequence (drag-to-reorder in the UI, confirmed by checking the merged page count matched the reordered, not upload, order).
- **`isMalformedPdfStderr`** (shared with inspect/render/extract) extended to recognize Ghostscript's own malformed-input phrasing (`Unrecoverable error`, `stackunderflow`, `trailer dictionary`) alongside Poppler's, verified against Ghostscript's real stderr output on a non-PDF input.
- **New system requirement**: Ghostscript (`gs`) — confirmed present on this host, not previously a project dependency.
- **`packages/pdf/src/tool.ts`**: a second tool, `pdfMergeSplitTool` (id `pdf-merge-split`, category `"Document"`), separate from `pdfTool` — registers `pdf.merge` and `pdf.split` as their own sidebar-level tool rather than folding them into `PDF Documents`, since merge's multi-file input doesn't fit that tool's single-file screen.
- **`apps/utility-api/src/tools/tools.controller.ts`**: unlike inspect/render/extract, merge and split needed **dedicated routes** (declared before the generic `:operationId` catch-all, since Express matches route registration order) — `pdf.merge` uses `FilesInterceptor('files')` for true multi-file upload (the generic route only supports one `file` field), and `pdf.split` uses `FileInterceptor('file')` plus a `ranges` form field sent as a JSON string (`[{firstPage,lastPage}, ...]`) and parsed server-side, since multipart form-data can't carry structured arrays natively.
- **`apps/utility-web`**: new `document/merge-split` module. New reusable pieces: `SortableFileListComponent` (native HTML5 drag-and-drop reorder, no library), a `grip` icon added to `IconComponent`, and `DropzoneComponent` extended (additively — existing single-file consumers unchanged) with a `multiple` input/`filesSelected` output and a `showPasteHint` toggle. `GalleryGridComponent` now hides "Download All" when there's exactly one result (merge always produces one file — the button was redundant chrome for that case).

## Verification & Test Results

1. **Unit & Integration Tests** (`apps/utility-api/test/pdf-tools.spec.ts`, 12 tests):
   - `apps/utility-api/test/tools.spec.ts`: Passes (verifies Effect layer wiring, `ToolRegistry`, and `image.resize` in isolated workspace).
   - Tool registration for both `pdf` and `pdf-merge-split`; `inspect` page count; malformed-PDF rejection; `render-pages` full-document and page-range rendering; `extract-images` with and without embedded images; `split` single-range and multi-range extraction; `merge` combines files in order; split rejects an invalid PDF. Test PDFs are built by hand (a small inline PDF-object writer) so the suite needs no PDF-authoring dependency.
   - `apps/utility-web/src/app/app.spec.ts`: Passes (verifies Angular component instantiation and UI scaffolding).
2. **End-to-End Tests** (`apps/utility-api/test/app.e2e-spec.ts`, 12 tests):
   - `GET /api/v1/auth/status`, `GET /api/v1/tools` (asserts `image`, `pdf`, and `pdf-merge-split` tools).
   - `POST /api/v1/tools/image.resize` with real image processing via Sharp.
   - `POST /api/v1/tools/pdf.inspect`, `pdf.render-pages`, `pdf.extract-images` through the generic `:operationId` route.
   - `POST /api/v1/tools/pdf.split` and `pdf.merge` through their dedicated routes, including both validation-rejection cases (no ranges; fewer than two files).
3. **Live verification against a real 110-page, 96MB document** (not synthetic): the M2 UI's DPI/page-range cost estimates were checked against real `pdftoppm` timing on this exact file (150 DPI ≈3m25s/128MB, 600 DPI page-range nudge ≈1m33s/26.7MB — both matched precisely); a real 13-page split (pages 40–52) and a real 3-page merge (two files, user-reordered via drag-and-drop, confirmed via the resulting page count) were run end-to-end through the browser and independently verified with `curl`/`pdfinfo` against the live API.
4. **Monorepo Build**:
   - `npm run build`: All 6 packages and both applications build cleanly.

---

## Next Steps

- **M3 — Jobs**: async execution, progress, cancellation, in-memory job registry. This is the real prerequisite the M2 UI's "simple busy state" (elapsed-time counter, no true progress) was built to tolerate — large documents at high DPI take minutes with no cancel option today.
- Nothing left unbuilt from the M2 roadmap item (`Poppler adapter`, `render pages`, `extract images`, `inspect`, `merge/split` are all shipped, backend and UI).
- Known pre-existing gap, not addressed: the HTTP error interceptor was fixed this session to surface real backend messages, but this was a general fix, not PDF-specific — worth keeping in mind that similar generic-message issues elsewhere in the app are now resolved by the same change.
