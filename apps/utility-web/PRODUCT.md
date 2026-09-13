# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Graphic designers and creators who need fast, secure media transformations for their daily design workflows without relying on third-party cloud uploads. Secondary: power users and developers operating the same private utility server for local file and media transformations without manual CLI wrangling.

## Product Purpose

Utility Web is the modern, reactive web client for the Utility Platform. It gives designers and creators a frictionless daily workbench: drag-and-drop file selection, granular parameter tuning, live inspection, and side-by-side artifact comparison before download — backed by discovering available tools, configuring typed operation parameters, and monitoring execution in real-time.

## Positioning

A fast, secure, local-first media transformation workstation for designers and creators — typed schema-driven safety, ephemeral workspace isolation, and zero telemetry — replacing third-party cloud upload converters and ad-hoc shell scripts with private, reproducible, in-browser-driven operations that never send source files to an external server.

## Operating Context

- **Environment**: Modern desktop and mobile browsers accessing the Utility API server over localhost or authenticated local area networks (LAN).
- **Workflows**: Drag-and-drop file selection, granular form parameter tuning, live dimension & format inspection, and side-by-side artifact comparison before downloading final assets. Real-time job execution and quick preset shortcuts speed up repetitive daily tasks.
- **Integration**: Communicates with the NestJS + Effect backend (`apps/utility-api`) using schema-validated REST/multipart contracts.

## Capabilities and Constraints

- **Current Capabilities**:
  - Image manipulation (`image.resize`): Width/height adjustments, aspect ratio preserving fit modes (`inside`, `cover`, `contain`, `fill`, `outside`), format conversion (`webp`, `jpeg`, `png`, `avif`), upscale controls, and preset shortcuts (50%, 25%, 1080p, square).
  - PDF: render pages, extract embedded images, inspect metadata, merge, and split (a dedicated Merge & Split workbench).
  - Video/audio: inspect, thumbnail capture, audio extraction, and transcoding, with a scrubbable video preview.
  - Recipes: composed multi-step operations chaining one tool's output into the next's input, saved and re-runnable.
  - Async jobs: any operation can run as a background job with real progress and cancellation in a persistent footer tray; batch mode submits many files as independent jobs under one ticket.
  - File inspection: Live previews, dimension tracking, raw size vs. output size comparison, and SHA-256 fingerprint display.
  - Tool discovery: Sidebar navigation of registered system tools and categories.
  - Recent Artifacts: a searchable, paginated, filterable archive of every artifact produced.
  - Device management: a Devices page to name, approve, rename, and revoke enrolled devices.
  - Secure artifact retrieval: One-click downloads and inline previews from the managed ArtifactStore, authenticated even off localhost.
- **Constraints**:
  - Frontend contains zero OS-specific paths or logic; all execution occurs in server-side sandboxed workspaces.
  - Device authentication required for non-local requests.

## Brand Commitments

- **Tone & Aesthetic**: Precise, secure, and creator-friendly — approachable for designers, not gated behind developer-grade or command-line framing.
- **UI Language**: Dark-themed by default, focused typography, clear status indicators, and minimal distraction.

## Evidence on Hand

- Fully functional Angular 22 frontend in `apps/utility-web` with Tailwind CSS, covering every capability above.
- Backend adapters for Sharp (image), Poppler/Ghostscript (PDF), and FFmpeg (media) in `apps/utility-api`, all running through the same generic Tool/Operation/Job routes.
- Core contracts defined in `@utility/protocol` and domain models in `@utility/domain`.

## Product & Frontend Architecture Principles

1. **Frictionless Ergonomics**: Prioritize drag-and-drop, smart presets, and single-click actions to eliminate repetitive daily design tasks.
2. **Immediate & Trustworthy Feedback**: Provide instant visual previews, precise raw-vs-output file size deltas, and cryptographic integrity hashes for all artifacts.
3. **Human-Centered Design**: Present clean, accessible parameter forms rather than confusing command-line abstractions.
4. **Atomic Design System**: Pure presentation components in `ui/{atoms,molecules,organisms,templates}` decoupled from business logic.
5. **Deep Modular Routing**: Feature workflows encapsulated in `app/modules/*` with dedicated routes, services, and components.
6. **Core & Domain Layering**: `domain/*` manages contracts/models and `core/*` manages runtime/HTTP/auth services.
7. **Separated Template Files**: All templates reside in dedicated `.html` files (`templateUrl`) for clear mental separation.
8. **Privacy & Sandboxed Safety**: Ensure all transformations remain strictly local and isolated without OS path leakage.
