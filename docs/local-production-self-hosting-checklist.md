# Local Production Self-Hosting Checklist

Scope: production-like Linux self-hosting environment tested only on the local network.
Excluded: public domain, public IP, public DNS, WAN port forwarding.

> Public exposure via Tailscale Funnel is now set up on top of this — see
> [tailscale-funnel-setup.md](./tailscale-funnel-setup.md). Router port
> forwarding was tried first and doesn't work on this network (ISP CGNAT —
> see that doc for how this was diagnosed). Everything below still applies;
> that doc only covers the delta.

Stack specifics that shape this checklist:

- No database. All server-side state lives on the filesystem under `~/.utility/`
  (`devices.json`, `workspaces/`, `artifacts/`). There is nothing to run as a
  separate "database service" — persistence means backing up/restoring that
  directory tree.
- No Redis/queue. Job state is held in-memory in the NestJS process
  (`apps/utility-api`), so **only one API instance may run at a time** — job
  state and the nonce-replay cache do not survive a restart or a second replica.
- Authentication is a custom device-keypair scheme (`DeviceAuthService`), not
  JWT/session cookies: each device registers a public key, then signs every
  request (`x-device-id`, `x-timestamp`, `x-nonce`, `x-signature`) and the
  server verifies the signature and rejects replays/stale timestamps (5-minute
  skew window). There are no server-side auth secrets to rotate today — only
  the device registry (`devices.json`, public keys only) to protect and back up.
- Angular is built with SSR enabled (`outputMode: "server"`, `apps/utility-web/src/server.ts`),
  so the frontend ships as a Node process (`server.mjs`), not a static asset
  bundle. Caddy reverse-proxies to it the same way it proxies to the API.
- File processing today covers Sharp (image) and Poppler (PDF); FFmpeg (media)
  is planned but not yet wired in.
- No Docker Compose file or Caddyfile exists in the repo yet — the items below
  are the build-out checklist for creating them, not a description of
  something already running.

## 1. Network

- [ ] Server connected to LAN
- [ ] Stable LAN IP configured (DHCP reservation or static IP)
- [ ] LAN subnet documented
- [ ] No WAN port forwarding
- [ ] UPnP disabled
- [ ] Router admin interface not exposed to WAN
- [ ] Server reachable from another LAN device

## 2. Linux / OS

- [ ] Linux installed and updated
- [ ] Normal administrative user created
- [ ] `sudo` configured
- [ ] Automatic security updates enabled
- [ ] Server timezone configured
- [ ] NTP time sync enabled (device-auth signatures reject requests outside a 5-minute clock skew)
- [ ] Disk space monitored (`~/.utility/artifacts` and `~/.utility/workspaces` grow with usage)

## 3. SSH Hardening

- [ ] SSH key authentication configured
- [ ] Key login tested successfully
- [ ] Root SSH login disabled
- [ ] Password SSH authentication disabled
- [ ] SSH restricted to LAN
- [ ] SSH logs reviewed
- [ ] Optional: fail2ban or equivalent configured

## 4. Firewall

- [ ] Default incoming policy is deny
- [ ] Outgoing traffic allowed as required
- [ ] SSH allowed only from LAN
- [ ] HTTP allowed only from LAN
- [ ] HTTPS allowed only from LAN if used
- [ ] NestJS API port (default 3000) NOT exposed beyond Caddy
- [ ] Angular SSR port NOT exposed beyond Caddy
- [ ] Docker-published ports reviewed

## 5. Docker

- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Compose configuration version-controlled
- [ ] Persistent volume mounted for `~/.utility` (devices.json, workspaces/, artifacts/)
- [ ] Restart policies configured
- [ ] Internal Docker networks configured
- [ ] Web (SSR) and API containers isolated on an internal network; only Caddy publishes ports
- [ ] Only a single API container/replica runs (in-memory job state and nonce cache do not tolerate multiple instances)
- [ ] Secrets kept outside Git
- [ ] `.env` / secret files excluded from Git

## 6. Frontend — Angular (SSR)

- [ ] Production build configured (`ng build`, `outputMode: server`)
- [ ] `ng build` succeeds
- [ ] Development server (`ng serve`) is NOT used in production
- [ ] Production environment configuration verified
- [ ] SSR Node process (`node dist/utility-web/server/server.mjs`) run under Docker/process manager, not `ng serve`
- [ ] Angular SSR process listens on the expected internal interface/port
- [ ] Restart policy configured for the SSR process
- [ ] SPA fallback/routing configured
- [ ] Browser caching strategy reviewed

## 7. Backend — NestJS

