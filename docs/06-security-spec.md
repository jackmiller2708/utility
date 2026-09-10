# Security Specification

## Threat model

The application is private, but a private network is not treated as trusted.

Threats include:

- another device reaching the server
- stolen browser session
- replayed requests
- malicious file paths
- malicious uploaded files
- command injection
- accidental access outside configured roots

## Network

Default:

```text
bind = 127.0.0.1
```

LAN access must be explicitly enabled.

If exposed to LAN, HTTPS should be supported or the application should be deployed behind a trusted TLS reverse proxy.

## Device identity

Each authorized device has:

- device ID
- public key
- human-readable device name
- creation time
- last-seen time
- revoked state

Private keys remain on the device.

The server stores public keys only.

## Request authentication

Requests should prove possession of the device private key.

Signed request material should include at minimum:

- HTTP method
- path
- timestamp
- nonce
- body hash

The server verifies:

- known device
- not revoked
- timestamp within allowed clock skew
- nonce not previously used
- signature valid

## Enrollment

Initial enrollment should require an explicit local action on the host.

Do not implement automatic trust of any device that discovers the server.

## Filesystem

Never allow client-provided paths to directly control filesystem access.

Use:

```text
FileId → server-owned metadata → validated filesystem path
```

rather than:

```text
client path string → fs.readFile()
```

## Process execution

Never execute shell strings.

Use:

```ts
spawn(executable, args)
```

with controlled executable allowlists per adapter.

The browser must never receive a generic process-execution operation.

## Uploaded files

Treat uploads as untrusted input.

Tools must validate:

- file type
- file size
- parser behavior
- output paths

Temporary files must be isolated per workspace.
