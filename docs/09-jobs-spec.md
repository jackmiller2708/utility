# Job Specification

Some operations will be too expensive for a single synchronous HTTP request.

Examples:

- large PDF rendering
- video transcoding
- batch image conversion

## Job model

```ts
type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
```

A Job contains:

- ID
- operation ID
- status
- progress
- created time
- started time
- completed time
- result artifacts
- structured error

## Initial implementation

Do not add persistent job storage yet.

Use in-memory job state for the first version.

Design the API so persistent storage can be introduced later without changing operation contracts.

## Cancellation

Runtime operations should eventually support cancellation through Effect interruption and process termination.
