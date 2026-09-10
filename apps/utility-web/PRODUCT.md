# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Power users, developers, and creators operating a private personal utility server who need fast, secure, local file and media transformations (image resizing, format conversion, PDF inspection/extraction, and media operations) without manual CLI wrangling or third-party cloud uploads.

## Product Purpose

Utility Web is the modern, reactive web client for the Utility Platform. It provides an intuitive interface for discovering available tools, configuring typed operation parameters, uploading files, monitoring execution in real-time, and inspecting/downloading processed output artifacts.

## Positioning

A private, self-hosted utility workstation with typed schema-driven safety, ephemeral workspace isolation, and zero telemetry—replacing ad-hoc shell scripts and untrusted third-party web converters with local, reproducible operations.

## Operating Context

- **Environment**: Modern desktop and mobile browsers accessing the Utility API server over localhost or authenticated local area networks (LAN).
- **Workflows**: Drag-and-drop single/batch file selection, live dimension & format inspection, parameter tuning via granular forms and quick presets, real-time job execution, and side-by-side artifact comparison & download.
- **Integration**: Communicates with the NestJS + Effect backend (`apps/utility-api`) using schema-validated REST/multipart contracts.

## Capabilities and Constraints

- **Current Capabilities**:
  - Image manipulation (`image.resize`): Width/height adjustments, aspect ratio preserving fit modes (`inside`, `cover`, `contain`, `fill`, `outside`), format conversion (`webp`, `jpeg`, `png`, `avif`), upscale controls, and preset shortcuts (50%, 25%, 1080p, square).
  - File inspection: Live previews, dimension tracking, raw size vs. output size comparison, and SHA-256 fingerprint display.
  - Tool discovery: Sidebar navigation of registered system tools and categories.
  - Secure artifact retrieval: One-click downloads from the managed ArtifactStore.
- **Upcoming Capabilities**:
  - PDF operations (`pdf.render-pages`, `pdf.extract-images`, `pdf.inspect`).
  - Asynchronous batch job queuing and progress tracking.
- **Constraints**:
  - Frontend contains zero OS-specific paths or logic; all execution occurs in server-side sandboxed workspaces.
  - Device authentication required for non-local requests.

## Brand Commitments

- **Tone & Aesthetic**: Precise, utilitarian, developer-grade, and responsive.
- **UI Language**: Dark-themed by default, focused typography, clear status indicators, and minimal distraction.

## Evidence on Hand

- Fully functional Angular 22 frontend in `apps/utility-web` with Tailwind CSS.
- Working image processing vertical slice tested end-to-end with the backend Sharp adapter (`apps/utility-api`).
- Core contracts defined in `@utility/protocol` and domain models in `@utility/domain`.

## Product & Frontend Architecture Principles

1. **Tools Express User Intent**: Present clean, human-centered parameter forms rather than leaky command-line abstractions.
2. **Immediate & Trustworthy Feedback**: Provide instant visual previews, precise file size deltas, and cryptographic integrity hashes for all artifacts.
3. **Atomic Design System**: Pure presentation components in `ui/{atoms,molecules,organisms,templates}` decoupled from business logic.
4. **Deep Modular Routing**: Feature workflows encapsulated in `app/modules/*` with dedicated routes, services, and components.
5. **Core & Domain Layering**: `domain/*` manages contracts/models and `core/*` manages runtime/HTTP/auth services.
6. **Separated Template Files**: All templates reside in dedicated `.html` files (`templateUrl`) for clear mental separation.
7. **Privacy & Sandboxed Safety**: Ensure all transformations remain strictly local and isolated without OS path leakage.
