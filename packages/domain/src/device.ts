import type { DeviceId } from "./brands.js";

export interface DeviceIdentity {
  readonly deviceId: DeviceId;
  readonly publicKey: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revoked: boolean;
}
