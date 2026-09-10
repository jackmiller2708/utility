# Image Tool Specification

## Implementation

Initial implementation: Sharp.

Sharp is an adapter. The public tool contract must not expose Sharp-specific APIs.

## Operations

### image.resize

Resize an image.

Input:

```ts
{
  input: FileId
  width?: number
  height?: number
  fit?: "cover" | "contain" | "fill" | "inside" | "outside"
  position?: string
  withoutEnlargement?: boolean
}
```

Output:

One image Artifact.

### image.convert

Convert image format.

Initial formats:

- JPEG
- PNG
- WebP
- AVIF where supported by installed Sharp/libvips

### image.compress

Optimize an image while preserving the requested format.

The exact compression controls should be normalized into application-level concepts rather than exposing every Sharp option.

### image.metadata

Return structured metadata without creating a new file.

## Constraints

- Input comes from FileId/Workspace.
- Output is created inside the current Workspace.
- No public operation accepts arbitrary filesystem paths.
- Sharp errors are translated into ImageError.
