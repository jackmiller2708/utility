# Effect Architecture

## Goal

Use Effect as the framework-independent application and capability layer.

## Services

Initial services:

```text
FileSystem
Workspace
Process
ArtifactStore
Logger
Clock
```

Tool services:

```text
ImageService
PdfService
```

## Layer composition

Conceptual:

```ts
const AppLive =
  ImageLive.pipe(
    Layer.provide(SharpImageLive),
    Layer.provide(WorkspaceLive),
    Layer.provide(FileSystemLive),
    Layer.provide(ProcessLive),
  )
```

The exact implementation can evolve during M0.

## Error model

Use typed errors rather than generic thrown exceptions.

Examples:

```text
FileNotFound
PermissionDenied
InvalidPath
WorkspaceFailure
ProcessFailure
DependencyUnavailable
InvalidImage
UnsupportedImageFormat
ImageProcessingFailure
```

## NestJS integration

NestJS owns the HTTP request lifecycle.

A small adapter/provider exposes an Effect runtime to controllers.

The Effect program remains independent from NestJS.

Avoid putting `@Injectable()` or controller decorators into domain/tool packages.

## Testing

Tool packages should be testable with alternative Layers.

Example:

```text
Image.resize
    ↓
Fake FileSystem
Fake Workspace
Fake ImageService
```

This permits deterministic tests without Sharp or real disk I/O.
