# Task Handoff

## Current milestone

M0 — Foundation

## Objective

Create the smallest working vertical slice:

Web Client → authenticated API → Tool Registry → Image Tool → Sharp → Workspace → output artifact.

## Required outcomes

- Monorepo initialized.
- Effect configured.
- Core domain types created.
- Runtime FileSystem capability created.
- Workspace capability created.
- Process capability created.
- Tool registry created.
- Device identity/authentication design stubbed.
- Image package created.
- Sharp adapter implemented.
- One image operation implemented: resize.
- API endpoint implemented for the resize operation.
- Web client can upload an image, resize it, and download the result.

## Explicitly defer

- PDF tools.
- FFmpeg.
- Workflow editor.
- Persistent job database.
- LAN discovery.
- Tauri.
- Advanced device management UI.

## Definition of done

A fresh Linux checkout can start the server, open the web client, upload an image, request a resize using the typed API, and receive a generated artifact without constructing a shell command in the client.
