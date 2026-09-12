import type { DeviceId } from "./brands.js";

export interface DeviceIdentity {
  readonly deviceId: DeviceId;
  readonly publicKey: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revoked: boolean;
  /** When this device was revoked, or `null` if it never was (or was revoked before this field existed). Drives the retention sweep that purges old revoked rows. */
  readonly revokedAt: string | null;
  /** False until an already-local (isLocal) operator approves it — an enrollment from `isLocal` itself is approved immediately, since there's no one else to ask. */
  readonly approved: boolean;
}
