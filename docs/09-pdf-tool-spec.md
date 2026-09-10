# PDF Tool Specification

## Adapter

Poppler-utils.

The PDF package owns the mapping between intent and Poppler executables.

## Initial operations

### pdf.render-pages

```ts
{
  input: FileId
  format: "png" | "jpeg"
  dpi?: number
  pageRange?: {
    from?: number
    to?: number
  }
}
```

### pdf.extract-images

Extract embedded images.

### pdf.inspect

Return PDF metadata.

### pdf.merge

Merge PDFs.

### pdf.split

Split into PDF artifacts.

## Adapter responsibilities

- select executable
- generate arguments
- allocate Workspace paths
- capture stdout/stderr
- interpret exit codes
- translate failures into typed Pdf errors

## Dependency availability

The server should be able to report whether required Poppler executables are installed.
