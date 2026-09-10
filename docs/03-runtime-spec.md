# Runtime Specification

## FileSystem

Effect service providing:

- read
- write
- copy
- move
- remove
- exists
- stat
- createDirectory
- listDirectory

Client-provided paths must never directly reach this service.

## Process

Internal-only capability.

Conceptual input:

```ts
type Command = {
  executable: string
  args: readonly string[]
  cwd?: Path
  env?: Readonly<Record<string, string>>
}
```

Implementation must use process spawning with argument arrays.

Never construct shell strings from user input.

The Process capability is not exposed through the public API.

## Workspace

Every tool operation that creates files gets a Workspace.

Example:

```text
workspace/
  input/
  temp/
  output/
  manifest.json
```

Responsibilities:

- isolate operation files
- allocate temporary paths
- track artifacts
- cleanup
- optionally retain failed workspaces for debugging

## Artifact

Artifact represents an operation result.

Initial types:

- File
- Directory

Metadata:

- ID
- name
- path
- MIME type
- size
- optional checksum

Clients receive Artifact IDs, not arbitrary server filesystem paths.

## Runtime security

Workspace and configured storage roots must prevent traversal outside allowed directories.
