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

## Monorepo

```text
utility-platform/
├── apps/
│   ├── api/
│   └── web/
│
├── packages/
│   ├── domain/
│   ├── runtime/
│   ├── protocol/
│   ├── toolkit/
│   ├── image/
│   └── pdf/
│
└── package.json
```
