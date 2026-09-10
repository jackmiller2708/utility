# Architecture Decision Log

## ADR-001 — Local-first server

Status: Accepted.

The host computer is the primary compute and storage environment.

Reason:
- Linux tooling is directly available.
- No cloud infrastructure is required.
- Files remain local.
- Personal workflows have low operational requirements.

## ADR-002 — Effect as application foundation

Status: Accepted.

Effect is used for typed services, dependency composition, errors, concurrency, and schema-driven boundaries.

## ADR-003 — Tool APIs hide implementation

Status: Accepted.

The API expresses user intent rather than exposing Sharp/Poppler/FFmpeg command parameters.

Reason:
- safer
- easier UI
- implementation can change
- workflows become composable

## ADR-004 — Workspace-owned temporary files

Status: Accepted.

Each operation works inside a managed workspace.

Reason:
- cleanup
- isolation
- predictable intermediate files
- debugging failed operations

## ADR-005 — No generic shell endpoint

Status: Accepted.

The server will not expose arbitrary command execution to the client.

## ADR-006 — Device authentication instead of accounts

Status: Accepted.

The application is single-owner/private, so account and role management add unnecessary complexity. Device identity provides the needed network boundary.

## ADR-007 — HTTP first, Tauri later

Status: Accepted.

The web client and server protocol are built first. Tauri becomes a distribution/integration layer later.

Tauri uses a webview frontend and native backend/message-passing architecture, making this separation compatible with the planned desktop client. citeturn0search0