- [ ] Production build configured (`nest build`)
- [ ] Production startup command configured (`node dist/main`, not `nest start --watch`)
- [ ] Server binds to `127.0.0.1` (or an internal Docker network) and only Caddy is reachable from the LAN
- [ ] `PORT`/`HOST` environment variables reviewed for the target environment
- [ ] No debug/development mode
- [ ] `enableCors` origin allowlist updated for the LAN hostname (default source currently hardcodes `localhost:4200`/`127.0.0.1:4200`/`localhost:3000` for dev)
- [ ] Global request validation enabled
- [ ] Helmet/security headers configured
- [ ] Rate limiting configured
- [ ] Device registration flow reviewed (who is allowed to call `POST` to register a new device)
- [ ] Device-auth signature verification enforced on all non-public routes
- [ ] Timestamp/nonce replay protection reviewed (5-minute skew window, in-memory nonce cache capped at 10k)
- [ ] Device revocation tested (`revoked` flag in `devices.json`)
- [ ] Request/body size limits configured (multipart upload limits especially)
- [ ] Production error responses don't expose stack traces/secrets
- [ ] Health endpoint implemented
- [ ] Graceful shutdown configured (in-flight jobs/workspaces on SIGTERM)

## 8. Reverse Proxy — Caddy

- [ ] Caddy installed/containerized
- [ ] Only Caddy exposes web ports to the LAN
- [ ] `/` routes to the Angular SSR process
- [ ] `/api` routes to NestJS
- [ ] Access logs enabled
- [ ] Error logs enabled
- [ ] Request size limits reviewed (large file uploads/downloads through artifacts)
- [ ] Security headers configured
- [ ] Compression configured where appropriate
- [ ] Proxy timeout behavior reviewed (long-running jobs, large artifact downloads)

## 9. Local HTTPS (Optional)

Public TLS cannot be fully tested without a public domain/certificate, but local HTTPS can be tested.

- [ ] Local hostname configured
- [ ] Caddy local/internal CA configured if HTTPS testing is needed
- [ ] Local CA trusted on test devices
- [ ] HTTPS access verified
- [ ] HTTP → HTTPS redirect tested
- [ ] Secure cookies tested (if any cookies are introduced later)
- [ ] Mixed-content issues tested
- [ ] Service-worker/secure-context behavior tested if applicable

## 10. Local DNS / Hostname

- [ ] Local hostname selected, e.g. `utility.home.arpa`
- [ ] Local DNS configured on router or DNS server
- [ ] Hostname resolves from LAN devices
- [ ] Caddy configured for the local hostname
- [ ] Application works without directly exposing internal ports

## 11. State & Persistence (Filesystem-Based)

No database or cache service exists. All server state lives under `~/.utility/`
on the host (or in a mounted volume in Docker).

- [ ] `~/.utility/devices.json` (device registry: id, name, public key, revoked flag) persisted on a durable volume
- [ ] `~/.utility/workspaces/` (per-operation working directories) persisted on a durable volume
- [ ] `~/.utility/artifacts/` (generated output storage) persisted on a durable volume
- [ ] Directory permissions restricted to the service user
- [ ] Only a single API process/instance runs against a given `~/.utility` tree
- [ ] Known limitation documented: job state is in-memory only and is lost on API restart
- [ ] Known limitation documented: the nonce-replay cache resets on API restart (acceptable given the timestamp window, but worth knowing)
- [ ] Artifact/workspace retention policy decided (nothing currently prunes old workspaces/artifacts automatically)

## 12. File Processing / Workers

For Sharp (image) and Poppler (PDF) today; FFmpeg (media) once implemented:

- [ ] Processing isolated from the main API where practical
- [ ] File type validation
- [ ] File size limits
- [ ] Processing timeouts
- [ ] Temporary-file cleanup (workspace directories removed after job completion)
- [ ] Resource/CPU/memory limits
- [ ] Untrusted files never executed
- [ ] Worker/container permissions minimized
- [ ] Output directories controlled (artifacts stay under `~/.utility/artifacts`)
- [ ] Malicious/malformed input tested against Sharp/Poppler adapters

## 13. Secrets

There is no server-side secret material today (no JWT signing key, no DB
password, no API keys) — device private keys are generated and held on each
client device and never transmitted. This section covers what to protect now
and what to plan for as auth/secrets evolve.

- [ ] `devices.json` (public keys, not sensitive, but integrity matters) protected from unauthorized writes
- [ ] `.env` files (once introduced) excluded from Git
- [ ] Secret permissions restricted
- [ ] No secrets in Docker images
- [ ] No secrets in application logs (device IDs/signatures are not secret, but avoid logging full request signatures/nonces unnecessarily)
- [ ] Plan documented for introducing/rotating any future server-side secret (e.g. if session tokens or API keys are added)

## 14. Logging

- [ ] Host/system logs available
- [ ] SSH logs available
- [ ] Firewall logs available
- [ ] Caddy access logs available
- [ ] Caddy error logs available
- [ ] NestJS application logs available
- [ ] Angular SSR process logs available
- [ ] Log rotation configured
- [ ] Log retention defined
- [ ] Sensitive data excluded from logs (signatures, nonces, device IDs)
- [ ] Request/correlation IDs considered

## 15. Monitoring

- [ ] CPU monitored
- [ ] RAM monitored
- [ ] Disk usage monitored (`~/.utility/artifacts` and `workspaces/` can grow unbounded)
- [ ] Disk health monitored
- [ ] Network monitored
- [ ] Container health monitored
- [ ] Frontend (SSR) health checked
- [ ] API health checked
- [ ] Uptime monitoring configured
- [ ] Alerts tested

