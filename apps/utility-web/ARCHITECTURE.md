# Angular Web Application Architecture & Principles

This document serves as the immutable architectural specification for `apps/utility-web`.

## Core Architectural Principles

1. **Atomic Design & Separation from Business Logic (`src/app/ui/`)**:
   - All presentation components are strictly decoupled from domain/business logic and APIs.
   - Organized strictly into Atomic tiers:
     - **Atoms (`ui/atoms`)**: Base interactive primitives (`button`, `badge`, `input`, `select`, `toggle`, `icon`, `spinner`). They accept pure inputs and emit pure outputs.
     - **Molecules (`ui/molecules`)**: Combinations of atoms with single UI responsibilities (`dropzone`, `telemetry-row`, `preset-buttons`, `file-summary-card`).
     - **Organisms (`ui/organisms`)**: Discrete UI sections composed of molecules and atoms (`header`, `sidebar`, `telemetry-deck`, `footer`).
     - **Templates / Layouts (`ui/templates`)**: Structural page scaffolds (`workbench-layout`).

2. **Modular Domain & Capability Routing (`src/app/modules/`)**:
   - Feature capabilities live under `app/modules/`.
   - Modules can be deeply nested when a group of logic forms a coherent functional unit (e.g., `modules/media/image-resize`).
   - Every module contains its own:
     - `services/`: Feature-specific orchestration and transformation state services.
     - `components/`: Smart page components and feature-specific dumb containers.
     - `*.routes.ts`: Standalone route declarations lazy-loaded from parent modules or `app.routes.ts`.

3. **Core & Domain Separation (`src/app/core/` & `src/app/domain/`)**:
   - **`domain/`**: Pure data contracts, models, value objects, and protocol mappers (`artifact.model.ts`, `tool.model.ts`, `auth.model.ts`).
   - **`core/`**: Angular infrastructure and runtime singletons (`api-client.service.ts`, `runtime-status.service.ts`, configuration injection tokens, interceptors, error handling).

4. **Separation of Template and TypeScript Concerns**:
   - Every component MUST have its template in a dedicated `.html` file (`templateUrl: './...component.html'`).
   - No inline HTML strings in `.ts` files. This ensures mental separation of concerns, syntax highlighting, and maintainability.

5. **DTO → Domain Model Adaptation**:
   - A response type from `@utility/protocol` (parsed JSON DTO) is never consumed directly by feature-module logic.
   - On first use, it is adapted into its corresponding `domain/models/*` class/interface via an adaptor implementing `From<Source, Target>` from `@utility/adapter` (mirroring Rust's `From<T>`/`Into<T>`).
   - The adaptor is defined alongside the domain model it targets, in `domain/models/`, since `domain/` here already depends on `@utility/protocol` for its mappers.
