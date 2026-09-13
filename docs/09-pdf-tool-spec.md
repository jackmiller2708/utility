# PDF Tool Specification

## Adapter

Poppler-utils for inspect/render/extract/merge; Ghostscript (`gs`) for split.

The PDF package owns the mapping between intent and these executables.

## Operations

### pdf.render-pages

```ts
{
  input: FileId
  dpi?: number
  firstPage?: number
  lastPage?: number
}
```

Renders each page (or the given range) to PNG — one `Artifact` per page.

### pdf.extract-images

Extract every embedded raster image to PNG — one `Artifact` per image.

### pdf.inspect

Return page count and title/author when present.

### pdf.merge

Merge multiple PDFs, in the given order, into one.

### pdf.split

Extract one or more page ranges into separate PDF artifacts (via Ghostscript,
one invocation per range).

## Adapter responsibilities

- select executable
- generate arguments
- allocate Workspace paths
- capture stdout/stderr
- interpret exit codes
- translate failures into typed Pdf errors

## Dependency availability

The server should be able to report whether required Poppler executables are installed.
