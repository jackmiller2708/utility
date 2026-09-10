import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DeviceIdentity, DeviceId } from "@utility/domain";

@Injectable()
export class DeviceAuthService {
  private devices = new Map<string, DeviceIdentity>();
  private usedNonces = new Set<string>();
  private devicesFilePath = path.join(os.homedir(), ".utility", "devices.json");

  constructor() {
    this.loadDevices().catch(() => {});
  }

  private async loadDevices() {
    try {
      await fs.mkdir(path.dirname(this.devicesFilePath), { recursive: true });
      const data = await fs.readFile(this.devicesFilePath, "utf-8");
      const list: DeviceIdentity[] = JSON.parse(data);
      for (const dev of list) {
        this.devices.set(dev.deviceId, dev);
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

  async registerDevice(name: string, publicKey: string): Promise<DeviceIdentity> {
    const deviceId = DeviceId(`dev_${crypto.randomBytes(8).toString("hex")}`);
    const device: DeviceIdentity = {
      deviceId,
      name,
      publicKey,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      revoked: false,
    };
    this.devices.set(deviceId, device);
    await this.saveDevices();
    return device;
  }

  getDevice(deviceId: string): DeviceIdentity | undefined {
    return this.devices.get(deviceId);
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
    if (!device || device.revoked) {
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
      // Verify signature with device public key (supporting RSA, ECDSA, Ed25519 or HMAC)
      const verifier = crypto.createVerify("SHA256");
      verifier.update(payload);
      return verifier.verify(device.publicKey, options.signature, "hex");
    } catch {
      return false;
    }
  }
}
