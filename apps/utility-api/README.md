# Utility API

NestJS API server for the Utility Platform — HTTP transport, multipart upload handling, device authentication, and the composition root for the Effect application layer (`@utility/runtime`, `@utility/toolkit`, and the `@utility/image`/`@utility/pdf`/`@utility/media` adapters).

See [../../docs](../../docs) for the full spec set, [../../docs/06-api-spec.md](../../docs/06-api-spec.md) and [../../docs/device-management-api.md](../../docs/device-management-api.md) for the HTTP API, and [../../docs/troubleshooting.md](../../docs/troubleshooting.md) for the deployed-stack runbook.

## Development

```bash
npm run start:dev     # watch mode
npm run start:prod     # production (node dist/main)
```

## Tests

```bash
npm run test           # unit
npm run test:e2e       # end-to-end
npm run test:cov       # coverage
```

## Build

```bash
npm run build           # nest build
```
