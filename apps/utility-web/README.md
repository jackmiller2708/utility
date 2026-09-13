# Utility Web

Angular 22 (SSR) web client for the Utility Platform — the reactive workbench for image, PDF, and video/audio tools, recipes, jobs, and device management served by `apps/utility-api`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the frontend's structural conventions, [DESIGN.md](./DESIGN.md) for the design system, and [PRODUCT.md](./PRODUCT.md) for product scope.

## Development

```bash
ng serve
```

Open `http://localhost:4200/` — reloads automatically on source changes.

## Build

```bash
ng build
```

Production output (Angular SSR: a `server.mjs` Node process plus browser bundles) goes to `dist/`.

## Tests

```bash
ng test
```
