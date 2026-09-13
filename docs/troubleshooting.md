# Troubleshooting

Symptom-first runbook for this deployment (Angular SSR + NestJS API + Caddy,
Dockerized, optionally exposed via Tailscale Funnel — see
[local-network-testing-walkthrough.md](./local-network-testing-walkthrough.md)
and [tailscale-funnel-setup.md](./tailscale-funnel-setup.md)). For the
device-auth endpoints referenced throughout, see
[device-management-api.md](./device-management-api.md).

## Quick diagnostic commands

Run these first, in this order, before digging into a specific symptom below:

```
docker compose ps                                    # all three services Up/(healthy)?
docker inspect utility-caddy-1 --format '{{json .NetworkSettings.Ports}}'   # ports actually published?
hostname -I | awk '{print $1}'                        # this host's current LAN IP
cat .env                                              # LAN_IP as configured
tailscale status                                      # tailscale connected? Funnel on?
tailscale funnel status                               # what Funnel is proxying to
curl -sSk --resolve utility.home.arpa:443:$(hostname -I | awk '{print $1}') https://utility.home.arpa/api/v1/health
curl -sS https://<your-tailnet-hostname>/api/v1/health
```

If `docker inspect`'s ports output is `{}` for a container whose
`docker compose ps` shows `Up`, the container is running but nothing on the
host can reach it — jump to
[docker compose ps shows everything Up but nothing responds](#docker-compose-ps-shows-everything-up-but-nothing-responds).

## Server unreachable from LAN or the public Funnel URL (or both)

**Symptom:** `https://utility.home.arpa/` and/or the Tailscale Funnel URL
stop responding, with no config changes made.

**Likely cause: the host's LAN IP drifted.** `docker-compose.yml` binds
Caddy's ports to the LAN IP from `.env` explicitly
(`${LAN_IP}:80:80`, `${LAN_IP}:443:443` — see the comment on that block),
not `0.0.0.0`, so that Tailscale's own Funnel listener can keep port 443 on
the tailnet interface. If this host doesn't have a DHCP reservation (see
the self-hosting checklist's "Stable LAN IP configured" item), its address
can change on a lease renewal or reboot. When it does, `.env`'s `LAN_IP`
points at an address that no longer exists on any interface, Docker can't
bind **any** of Caddy's published ports to it — and because all of a
container's `ports:` entries are published together, this takes down the
unrelated loopback `127.0.0.1:8443` mapping too, which is what Tailscale
Funnel proxies into. **One stale `.env` value breaks LAN access and the
public Funnel URL at the same time**, even though `docker compose ps`,
`tailscale status`, and the container logs all look healthy.

**Diagnose:**

```
hostname -I | awk '{print $1}'      # actual current LAN IP
grep LAN_IP .env                    # what Caddy is bound to
docker inspect utility-caddy-1 --format '{{json .NetworkSettings.Ports}}'
```

If the two IPs differ, or the inspect output is `{}`, that's the cause.

**Fix:**

```
# edit .env, set LAN_IP to the address hostname -I just printed
docker compose up -d caddy          # recreates just Caddy, re-publishes ports
tailscale funnel status             # confirm Funnel is still proxying to 127.0.0.1:8443
curl -sS https://<your-tailnet-hostname>/api/v1/health
```

No Funnel command is needed after this — `tailscale funnel --bg 8443` only
needs re-running if Funnel itself was reset
(`tailscale funnel reset`), not after a Caddy restart.

**Permanent fix:** get a DHCP reservation for this host's MAC address on the
router so `LAN_IP` stops drifting. Until then, this is a "re-run the fix
above" situation whenever the address changes.

## `docker compose ps` shows everything `Up` but nothing responds

Docker requires every port in a container's `ports:` list to bind
successfully — if even one of them targets an IP no longer present on the
host, the container can end up running (Caddy itself boots fine internally
per `docker compose logs caddy`) with **zero** of its ports actually
published to the host. `docker compose ps`'s `Up` only means the process is
running, not that its ports are reachable.

```
docker inspect utility-caddy-1 --format '{{json .NetworkSettings.Ports}}'
```

`{}` confirms nothing is published. This is the same root cause as
[Server unreachable](#server-unreachable-from-lan-or-the-public-funnel-url-or-both)
above — check `LAN_IP` first.

## Caddyfile edits don't take effect, even after `caddy reload`

**Symptom:** you edit `Caddyfile` on the host, run
`docker exec utility-caddy-1 caddy reload --config /etc/caddy/Caddyfile`
(or just restart the container), and the running config still reflects the
*old* file — `docker exec utility-caddy-1 cat /etc/caddy/Caddyfile` shows
stale content that doesn't match what's on disk.

**Cause:** `docker-compose.yml` bind-mounts the single file
`./Caddyfile:/etc/caddy/Caddyfile:ro`. A bind mount of a single file is
pinned to that file's *inode*, not its path. Most editors (and this
codebase's own tooling) save by writing a new file and renaming it over the
original — an atomic write, but it also means the original inode the
container is mounted to becomes orphaned. The container keeps serving that
orphaned inode's content forever; every fresh `stat`/`cat`/`docker run` from
the host sees the current inode instead, which is why the mismatch is easy
to miss (a brand-new container mounting the same path sees the edit fine —
only the *already-running* one is stale). `caddy reload` re-reads
`/etc/caddy/Caddyfile` from inside the container's own mount namespace, so
it faithfully reloads the stale content and reports success.

**Diagnose:**

```
diff <(cat Caddyfile) <(docker exec utility-caddy-1 cat /etc/caddy/Caddyfile)
```

Any diff output confirms the mount is stale, not a syntax/logic problem
with the config itself.

**Fix:** recreate the container so Docker re-resolves the bind mount
against the current file — a `caddy reload` inside the container is not
enough:

```
docker compose up -d --force-recreate caddy
```

**How to apply:** after any `Caddyfile` edit, always
`docker compose up -d --force-recreate caddy`, even if `docker compose up -d`
or `caddy reload` reported success — neither one is sufficient on its own.

## Browser shows a certificate warning

Expected on a device that hasn't installed Caddy's local CA yet — Caddy's
`tls internal` directive (`Caddyfile`) issues certificates from its own
internal CA, not a public one, since there's no public domain for this
deployment. Walk through
[local-network-testing-walkthrough.md, step 5](./local-network-testing-walkthrough.md#5-trust-caddys-local-ca-on-the-other-device)
to extract and install it. Two things people forget:

- **Chrome/Linux only reads its per-user NSS database (`~/.pki/nssdb`) at
  launch.** Installing the CA with `certutil` while Chrome is already
  running does nothing until you fully quit and reopen it — not just a new
  tab or window.
- This only applies to the LAN hostname. The Tailscale Funnel URL gets a
  real, browser-trusted Let's Encrypt certificate from Tailscale's own
  infrastructure — if you're seeing a cert warning on the `*.ts.net` URL,
  that's a different, unrelated problem (check `tailscale funnel status`).

## Docker containers fail DNS lookups / builds hang on network calls

Seen on this machine because Cloudflare WARP makes the host's default
resolver unreachable from inside containers. Fixed once, at the host level,
by setting `/etc/docker/daemon.json` to `{"dns": ["1.1.1.1", "8.8.8.8"]}`
and restarting the Docker daemon
(`sudo systemctl restart docker`) — not a per-container or per-compose-file
setting. If this resurfaces (e.g. after a Docker reinstall), that's the fix.

## A device is stuck on "Waiting for approval" forever

This is expected, not broken, in the normal Docker/Caddy topology: **every
request is proxied through Caddy, so no browser session is ever `isLocal`**
— not even one physically at the server. The Devices page's Approve button
only works from a session the API sees as local, so in this topology it
never actually succeeds from the browser. Approve from a shell on the host
instead — see
[device-management-api.md#post-authdevicesidapprove](./device-management-api.md#post-authdevicesidapprove)
for the exact command. The waiting browser picks up the approval within a
few seconds on its own (it polls `/auth/status`), no reload needed.

If you *did* run the approve command and it's still stuck:

```
docker compose exec api node -e "fetch('http://localhost:3000/api/v1/auth/devices').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
```

Confirm the `deviceId` you approved matches what the waiting browser
actually holds — a mismatch here means the browser is polling on a
*different* row than the one you approved (see
[Same physical device shows up twice](#same-physical-device-shows-up-twice-in-the-devices-list) below).

## "Only the server operator can approve/delete a device"

`403` from `POST /auth/devices/:id/approve` or `.../delete` — both require
`isLocal` (see [device-management-api.md](./device-management-api.md#auth-model-in-one-paragraph)).
This is not self-service from any browser once Caddy fronts the app, by
design — run the command from a shell on the host itself, not from the
Devices page in a browser.

## Device stuck on "checking" or flips back to the enrollment form

If this happens on a device that had already asked to be trusted (or was
already pending), it should **not** ask you to re-enter a device name — as
of the idempotent-enrollment fix, an unconfirmed or pending enrollment is
recovered and silently resubmitted on reload. If you're seeing the name
form again for a device that already submitted one:

- Check connectivity first — the resume flow falls back to showing the
  form (pre-filled with the name you already typed, not blank) only when
  its own retry attempt fails, which usually means the server truly wasn't
  reachable at that moment.
- Confirm you're running the current frontend image — `docker compose
  build web && docker compose up -d web` if in doubt.
- A `GET /auth/status` failure is treated as "couldn't ask," never as "the
  server said no" — it should never by itself wipe a local device identity.
  If it does, that's a regression in `DeviceTrustService.ensureTrusted`
  (`apps/utility-web/src/app/core/services/device-trust.service.ts`), not
  expected behavior.

## Same physical device shows up twice in the Devices list

`POST /auth/enroll` dedupes by public key (see
[device-management-api.md](./device-management-api.md#post-authenroll)), so
two rows for what's really one browser means two *different* keypairs were
generated and sent — normally only possible if IndexedDB was cleared
between the two enrollments (private browsing, manually clearing site
data, a browser profile reset), since otherwise the same stored keypair is
always reused on retry. Revoke and delete the stale row (see
[device-management-api.md](./device-management-api.md#retention-and-purge));
the one the browser is actually polling on will still be there.

## Revoked devices piling up in the list

They purge themselves automatically 30 days after revocation (hourly
sweep, plus once at API startup) — no action needed if you're willing to
wait. To remove one immediately: Delete action on the Devices page (only
visible on an already-revoked row, and only from an `isLocal` session — see
[A device is stuck on "Waiting for approval" forever](#a-device-is-stuck-on-waiting-for-approval-forever)
above for why that means a shell on the host, not the browser, in this
topology), or the raw command in
[device-management-api.md](./device-management-api.md#post-authdevicesiddelete).
A device revoked before this feature existed shows no purge countdown —
its `revokedAt` is unknown, so the sweep leaves it alone; delete it
manually if you want it gone.
