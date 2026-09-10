# Project Source of Truth

## Product

Utility Platform is a private local utility server with a web client. It turns repetitive Linux file/media operations into simple typed tools.

## Architectural principle

Tools express intent. Runtime capabilities perform system operations.

Tool packages must not expose shell commands as their public API.

## Target stack

- TypeScript
- Effect
- Effect Schema
- Node.js runtime for the initial server
- Web frontend
- Sharp for image manipulation
- Poppler utilities for PDF manipulation
- FFmpeg planned as a future media adapter
- Tauri planned as a desktop distribution layer

## Runtime model

Web Client
→ API/Protocol
→ Server Shell
→ Tool Registry
→ Tool Package
→ Runtime Capability
→ Linux/Native Dependency

## Core runtime capabilities

- FileSystem
- Workspace
- Process
- Artifact
- Temporary storage
- Logging
- Configuration
- Device identity/authentication

## Core domain concepts

- Path
- File
- Directory
- FileId
- Artifact
- Workspace
- Tool
- Operation
- Job
- ToolError

## Rules

1. Domain packages must remain independent from OS APIs.
2. Tool packages must depend on runtime capabilities rather than directly executing arbitrary commands.
3. OS-specific implementation belongs in adapters.
4. The API contract must be typed and schema-driven.
5. Intermediate files should normally live inside a managed Workspace.
6. User-visible APIs should describe intent, not implementation commands.
7. Long-running operations must be represented as jobs rather than blocking HTTP requests.
8. Every tool operation must have structured errors.
9. Device authentication is required for network access.
10. The server should bind to localhost by default; LAN exposure is an explicit configuration choice.
