import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DeviceIdentity, DeviceId } from "@utility/domain";

/** How long a revoked device sticks around before the sweep purges it for good. */
const REVOKED_DEVICE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** How often the sweep runs — hourly is frequent enough for a 30-day window without adding a real scheduler dependency. */
const PURGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class DeviceAuthService implements OnModuleInit, OnModuleDestroy {
  private devices = new Map<string, DeviceIdentity>();
  private usedNonces = new Set<string>();
  private devicesFilePath = path.join(os.homedir(), ".utility", "devices.json");
  private ready: Promise<void>;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.ready = this.loadDevices().catch(() => {});
  }

  onModuleInit(): void {
    // Run once at startup (after devices have loaded) so a long-idle
    // deployment doesn't wait a full sweep interval to catch up, then keep
    // sweeping periodically for as long as the process runs.
    this.ready.then(() => this.purgeExpiredDevices()).catch(() => {});
    this.purgeTimer = setInterval(() => {
      this.purgeExpiredDevices().catch(() => {});
    }, PURGE_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }

  private async loadDevices() {
    try {
      await fs.mkdir(path.dirname(this.devicesFilePath), { recursive: true });
      const data = await fs.readFile(this.devicesFilePath, "utf-8");
      const list: DeviceIdentity[] = JSON.parse(data);
      for (const dev of list) {
        // Devices persisted before approval-gating/revokedAt existed are
        // missing those fields: default a missing `approved` to true (they
        // were already fully trusted) and a missing `revokedAt` to `null`
        // (we don't know when they were revoked, so the retention sweep
        // leaves them alone rather than guessing an age).
        this.devices.set(dev.deviceId, { ...dev, approved: dev.approved ?? true, revokedAt: dev.revokedAt ?? null });
      }
    } catch {
      // no existing devices file yet
    }
  }

  private async saveDevices() {
    try {
      await fs.mkdir(path.dirname(this.devicesFilePath), { recursive: true });
      await fs.writeFile(
        this.devicesFilePath,
        JSON.stringify(Array.from(this.devices.values()), null, 2),
        "utf-8"
      );
    } catch {
      // ignore
    }
  }

  async registerDevice(name: string, publicKey: string, approved: boolean): Promise<DeviceIdentity> {
    // Idempotent by public key: a retried enroll (network retry, or a
    // client that lost track of its assigned deviceId and re-submitted the
    // same keypair) resumes the existing row instead of minting a second
    // one that the operator would have to notice and approve separately.
    // A revoked device doesn't count as "existing" — that key is dead and a
    // fresh enroll with it should start a new pending row like any other.
    const existing = Array.from(this.devices.values()).find(
      (device) => device.publicKey === publicKey && !device.revoked
    );
    if (existing) {
      return existing;
    }

    const deviceId = DeviceId(`dev_${crypto.randomBytes(8).toString("hex")}`);
    const device: DeviceIdentity = {
      deviceId,
      name,
      publicKey,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      revoked: false,
      revokedAt: null,
      approved,
    };
    this.devices.set(deviceId, device);
    await this.saveDevices();
    return device;
  }

  async approveDevice(deviceId: string): Promise<DeviceIdentity | undefined> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return undefined;
    }
    const updated: DeviceIdentity = { ...device, approved: true };
    this.devices.set(deviceId, updated);
    await this.saveDevices();
    return updated;
  }

  getDevice(deviceId: string): DeviceIdentity | undefined {
    return this.devices.get(deviceId);
  }

  async renameDevice(deviceId: string, name: string): Promise<DeviceIdentity | undefined> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return undefined;
    }
    const updated: DeviceIdentity = { ...device, name };
    this.devices.set(deviceId, updated);
    await this.saveDevices();
    return updated;
  }

  async revokeDevice(deviceId: string): Promise<DeviceIdentity | undefined> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return undefined;
    }
    const updated: DeviceIdentity = { ...device, revoked: true, revokedAt: new Date().toISOString() };
    this.devices.set(deviceId, updated);
    await this.saveDevices();
    return updated;
  }

  /**
   * Permanently removes a device row — only ever a revoked one, so this
   * can't be used to erase an active device's record. Callers distinguish
   * "not found" from "not revoked yet" to give the right error.
   */
  async deleteDevice(deviceId: string): Promise<"deleted" | "not-found" | "not-revoked"> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return "not-found";
    }
    if (!device.revoked) {
      return "not-revoked";
    }
    this.devices.delete(deviceId);
    await this.saveDevices();
    return "deleted";
  }

  /** Purges revoked devices past the retention window. Returns the number removed. */
  async purgeExpiredDevices(retentionMs: number = REVOKED_DEVICE_RETENTION_MS): Promise<number> {
    const now = Date.now();
    let purged = 0;
    for (const device of this.devices.values()) {
      if (device.revoked && device.revokedAt && now - Date.parse(device.revokedAt) > retentionMs) {
        this.devices.delete(device.deviceId);
        purged++;
      }
    }
    if (purged > 0) {
      await this.saveDevices();
    }
    return purged;
  }

  listDevices(): readonly DeviceIdentity[] {
    return Array.from(this.devices.values());
  }

  verifySignature(options: {
    deviceId: string;
    timestamp: string;
    nonce: string;
    method: string;
    path: string;
    signature: string;
    bodyHash?: string;
  }): boolean {
    const device = this.devices.get(options.deviceId);
    if (!device || device.revoked || !device.approved) {
      return false;
    }

    // Check timestamp skew (5 minutes)
    const reqTime = parseInt(options.timestamp, 10);
    const now = Date.now();
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
      return false;
    }

    // Check nonce replay
    if (this.usedNonces.has(options.nonce)) {
      return false;
    }
    this.usedNonces.add(options.nonce);
    if (this.usedNonces.size > 10000) {
      this.usedNonces.clear();
    }

    // Update last seen
    this.devices.set(device.deviceId, {
      ...device,
      lastSeenAt: new Date().toISOString(),
    });

    const payload = `${options.method.toUpperCase()}:${options.path}:${options.timestamp}:${options.nonce}:${options.bodyHash || ""}`;

    try {
      // Verify signature with device public key (supporting RSA, ECDSA, Ed25519 or HMAC).
      // dsaEncoding: "ieee-p1363" matches the raw r||s format WebCrypto's
      // `crypto.subtle.sign({ name: "ECDSA" }, ...)` produces in the browser
      // client, rather than the DER-encoded ASN.1 sequence Node defaults to;
      // it's ignored (harmless) for non-EC keys, so this stays one call for
      // every supported key type.
      const verifier = crypto.createVerify("SHA256");
      verifier.update(payload);
      return verifier.verify({ key: device.publicKey, dsaEncoding: "ieee-p1363" }, options.signature, "hex");
    } catch {
      return false;
    }
  }
}
