# API Specification

## Base path

```text
/api/v1
```

## Tool discovery

```http
GET /api/v1/tools
```

Returns available tools and operations.

## Image resize

```http
POST /api/v1/tools/image.resize
```

Input initially uses multipart form data:

```text
file=<image>
width=1920
height=1080
fit=inside
```

Response:

```json
{
  "artifact": {
    "id": "artifact_...",
    "name": "image.webp",
    "mimeType": "image/webp",
    "size": 182734
  }
}
```

## Artifact

```http
GET /api/v1/artifacts/:id
```

The server validates that the artifact belongs to an accessible workspace/session before returning it.

## Jobs

Asynchronous execution for any registered operation:

```text
POST   /api/v1/jobs/:operationId
GET    /api/v1/jobs
GET    /api/v1/jobs/:id
DELETE /api/v1/jobs/:id   # cancels a running job
```

## NestJS

Use controllers as transport adapters.

Validation should be driven by protocol schemas rather than duplicating business validation in controllers.

## API evolution

Keep the HTTP API versioned independently from tool operation IDs.
