# Public Exposure via Tailscale Funnel

Extends the [local-only stack](./local-network-testing-walkthrough.md) to be
reachable from the public internet, while keeping everything else (SSH,
direct API/SSR ports) LAN-only. Read the
[self-hosting checklist](./local-production-self-hosting-checklist.md) first —
this doc only covers the delta for going public.

## Why Tailscale Funnel, not router port forwarding

A network behind **CGNAT** (Carrier-Grade NAT) has a router whose own WAN IP
is a private (`10.x.x.x`) address, not the public IP the internet actually
sees — the ISP assigns a different, ordinary public IP in front of that
(either can change independently). That's the ISP doing its own NAT layer in
front of the router, which the router's admin UI has no visibility into or
control over: port-forwarding rules can be configured correctly and the
firewall opened, and nothing still reaches the router from outside, because
the router never holds a real public IP. A dynamic-DNS domain doesn't change
this — DNS just points at the same unreachable address. (`canyouseeme.org` is
a quick way to confirm whether a given network is affected.)

Tailscale Funnel sidesteps this entirely: the `tailscale` daemon on the host
makes an **outbound** connection to Tailscale's infrastructure, which is
CGNAT-proof by construction (no inbound connection to the network is ever
needed). Funnel then exposes a `https://<device>.<tailnet>.ts.net` URL backed
by that tunnel, with Tailscale terminating public HTTPS.

## How this is wired

- `Caddyfile` has a `:8443` block — plain HTTP, no hostname/TLS of its own,
  since Tailscale already terminates public HTTPS before traffic reaches it.
- `docker-compose.yml`: `caddy` publishes `127.0.0.1:8443:8443`
  (loopback-only — only the host's native `tailscale` process needs it).
- `CORS_ORIGINS` (api) / `NG_ALLOWED_HOSTS` (web) include `TAILSCALE_HOSTNAME`
  (from `.env`) alongside the LAN hostname.
- Tailscale itself runs **natively on the host**, not in Docker — it needs to
  reach Caddy's loopback-published port, which is simplest from the host
  network namespace directly rather than fighting Docker networking/TUN
  device passthrough for marginal benefit.

## 1. One-time Tailscale setup

- `tailscale` installed and authenticated (`tailscale status` shows the
  host connected, with its device name and tailnet IP).
- MagicDNS enabled tailnet-wide — this gives the host a full public hostname
  of the form `<device-name>.<tailnet-suffix>.ts.net` (`tailscale dns status`
  to check).
- HTTPS certificates and Funnel need to be enabled for the tailnet in the
  [admin console](https://login.tailscale.com/admin/dns) if not already —
  `tailscale funnel` will print a link to the exact settings page if
  something's missing when you try to enable it below.

## 2. Point Funnel at Caddy

```
docker compose up -d          # picks up the Caddyfile/compose config
tailscale funnel --bg 8443
tailscale funnel status
```

`status` confirms the public hostname (port 443) forwarding to
`http://127.0.0.1:8443`:

```
# Funnel on:
#     - https://<device-name>.<tailnet-suffix>.ts.net
https://<device-name>.<tailnet-suffix>.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:8443
```

`docker compose ps` should show all three services `Up`/`(healthy)`, with
`caddy` publishing `127.0.0.1:8443` alongside its LAN `80`/`443` bindings —
this is the steady-state config, not just a build-time check.

## 3. Verify

From a device on a **different network** (phone on cellular data, or any
non-LAN client):

```
curl -sS https://<device-name>.<tailnet-suffix>.ts.net/api/v1/health
```

should return `{"status":"ok"}` with a real, browser-trusted certificate
(Tailscale manages this automatically via Let's Encrypt on its own
infrastructure — no ACME config needed in this repo at all). Opening the same
URL in a browser should show the Angular app with the device-trust
enrollment card.

If instead you get a host-not-allowed error from Angular, or a CORS error in
the browser console, double check `TAILSCALE_HOSTNAME` in `.env` exactly
matches the hostname `tailscale funnel status` reports, then
`docker compose up -d` again to pick up the change.

## 4. Approving devices from the public hostname

Nothing changes here beyond what's already documented in the
[LAN walkthrough, step 7](./local-network-testing-walkthrough.md#7-trusting-a-device):
`isLocalRequest` only trusts direct loopback connections
(`apps/utility-api/src/auth/request-locality.ts`), so a Funnel request can't
reach that bypass. Approving a newly-enrolled device still means running the
`docker compose exec api ...` approval command from a shell on the host
itself, exactly as for a LAN-only enrollment.

## 5. Ongoing

- `tailscale funnel status` / `tailscale serve status` to check current
  routing.
- `tailscale funnel reset` removes all Funnel config from the host if you
  ever need to start over.
- Nothing here depends on the host's public IP at all — no dynamic-DNS
  updater needed. If the ISP-assigned IP changes, Funnel keeps working
  without any action.
- If the host's Tailscale hostname or tailnet suffix ever changes (e.g.
  re-authenticating fresh), update `TAILSCALE_HOSTNAME` in `.env` and rerun
  `docker compose up -d`.
