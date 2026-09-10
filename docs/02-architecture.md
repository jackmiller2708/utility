# Architecture

## System overview

```text
+--------------------+
|     Web Client     |
+---------+----------+
          |
          | typed protocol
          v
+--------------------+
|   Server Shell     |
| auth / API / jobs  |
+---------+----------+
          |
          v
+--------------------+
|   Tool Registry    |
+---------+----------+
          |
     +----+----+----------------+
     |         |                |
     v         v                v
  Image      PDF             Media
     |         |                |
   Sharp    Poppler          FFmpeg
     |         |                |
     +---------+----------------+
               |
               v
       Runtime Capabilities
       FileSystem / Process
       Workspace / Artifact
               |
               v
             Linux
```

## Package boundaries

### domain

Pure types and business concepts.

Must not import Node.js APIs, Sharp, Poppler wrappers, or HTTP framework code.

### runtime

System capabilities represented as Effect services.

Examples:

- FileSystem
- Process
- Workspace
- ArtifactStore
- Clock
- Logger

### tools

User-intent APIs.

Examples:

- Image.resize
- Image.convert
- Pdf.renderPages

### adapters

Concrete implementations.

Examples:

- SharpImageService
- PopplerPdfService
- FfmpegMediaService
- NodeFileSystem
- NodeProcess

### protocol

Transport-facing schemas.

The protocol maps typed tool operations to HTTP/WebSocket messages.

### server

Composition root.

The server assembles Layers, exposes the protocol, authenticates devices, and manages jobs.

## Dependency direction

```text
server
  ↓
protocol
  ↓
tools
  ↓
runtime
  ↓
adapters
  ↓
OS / native libraries
```

Domain schemas may be shared downward without acquiring infrastructure dependencies.

## Effect Layer model

Runtime dependencies should be injected with Effect Layers.

Example conceptual composition:

```ts
ServerLive
  .pipe(
    Layer.provide(ToolRegistryLive),
    Layer.provide(ImageLive),
    Layer.provide(PdfLive),
    Layer.provide(WorkspaceLive),
    Layer.provide(FileSystemLive),
    Layer.provide(ProcessLive),
  )
```

The exact implementation is intentionally left open until the first vertical slice.
