# Project Source of Truth

## Product

Utility Platform is a private personal utility server with an Angular web client. It centralizes repetitive file and media workflows behind simple typed operations.

## Architecture principle

Tools express user intent. Runtime capabilities perform system operations.

The public API must not expose shell commands or implementation-specific command construction.

## Stack

### Frontend

Angular web application.

Responsibilities:
- file selection/upload
- tool discovery
- operation forms
- progress/results
- artifact download
- device enrollment UX

The frontend must not contain OS-specific logic.

### Backend

NestJS application.

Responsibilities:
- HTTP transport
- multipart upload handling
- device authentication
- API validation/serialization
- tool discovery
- job lifecycle
- composition root

NestJS is the application shell, not the location of business/tool logic.

### Application layer

Effect.

Responsibilities:
- typed services
- dependency composition
- domain errors
- concurrency
- cancellation
- schema-driven contracts
- tool orchestration

### Native/tool adapters

- Sharp
- Poppler utilities / Ghostscript
- FFmpeg

## Package boundaries

- domain: pure concepts
- adapter: conversion traits (`From<Source, Target>` / `Into<Target>`) for adapting DTOs into domain models
- runtime: Effect services for system capabilities
- protocol: transport-facing schemas
- toolkit: tool definitions and registry
- image: image operations and Sharp adapter
- pdf: PDF operations and Poppler adapter
- media: FFmpeg adapter

## Rules

1. Domain code must not depend on NestJS or Node APIs.
2. Tool APIs must not expose shell commands.
3. Runtime capabilities are injected through Effect.
4. NestJS controllers adapt HTTP requests into Effect programs.
5. NestJS providers may own application infrastructure, but core tool logic remains framework-independent.
6. Filesystem paths from clients are never trusted directly.
7. Every operation runs inside a managed Workspace.
8. Generated outputs are represented as Artifacts.
9. Arbitrary process execution is never exposed to the browser.
10. Device authentication is required for non-local access.
11. Server binds to localhost by default.
12. API contracts are schema-first.
13. Long-running work uses Jobs rather than blocking HTTP requests.
14. A parsed DTO is never consumed directly by domain logic. On first use, it is adapted into its corresponding domain model via a `From<Source, Target>` adaptor (`@utility/adapter`) — mirroring Rust's `From<T>`/`Into<T>`. The adaptor is defined alongside whichever type already owns the dependency toward the other (normally alongside the DTO in `protocol`, since `domain` stays dependency-free; a module that colocates its own domain models with protocol-aware code, like the web client's local `domain/`, defines it alongside the domain model instead).
