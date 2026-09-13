# Job Specification

Use Jobs for operations that may exceed normal request latency.

Examples:

- large PDF rendering
- batch conversion
- FFmpeg transcoding
- large image batches

## Status

```ts
type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
```

## Job

Contains:

- ID
- operation ID
- status
- progress
- timestamps
- artifacts
- structured error

## First implementation

In-memory only.

Do not add a database until actual requirements justify it.

## Cancellation

Use Effect interruption for application-level cancellation and terminate child processes when necessary.
