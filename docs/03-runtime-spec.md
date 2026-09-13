# Runtime Specification

## FileSystem & Path

`@effect/platform`'s `FileSystem` and `Path` services (Node-backed via `@effect/platform-node`'s `NodeFileSystem`/`NodePath` layers at the composition root) — not a hand-rolled wrapper. Provides `readFile`/`readFileString`, `writeFile`/`writeFileString`, `copyFile`, `rename`, `remove`, `exists`, `stat`, `makeDirectory`, `readDirectory`, and `Path`'s `join`/`resolve`/`parse`/`extname`/`basename`, among others.

Client-provided paths must never directly reach this service.

## Process

Internal-only capability. Built on `@effect/platform`'s `Command`/`CommandExecutor` (Node-backed via `NodeCommandExecutor`), not a raw `node:child_process` wrapper.

Conceptual input:

```ts
type Command = {
  executable: string
  args: readonly string[]
  cwd?: Path
  env?: Readonly<Record<string, string>>
  timeoutMs?: number
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
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
