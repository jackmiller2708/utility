# Image Tool Specification

## Adapter

Sharp.

The public Image API must not expose Sharp-specific concepts unless they are intentionally part of the product contract.

## image.resize

Resize, format conversion, and quality are one operation, not three — there is
no separate convert/compress/metadata operation for images (contrast with PDF
and media, which do have a standalone `inspect`).

Input:

```ts
{
  input: FileId
  width?: number
  height?: number
  fit?: "cover" | "contain" | "fill" | "inside" | "outside"
  position?: string
  withoutEnlargement?: boolean
  format?: "jpeg" | "png" | "webp" | "avif"   // omit to keep the source format
  quality?: number                             // 1-100, lossy formats only
}
```

Output:

```ts
Artifact
```

Supported output formats: JPEG, PNG, WebP, and AVIF when supported by the
installed Sharp/libvips build.

## Rules

- input is a FileId
- output is Workspace-owned
- Sharp errors become typed Image errors
- no arbitrary output paths
