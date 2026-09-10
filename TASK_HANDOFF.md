# Task Handoff

## Current milestone

M0 — NestJS + Angular foundation

## Objective

Create the smallest complete vertical slice:

Angular → authenticated NestJS API → Effect Tool Registry → Image.resize → Sharp → Workspace → Artifact download.

## M0 tasks

### Repository

- Create TypeScript monorepo/workspace.
- Create `apps/api` with NestJS.
- Create `apps/web` with Angular.
- Create shared packages.

### Packages

Create:

```text
packages/
  domain/
  runtime/
  protocol/
  toolkit/
  image/
  pdf/
```

### Runtime

Implement Effect services for:

- FileSystem
- Workspace
- Process
- Artifact

### Tool system

Implement:

- Tool definition
- Operation definition
- Tool Registry
- Image tool
- `image.resize`

### Image

Implement Sharp adapter.

The browser must never know how Sharp is invoked.

### API

Implement:

```text
GET  /api/v1/tools
POST /api/v1/tools/image.resize
GET  /api/v1/artifacts/:id
```

### Web

Implement:

- tool list
- image upload
- resize form
- result/download

### Security

Implement the first device identity model.

Localhost should work in development without requiring repeated enrollment, but the architecture must support cryptographic device authentication before LAN exposure.

## Explicitly defer

- PDF implementation
- FFmpeg
- workflow editor
- persistent database
- Tauri
- cloud deployment
- multi-user accounts
- plugin marketplace

## Definition of done

A fresh Linux checkout can start the NestJS API and Angular client. A user can upload an image, resize it, and download the result. No client-side shell command or Sharp API is required.
