# Architecture

## System

```text
+-----------------------------+
|        Angular Web          |
|                             |
| Tool discovery              |
| Upload / forms              |
| Job progress                |
| Artifact download           |
+--------------+--------------+
               |
               | HTTP
               v
+-----------------------------+
|          NestJS             |
|                             |
| Controllers                 |
| Device Auth                 |
| API validation              |
| Tool discovery              |
| Job management              |
+--------------+--------------+
               |
               v
+-----------------------------+
|       Effect Application    |
|                             |
| Tool Registry               |
| Tool operations             |
| Services / Layers           |
| Domain errors               |
| Orchestration               |
+--------------+--------------+
               |
       +-------+-------+
       |       |       |
       v       v       v
      FS   Workspace Process
       |       |       |
       +-------+-------+
               |
               v
          Native adapters
        Sharp / Poppler / FFmpeg
               |
               v
             Linux
```

## NestJS role

NestJS owns transport and application lifecycle.

Controllers should be thin.

Conceptually:

```ts
@Post("image.resize")
resize(...) {
  return this.effectRuntime.runPromise(
    Image.resize(...)
  )
}
```

The controller should not contain image-processing logic.

## Effect role

Effect owns:
- services
- dependency injection through Layers
- error channels
- orchestration
- concurrency
- interruption/cancellation

NestJS DI and Effect DI solve different problems.

NestJS DI wires the application shell.

Effect Layers wire the capability graph used by tool programs.

## Dependency direction

```text
Angular
   ↓
protocol
   ↓
NestJS transport
   ↓
toolkit
   ↓
tool packages
   ↓
runtime
   ↓
native adapters
   ↓
Linux
```

Pure domain types can be shared without importing infrastructure.

## DTO → domain adaptation

A DTO decoded off the wire (protocol schema output) is never consumed directly by domain logic. On first use it is adapted into its corresponding domain model, via an adaptor implementing `From<Source, Target>` from `@utility/adapter` — mirroring Rust's `From<T>` / `Into<T>`.

`domain` stays a zero-dependency package, so the adaptor cannot live there without creating a cycle (`protocol` already depends on `domain`). It is instead defined alongside the DTO, in whichever package already owns the `Source` type and is therefore already permitted to depend on `domain` — normally `protocol` itself:

```ts
// packages/protocol/src/artifact.ts
import type { From } from "@utility/adapter";
import type { Artifact } from "@utility/domain";

export const ArtifactSchema = Schema.Struct({ /* ... */ });
export type ArtifactResponse = typeof ArtifactSchema.Type;

export const ArtifactFromResponse: From<ArtifactResponse, Artifact> = {
  from: (dto) => ({ id: ArtifactId(dto.id), name: dto.name /* ... */ }),
};
```

A frontend module that keeps its own local domain models (e.g. `apps/utility-web/src/app/domain/`) already depends on `@utility/protocol` directly, so there the adaptor can sit next to the domain model class itself, as originally intended.

Callers decode the DTO (Effect Schema), then adapt before running any domain logic — never branch on raw parsed JSON shape.

## Monorepo

```text
utility-platform/
├── apps/
│   ├── api/
│   └── web/
│
├── packages/
│   ├── domain/
│   ├── adapter/
│   ├── runtime/
│   ├── protocol/
│   ├── toolkit/
│   ├── image/
│   └── pdf/
│
└── package.json
```
