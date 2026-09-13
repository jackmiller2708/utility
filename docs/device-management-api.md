# Device Management API Reference

The complete, as-implemented reference for the `/auth/*` endpoints —
`apps/utility-api/src/auth/auth.controller.ts` is the source of truth this
tracks. For the *why* behind the design see
[07-security-spec.md](./07-security-spec.md); for walking through enrollment
and approval by hand see
[local-network-testing-walkthrough.md, step 7](./local-network-testing-walkthrough.md#7-trusting-a-device).

## Auth model in one paragraph

Each device holds an ECDSA P-256 keypair generated in-browser (private key
never leaves IndexedDB). A signed request carries four headers —
`x-device-id`, `x-timestamp`, `x-nonce`, `x-signature` — over the payload
`METHOD:path:timestamp:nonce:` (see `DeviceIdentityService.sign`,
`apps/utility-web/src/app/core/services/device-identity.service.ts`).
`DeviceAuthGuard` (`apps/utility-api/src/auth/device-auth.guard.ts`) verifies
the signature, rejects a timestamp more than 5 minutes off, and rejects a
reused nonce.

**`isLocal`** (`isLocalRequest`, `apps/utility-api/src/auth/request-locality.ts`)
means the request reached the API from its own loopback — physically at the
server, not proxied through Caddy. It's the one bar above "any trusted
device": approving a new device, deleting a device, and managing a device
that isn't your own all require it. **Once Caddy/Docker front everything
(the normal deployed topology), no browser session is ever `isLocal`** —
every request arrives from Caddy's container address, never `127.0.0.1`. The
walkthrough linked above has the `docker compose exec api node -e "fetch(...)"`
pattern for reaching the API directly when you need this bar.

## Device fields

Every device record (`DeviceResponse` in `packages/protocol/src/auth.ts`,
backed by `DeviceIdentity` in `packages/domain/src/device.ts`):

| Field | Type | Notes |
|---|---|---|
| `deviceId` | `string` | `dev_<16 hex chars>`, server-assigned |
| `name` | `string` | Operator- or self-chosen label |
| `publicKey` | `string` | PEM, SPKI |
| `createdAt` | `string` | ISO timestamp |
| `lastSeenAt` | `string` | ISO timestamp, updated on every verified signed request |
| `revoked` | `boolean` | |
| `revokedAt` | `string \| null` | ISO timestamp of revocation, or `null` if never revoked (or revoked before this field existed — see [Retention](#retention-and-purge) below) |
| `approved` | `boolean` | False until an operator (or `isLocal` self-enroll) approves it |

## Endpoints

### `GET /auth/status`

No auth required — this *is* the trust check. Reads `x-device-id` if
present (unsigned; just a lookup) and reports:

```json
{ "authenticated": true, "isLocal": false, "device": { "...": "DeviceResponse fields" } }
```

`authenticated` is `true` when `isLocal` or when the device is known,
approved, and not revoked. `device` is omitted if no `x-device-id` header
was sent or it doesn't match a known device. **Always returns 200** — "not
authenticated" is a normal response, not an error. (The frontend's
`DeviceTrustService` leans on this: a transport failure calling this
endpoint is never treated as "not trusted," only an actual `200` response
is — see [troubleshooting.md](./troubleshooting.md#device-stuck-on-checking-or-flips-back-to-the-enrollment-form).)

### `POST /auth/enroll`

Body: `{ "name": string, "publicKey": string }` (PEM). No auth required —
this is how a device gets *into* the system.

- From `isLocal`: auto-approved immediately.
- From anywhere else: created `approved: false` ("pending"), needs an
  operator to approve it.
- **Idempotent by public key**: re-enrolling with a `publicKey` that already
  matches a non-revoked device returns that *same* device record (same
  `deviceId`, `approved` state untouched) instead of creating a duplicate
  row. This is what lets a client safely retry an enroll it's not sure
  succeeded (see `DeviceAuthService.registerDevice`,
  `apps/utility-api/src/auth/device-auth.service.ts`). A revoked device
  doesn't count as a dedup match — enrolling with that key again starts a
  fresh pending row.

Response: a full `DeviceResponse`. `201` on both first-time creation and a
deduped repeat.

```
curl -sS -X POST https://<host>/api/v1/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"name":"my-device","publicKey":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}'
```

### `GET /auth/devices`

Guarded (signed request or `isLocal`). Returns the full device list —
every row, revoked and pending included. No pagination.

```
curl -sS <signed headers> https://<host>/api/v1/auth/devices
```

### `POST /auth/devices/:id/approve`

**`isLocal` only** — `403` otherwise. Marks a pending device `approved:
true`. Idempotent: calling it again on an already-approved device just
re-confirms `approved: true`, no error.

Response: `{ "deviceId": string, "approved": true }`. `404` if the id
doesn't exist.

```
docker compose exec api node -e "fetch('http://localhost:3000/api/v1/auth/devices/DEVICE_ID/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.text()).then(console.log)"
```

### `POST /auth/devices/:id/delete`

**`isLocal` only** — `403` otherwise. Permanently removes a device row.
**Only works on an already-revoked device** — `400 "Only a revoked device
can be deleted"` if it's still active, `404` if the id doesn't exist.
Revoke first (`DELETE /auth/devices/:id`, below), then delete.

Response: `{ "deviceId": string, "deleted": true }`.

```
docker compose exec api node -e "fetch('http://localhost:3000/api/v1/auth/devices/DEVICE_ID/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.text()).then(console.log)"
```

### `PATCH /auth/devices/:id`

Guarded (signed request or `isLocal`). Body: `{ "name": string }`. A device
may rename **itself** over a signed request; renaming any *other* device
requires `isLocal`. `403 "A device can only manage itself"` otherwise.

Response: device fields (name, keys, timestamps, `revoked` — notably not
`approved`, since renaming never touches it).

### `DELETE /auth/devices/:id` — this **revokes**, it does not delete

Guarded, same self-or-`isLocal` rule as `PATCH`. Sets `revoked: true` and
stamps `revokedAt` to now. The row stays in the registry (and in the
Devices page list) until it's actually removed — see below.

Response: `{ "deviceId": string, "revoked": true }`.

> The HTTP verb is `DELETE` but the effect is "revoke," not "remove." This
> is a historical naming wrinkle, not a bug — use
> `POST /auth/devices/:id/delete` (above) for an actual permanent removal,
> and only after this call has run.

## Retention and purge

`DeviceAuthService` runs an hourly sweep (plus once at startup) that
permanently deletes any device that's been revoked for more than **30
days** (`REVOKED_DEVICE_RETENTION_MS`, `apps/utility-api/src/auth/device-auth.service.ts`).
A device revoked before `revokedAt` existed has that field as `null` and is
left alone by the sweep rather than having an age guessed for it — delete
it manually (above) if you want it gone sooner.

The Devices page shows a live countdown ("REVOKED — PURGES IN N DAYS") on
each revoked row, computed from `revokedAt` client-side
(`DeviceTicketComponent.daysUntilPurge`,
`apps/utility-web/src/app/ui/molecules/device-ticket/device-ticket.component.ts`) —
purely a display; the server's sweep is the actual authority.

## Errors

| Status | When |
|---|---|
| `400` | Missing `name`/`publicKey` on enroll; missing `name` on rename; deleting a device that isn't revoked yet |
| `401` | `DeviceAuthGuard` rejected the request — invalid signature, or no signature and not `isLocal` |
| `403` | `approve`/`delete` from a non-`isLocal` request; rename/revoke targeting another device without `isLocal` |
| `404` | `deviceId` doesn't match any known device |
