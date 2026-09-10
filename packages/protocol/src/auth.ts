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
});

export type DeviceResponse = typeof DeviceResponseSchema.Type;

export const AuthStatusResponseSchema = Schema.Struct({
  authenticated: Schema.Boolean,
  isLocal: Schema.Boolean,
  device: Schema.optional(DeviceResponseSchema),
});

export type AuthStatusResponse = typeof AuthStatusResponseSchema.Type;
