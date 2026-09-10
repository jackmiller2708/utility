# API Specification

## Transport

Initial transport: HTTP.

WebSocket or Server-Sent Events may be added for job progress later.

## API principles

- JSON for structured requests/responses.
- Multipart upload for file input where appropriate.
- Typed schemas at the server boundary.
- Stable operation IDs.
- Structured errors.
- Artifact references instead of embedding large binary results in JSON.

## Example

```http
POST /api/v1/tools/image.resize
```

Request:

```text
multipart/form-data
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

Download:

```http
GET /api/v1/artifacts/:id
```

## Tool discovery

```http
GET /api/v1/tools
```

Returns the available tools and operation metadata.

This allows the web client to discover capabilities rather than hardcoding the entire server inventory.

## Versioning

All public endpoints start under:

```text
/api/v1
```

Operation IDs are independently stable.

Breaking protocol changes require a new API version.