## 16. Backups

- [ ] `~/.utility/devices.json` backed up
- [ ] `~/.utility/artifacts/` backed up (or a policy decided that artifacts are disposable/regeneratable)
- [ ] `~/.utility/workspaces/` excluded from backups if considered ephemeral scratch space
- [ ] Application configuration backed up
- [ ] Caddy configuration backed up
- [ ] Docker Compose/configuration backed up
- [ ] Backup retention defined
- [ ] Backup destination is separate from live data
- [ ] Backup integrity verified
- [ ] Full restore of `~/.utility` tested
- [ ] Full restore procedure documented

## 17. Automatic Recovery

- [ ] Containers restart automatically
- [ ] Services start after server reboot
- [ ] `~/.utility` volume mounts correctly after reboot
- [ ] Caddy starts correctly after reboot
- [ ] Frontend (SSR) works after reboot
- [ ] API works after reboot
- [ ] Monitoring works after reboot
- [ ] Deliberate application crash tested
- [ ] Recovery after crash verified (and in-flight job loss is expected/acceptable given in-memory job state)

## 18. Dependency / Update Management

- [ ] OS update procedure documented
- [ ] Docker image update procedure documented
- [ ] Node/Angular dependency update procedure documented (npm workspaces: `packages/*`, `apps/*`)
- [ ] NestJS dependency update procedure documented
- [ ] Effect/adapter package updates coordinated across workspace packages
- [ ] Caddy update procedure documented
- [ ] Backups performed before risky updates
- [ ] Health checks performed after updates
- [ ] Rollback procedure documented

## 19. Production Configuration

- [ ] Production environment variables verified (`PORT`, `HOST`)
- [ ] Debug mode disabled
- [ ] Development tooling removed/disabled (`ng serve`, `nest start --watch`)
- [ ] CORS origin allowlist matches the LAN hostname, not the dev `localhost` origins
- [ ] Source maps policy decided
- [ ] Error handling verified
- [ ] Caching strategy verified
- [ ] Compression verified
- [ ] Timeouts configured
- [ ] Resource limits configured
- [ ] Application startup behavior verified

## 20. LAN Security Test

From another LAN device:

- [ ] Website accessible through local hostname/IP
- [ ] HTTPS works if configured
- [ ] Internal NestJS port is inaccessible
- [ ] Internal Angular SSR port is inaccessible
- [ ] Other internal service ports are inaccessible
- [ ] Only intended ports are reachable
- [ ] Unauthenticated/unsigned API requests are rejected
- [ ] Replayed requests (reused nonce/stale timestamp) are rejected
- [ ] Oversized requests are rejected
- [ ] Invalid input is rejected
- [ ] Rate limiting works
- [ ] Device signature verification works
- [ ] Revoked devices are rejected

## 21. Failure Tests

- [ ] Kill frontend (SSR) container
- [ ] Verify automatic recovery
- [ ] Kill backend container
- [ ] Verify automatic recovery
- [ ] Restart Caddy
- [ ] Verify website recovery
- [ ] Reboot server
- [ ] Verify complete stack recovery
- [ ] Fill/test disk-space alert safely
- [ ] Kill API process mid-job and confirm expected behavior (in-memory job state is lost; client-facing behavior documented)
- [ ] Test malformed file processing safely

## 22. Disaster Recovery

- [ ] Fresh Linux installation procedure documented
- [ ] Docker installation documented
- [ ] Repository can recreate the stack (`npm install`, `npm run build --workspaces`)
- [ ] `~/.utility` restoration procedure documented (devices.json, artifacts, workspaces)
- [ ] Caddy restoration procedure documented
- [ ] Full server rebuild tested from scratch

## 23. Final Local Production Gate

The environment is ready for eventual internet exposure only when:

- [ ] Application works through Caddy
- [ ] Internal ports are not exposed
- [ ] Firewall is restrictive
- [ ] SSH is hardened
- [ ] Device-auth signature verification and replay protection confirmed working
- [ ] `~/.utility` state is durable, permissioned, and backed up
- [ ] Backups work
- [ ] Restore works
- [ ] Services survive reboot
- [ ] Monitoring detects failures
- [ ] Logs are useful
- [ ] Security tests pass
- [ ] Failure tests pass
- [ ] Full rebuild has been tested
- [ ] Deployment procedure is documented

## Target Architecture

LAN device
    |
    | HTTP/HTTPS
    v
Caddy
    |
    +---- Angular (SSR Node process)
    |
    +---- NestJS API
              |
              +---- Effect application layer
              |
              +---- Sharp / Poppler adapters (FFmpeg planned)
              |
              +---- ~/.utility (devices.json, workspaces/, artifacts/)

Host-level exposure:
    SSH   -> LAN only
    HTTP  -> LAN only
    HTTPS -> LAN only (optional)

Internal-only:
    NestJS API
    Angular SSR process
    Sharp/Poppler/FFmpeg workers
    ~/.utility filesystem state (no database, no Redis/queue)

Not included:
    Public domain
    Public IP
    Public DNS
    WAN port forwarding
