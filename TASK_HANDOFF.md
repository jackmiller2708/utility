# Task Handoff

## Milestone Status

- **M0 — Foundation & Vertical Slice**: Completed ✅
- **Next Milestone**: M1 / M2 — PDF (Poppler) & Media Expansion

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

## Verification & Test Results

1. **Unit & Integration Tests**:
   - `apps/utility-api/test/tools.spec.ts`: Passes (verifies Effect layer wiring, `ToolRegistry`, and `image.resize` in isolated workspace).
   - `apps/utility-web/src/app/app.spec.ts`: Passes (verifies Angular component instantiation and UI scaffolding).
2. **End-to-End Tests**:
   - `apps/utility-api/test/app.e2e-spec.ts`: Passes (verifies `GET /api/v1/auth/status`, `GET /api/v1/tools`, `POST /api/v1/tools/image.resize` with real image processing via Sharp, and `GET /api/v1/artifacts/:id/download`).
3. **Monorepo Build**:
   - `npm run build`: All 6 packages and both applications build cleanly.

---

## Next Steps for M2 (PDF)

- Implement Poppler-based PDF extraction and page rendering operations (`pdf.render-pages`, `pdf.extract-images`, `pdf.inspect`) inside `packages/pdf`.
- Expose PDF operations in `ToolRegistry` and create corresponding UI views in `apps/utility-web`.
- Implement asynchronous jobs engine (M3) for multi-page batch PDF processing.
