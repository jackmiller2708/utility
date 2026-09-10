# Security Specification

## Threat model

Although this is a private personal application, assume an untrusted device may reach the server if LAN access is enabled.

Threats:

- unauthorized device
- replayed request
- path traversal
- malicious upload
- command injection
- accidental filesystem access
- stolen session

## Network

Default:

```text
127.0.0.1
```

LAN exposure is explicit.

When exposed over a network, HTTPS should be used directly or through a trusted reverse proxy.

## Device identity

Each trusted device has:

```text
deviceId
publicKey
name
createdAt
lastSeenAt
revoked
```

Private keys stay on the device.

## Request authentication

A request should prove possession of the private key.

Signed material should include:

- HTTP method
- path
- timestamp
- nonce
- body hash

Server checks:

- known device
- not revoked
- timestamp within allowed skew
- nonce not replayed
- signature valid

## Enrollment

Enrollment requires an explicit local action on the host.

Never trust arbitrary discovered devices automatically.

## Filesystem

Do not accept arbitrary filesystem paths from Angular.

Use:

```text
FileId → server metadata → validated path
```

## Process execution

No generic shell API.

Adapters own their command construction.

Use controlled executable paths/allowlists.

## Uploads

Uploaded files are untrusted.

Validate size, type, parser behavior, and output paths.

Each operation gets an isolated Workspace.
