# Development Roadmap

## M0 — Foundation

- Monorepo
- Effect
- domain package
- runtime package
- protocol package
- server shell
- web shell
- FileSystem
- Workspace
- Process
- Tool Registry

## M1 — Image vertical slice

- Sharp adapter
- image.resize
- upload
- artifact download
- basic web UI
- basic device authentication

## M2 — PDF

- Poppler adapter
- PDF render
- PDF extraction
- PDF metadata
- PDF merge/split

## M3 — Jobs

- asynchronous operations
- progress
- cancellation
- job history during process lifetime

## M4 — Better client

- tool discovery
- generated operation forms
- drag/drop files
- batch operations
- recent artifacts

## M5 — Media

- FFmpeg adapter
- thumbnails
- audio extraction
- video conversion

## M6 — Tauri

Use the existing web application as the UI layer inside Tauri.

The Tauri desktop client should communicate with the same application/protocol boundaries rather than introducing a second implementation of every tool.

Tauri is suitable here because it provides a native desktop shell around a web frontend and can bridge frontend code to native functionality when needed. citeturn0search0turn0search1

## M7 — Workflow engine

Only after the atomic tool model is stable:

- composed workflows
- pipeline definitions
- reusable recipes
- batch processing
