# Utility Platform

A private, local-first utility platform for file manipulation and workflow automation.

## Vision

Provide a web UI for common workflows while keeping implementation details behind typed Effect-TS capabilities. Linux-native utilities such as Sharp, Poppler, and FFmpeg are adapters, not the public API.

Core principle:

> The server is a capability runtime, not a command executor.

## Initial goals

- Web client served by the user's Linux machine.
- No traditional account system.
- Device authentication using cryptographic device identity.
- Typed tool APIs using Effect Schema.
- Shared filesystem, workspace, process, and artifact abstractions.
- Image operations backed by Sharp.
- PDF operations backed by Poppler utilities.
- Extensible package architecture.
- Later: Tauri desktop client using the same web/application protocol.

## Non-goals for v0

- Public hosting.
- Multi-user authorization.
- Cloud storage.
- Arbitrary shell execution from the web client.
- Workflow visual editor.
- Plugin marketplace.
- Database-heavy persistence.
