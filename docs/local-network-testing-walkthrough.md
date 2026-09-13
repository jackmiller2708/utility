# Testing the LAN Deployment

Walkthrough for starting the Dockerized stack (Angular SSR + NestJS API + Caddy)
and testing it from this machine and from another device on your LAN.

## 0. One-time host setup (already done on this machine)

These were already applied while setting this up and shouldn't need repeating:

- `jackmiller` added to the `docker` group (`sudo usermod -aG docker $USER`) —
  open a **new terminal** (or log out/in) so `docker`/`docker compose` work
  without `sudo`. If a command below says "permission denied" on the docker
  socket, your current shell predates the group change; open a fresh one.
- `/etc/docker/daemon.json` set to `{"dns": ["1.1.1.1", "8.8.8.8"]}` and the
  Docker daemon restarted — needed on this machine because Cloudflare WARP
  makes the host's default resolver unreachable from inside containers.
- The native `caddy` systemd service disabled (`sudo systemctl disable --now caddy`)
  so the Dockerized Caddy can bind ports 80/443.

## 1. Start the stack

From the repo root:

```
docker compose build
docker compose up -d
docker compose ps
```

All three services (`api`, `web`, `caddy`) should show `Up`, with `api` and
`web` eventually reporting `(healthy)` (health checks start ~10s after boot).

To watch logs while testing: `docker compose logs -f` (or `-f api` / `-f web` / `-f caddy`).

## 2. Verify from this machine

No DNS setup needed yet — use curl's `--resolve` to point the LAN hostname at
`127.0.0.1` for a local check (`-k` accepts Caddy's local CA cert without
installing it):

```
curl -k --resolve utility.home.arpa:443:127.0.0.1 https://utility.home.arpa/api/v1/health
# -> {"status":"ok"}

curl -kL --resolve utility.home.arpa:443:127.0.0.1 https://utility.home.arpa/ | head -20
# -> should show rendered HTML with a <title>, not an empty <app-root></app-root>
```

