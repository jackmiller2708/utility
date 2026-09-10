# Image Tool Specification

## Adapter

Sharp.

The public Image API must not expose Sharp-specific concepts unless they are intentionally part of the product contract.

## image.resize

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

```ts
Artifact
```

## image.convert

Initial formats:

- JPEG
- PNG
- WebP
- AVIF when supported by the installed Sharp/libvips build

## image.compress

Application-level compression controls.

Avoid exposing the complete Sharp option surface.

## image.metadata

Returns structured metadata without generating an output file.

## Rules

- input is a FileId
- output is Workspace-owned
- Sharp errors become typed Image errors
- no arbitrary output paths
