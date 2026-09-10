# Tool API Specification

## Tool

A Tool is a collection of related user-facing operations.

Conceptual shape:

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

- stable identifier
- input schema
- output schema
- structured error model
- implementation
- optional metadata for UI generation

Example:

```ts
Image.resize
```

Input:

```ts
{
  input: FileId,
  width?: number,
  height?: number,
  fit?: "cover" | "contain" | "fill" | "inside" | "outside"
}
```

Output:

```ts
{
  artifact: Artifact
}
```

## Schema-first design

Effect Schema should define operation contracts.

Schemas should be reusable by:

- server validation
- client types
- API serialization
- generated forms
- documentation
- tests

## Tool registry

The registry maps stable IDs to operations.

Example:

```text
image.resize
image.convert
image.compress

pdf.render-pages
pdf.extract-images
pdf.merge
```

IDs must remain stable even if the implementation changes.

## Implementation independence

This is valid:

```text
image.resize → Sharp
```

Later:

```text
image.resize → libvips
```

without changing the public operation contract unless behavior actually changes.

## Error model

Errors should be domain-specific.

Examples:

- InvalidImage
- UnsupportedFormat
- ImageProcessingFailed
- FileNotFound
- PermissionDenied
- WorkspaceFailure
- DependencyUnavailable

Avoid leaking raw process stderr directly as the primary API error.
