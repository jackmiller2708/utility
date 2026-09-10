# Tool API Specification

## Tool

A Tool groups related operations.

```ts
interface Tool {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly operations: readonly Operation[]
}
```

## Operation

Each operation has:

- stable ID
- input Schema
- output Schema
- error model
- implementation
- UI metadata

Example:

```text
image.resize
```

Input:

```ts
{
  input: FileId
  width?: number
  height?: number
  fit?: "cover" | "contain" | "fill" | "inside" | "outside"
}
```

Output:

```ts
{
  artifact: Artifact
}
```

## Schema-first

Effect Schema is the source of truth for operation contracts.

Schemas should support:
- runtime validation
- TypeScript inference
- API serialization
- client typing
- generated form metadata
- documentation

## Registry

Stable operation IDs:

```text
image.resize
image.convert
image.compress
image.metadata

pdf.render-pages
pdf.extract-images
pdf.inspect
pdf.merge
pdf.split
```

Implementation changes must not require API changes unless behavior changes.

## UI metadata

Operation schemas may eventually contain metadata such as:

```text
label
description
input type
min/max
file constraints
preferred UI control
```

Do not over-engineer dynamic UI generation during M0.
