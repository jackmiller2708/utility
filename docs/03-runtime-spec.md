# Runtime Specification

## FileSystem

The FileSystem capability provides safe structured operations.

Required initial operations:

- read
- write
- copy
- move
- remove
- exists
- stat
- createDirectory
- listDirectory

Paths must be represented by a dedicated domain type rather than arbitrary strings where practical.

## Process

Process is an internal capability.

It accepts structured commands:

```ts
type Command = {
  executable: string
  args: readonly string[]
  cwd?: Path
  env?: Readonly<Record<string, string>>
}
```

It must never be directly exposed through the public API.

The implementation must use argument arrays rather than shell interpolation.

## Workspace

A Workspace owns temporary and intermediate artifacts for an operation.

Example:

```text
workspace/
  input/
  temp/
  output/
  manifest.json
```

Workspace responsibilities:

- allocate unique directories
- import input files
- allocate temporary paths
- register generated artifacts
- expose output artifacts
- cleanup after successful completion
- retain failed workspaces when configured for debugging

## Artifact

An Artifact is the result of an operation.

Initial artifact kinds:

- File
- Directory

Future kinds may include:

- Stream
- Collection
- StructuredData

Artifacts should carry:

- identifier
- name
- path
- MIME type where known
- size where known
- optional checksum

## Security boundary

Runtime capabilities must enforce configured filesystem roots.

A tool must not be able to escape its workspace or configured roots by constructing `../` paths or equivalent path tricks.