Or just open `https://utility.home.arpa/` in a browser **on this machine**
after adding a hosts-file entry (see step 4) — same trust-CA caveat applies
locally too, since Caddy fronts everything now (there is no more "just open
localhost:4200" path once the stack is Dockerized).

## 3. Find this machine's LAN IP

```
hostname -I | awk '{print $1}'
```

On this machine that's currently `192.168.1.29` — yours may differ, and can
change if using DHCP without a reservation (see checklist item "Stable LAN IP
configured").

## 4. Make the hostname resolve from another LAN device

Pick one:

- **Quick/per-device**: on the other device, add a hosts-file entry mapping
  the server's LAN IP to `utility.home.arpa`:
  - Linux/macOS: add `192.168.1.29  utility.home.arpa` to `/etc/hosts` (sudo required)
  - Windows: same line in `C:\Windows\System32\drivers\etc\hosts` (as Administrator)
  - iOS/Android: no native hosts-file editing without extra apps — use the
    router option below, or browse by IP and accept the cert-name mismatch
    warning (not recommended beyond a quick check)
- **Whole-LAN**: add a local DNS entry on your router (or a Pi-hole/dnsmasq
  instance if you run one) mapping `utility.home.arpa` to the server's LAN IP,
  so every device resolves it without per-device edits.

## 5. Trust Caddy's local CA on the other device

Caddy's internal certificate authority is what makes HTTPS work without a
public domain. Extract its root certificate:

```
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-local-ca.crt
```

Copy `caddy-local-ca.crt` to the other device and install it as a trusted
root CA (varies by OS: Keychain Access on macOS, Certificate Manager on
Windows, Settings → Security → Encryption & credentials on Android, or
Settings → General → VPN & Device Management → install profile then enable
full trust under About → Certificate Trust Settings on iOS). Without this
step, browsers will show a certificate-warning page — you can click through
it for a quick test, but installing the CA is what makes the padlock go green
like a normal site.

**On Linux, Chrome reads a per-user NSS database it does not need sudo for**
(`~/.pki/nssdb`), which is faster than a full OS-level install for testing:

```
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Caddy Local Authority" -i caddy-local-ca.crt
```

(needs `certutil` — `sudo apt install libnss3-tools` if missing). **Chrome
only reads this database at launch and caches it** — a tab you already had
open, or even a brand-new tab in an already-running Chrome, will keep
showing the certificate error until you fully quit and reopen the browser
(not just open a new window/tab).

## 6. Open it from the other device

`https://utility.home.arpa/` should now load the Angular app with a valid
(or click-through) HTTPS connection — and, the first time this particular
browser visits, a **"Trust this device"** card covering the whole screen
before anything else loads.

## 7. Trusting a device

The frontend now has a real enrollment flow (it didn't when this doc was
first written) — no more hand-signing requests just to get past the gate:

1. **Name it and submit.** The browser generates a keypair itself (stays in
   IndexedDB, never leaves the browser) and asks the server to trust it.
2. **What happens next depends on how the request reached the server.** An
   enrollment that reaches the API directly on its own loopback (`isLocal` —
   see below) is trusted immediately. Every other enrollment — which, once
   Caddy is in front of everything, is *all* of them, even a browser open on
   the server's own machine — lands **pending**: the card switches to
   "Waiting for approval" and polls on its own every few seconds. Nothing
   this device does will succeed against the API until an operator approves
   it.
3. **Approve it.** Only an `isLocal` request can approve a pending device
   (`AuthController.approveDevice`, `apps/utility-api/src/auth/auth.controller.ts`)
   — the same bar as managing any device that isn't your own. The Devices
   page (`/devices`) has an **Approve** button for exactly this, but it only
   *works* from a session the API itself sees as local — and in this
   Docker/Caddy topology, **no browser session ever is**: every request,
   even one physically at the server, is proxied through Caddy first and
   arrives at the `api` container from Caddy's own container address, never
   from `127.0.0.1`. So today, approving a device means reaching the API
   directly, bypassing Caddy — from a shell on the host:

   ```
   docker compose exec api node -e "fetch('http://localhost:3000/api/v1/auth/devices/DEVICE_ID/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.text()).then(console.log)"
   
   ```
   Find `DEVICE_ID` from the Devices page (it's visible in the UI even
   though the Approve *button* there won't succeed) or:

   ```
   docker compose exec api node -e "fetch('http://localhost:3000/api/v1/auth/devices').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
   ```
   
   The waiting browser picks up the approval within a few seconds on its
   own — no reload needed.
4. **After that, it's self-service.** A device can rename or revoke
   *itself* freely, but not any other device — same `isLocal`-only rule
   applies to managing someone else's device as to approving a new one.

### Optional: exercise the API directly, without a browser

Useful for scripted checks. The signing scheme is ECDSA P-256 over
`METHOD:path:timestamp:nonce:` (hex-encoded, `ieee-p1363` format — see
`DeviceIdentityService.sign`, `apps/utility-web/src/app/core/services/device-identity.service.ts`,
and `DeviceAuthService.verifySignature`, `apps/utility-api/src/auth/device-auth.service.ts`):

```js
// verify-device-auth.mjs
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = "https://utility.home.arpa";
const RESOLVE = "utility.home.arpa:443:127.0.0.1"; // change target IP if running from another device

function curl(args) {
  const out = execFileSync("curl", ["-sk", "--resolve", RESOLVE, "-w", "\n__STATUS__%{http_code}", ...args], { encoding: "utf-8" });
  const i = out.lastIndexOf("__STATUS__");
  return { body: out.slice(0, i).trim(), status: out.slice(i + 10).trim() };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const enroll = curl(["-X", "POST", `${BASE}/api/v1/auth/enroll`, "-H", "Content-Type: application/json",
  "-d", JSON.stringify({ name: "my-test-device", publicKey })]);
const device = JSON.parse(enroll.body);
console.log("enrolled:", device.deviceId, "approved:", device.approved);
// If approved is false, approve it first — see step 3 above — then re-run
// the signed call below with the same deviceId/privateKey.

function sign(method, path) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${method}:${path}:${timestamp}:${nonce}:`;
  const signature = crypto.sign("SHA256", Buffer.from(payload), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
  return { timestamp, nonce, signature };
}

const path = "/api/v1/tools";
const { timestamp, nonce, signature } = sign("GET", path);
const result = curl([`${BASE}${path}`,
  "-H", `x-device-id: ${device.deviceId}`, "-H", `x-timestamp: ${timestamp}`,
  "-H", `x-nonce: ${nonce}`, "-H", `x-signature: ${signature}`]);
console.log(result.status, result.body.slice(0, 300));
```

```
node verify-device-auth.mjs
```

A `200` with a JSON tool list confirms the whole chain (Caddy → API →
device-auth → `~/.utility`) works end to end.

## 8. Stopping / rebuilding

```
docker compose down            # stop and remove containers (state volume survives)
docker compose build           # rebuild after code changes
docker compose up -d           # apply
docker compose logs -f api     # tail one service's logs
```

`~/.utility` (devices, workspaces, artifacts) lives in the `utility-state`
named volume and survives `down`/`up`. `docker compose down -v` would delete
it — don't run that unless you mean to wipe all state.
