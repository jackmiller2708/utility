# PDF Tool Specification

## Implementation

Initial implementation: Poppler command-line utilities.

The PDF package owns the mapping from intent to Poppler commands.

## Initial operations

### pdf.render-pages

Render PDF pages to images.

Parameters:

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

Extract embedded images from a PDF.

### pdf.inspect

Return structured PDF metadata.

### pdf.merge

Merge multiple PDFs.

### pdf.split

Split a PDF into one or more PDF artifacts.

## Process boundary

Poppler commands are never assembled by the web client.

The adapter owns:

- executable selection
- argument generation
- temporary output paths
- stdout/stderr handling
- exit-code interpretation
- error translation

## Dependency checks

At startup or first use, the PDF adapter should be able to report whether required Poppler executables are available.
