import { Schema } from "effect";

export const DeviceRegisterRequestSchema = Schema.Struct({
  name: Schema.String,
  publicKey: Schema.String,
});

export type DeviceRegisterRequest = typeof DeviceRegisterRequestSchema.Type;

export const DeviceResponseSchema = Schema.Struct({
  deviceId: Schema.String,
  name: Schema.String,
  publicKey: Schema.String,
  createdAt: Schema.String,
  lastSeenAt: Schema.String,
  revoked: Schema.Boolean,
  revokedAt: Schema.NullOr(Schema.String),
  approved: Schema.Boolean,
});

export type DeviceResponse = typeof DeviceResponseSchema.Type;

export const AuthStatusResponseSchema = Schema.Struct({
  authenticated: Schema.Boolean,
  isLocal: Schema.Boolean,
  device: Schema.optional(DeviceResponseSchema),
});

export type AuthStatusResponse = typeof AuthStatusResponseSchema.Type;

export const DeviceListResponseSchema = Schema.Array(DeviceResponseSchema);

export type DeviceListResponse = typeof DeviceListResponseSchema.Type;

export const RenameDeviceRequestSchema = Schema.Struct({
  name: Schema.String,
});

export type RenameDeviceRequest = typeof RenameDeviceRequestSchema.Type;

export const RevokeDeviceResponseSchema = Schema.Struct({
  deviceId: Schema.String,
  revoked: Schema.Boolean,
});

export type RevokeDeviceResponse = typeof RevokeDeviceResponseSchema.Type;

export const ApproveDeviceResponseSchema = Schema.Struct({
  deviceId: Schema.String,
  approved: Schema.Boolean,
});

export type ApproveDeviceResponse = typeof ApproveDeviceResponseSchema.Type;

export const DeleteDeviceResponseSchema = Schema.Struct({
  deviceId: Schema.String,
  deleted: Schema.Boolean,
});

export type DeleteDeviceResponse = typeof DeleteDeviceResponseSchema.Type;
