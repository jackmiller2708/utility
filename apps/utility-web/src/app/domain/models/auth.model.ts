import type { DeviceResponse, DeviceListResponse, AuthStatusResponse } from '@utility/protocol';
import type { From } from '@utility/adapter';

export interface DeviceModel {
  readonly deviceId: string;
  readonly name: string;
  readonly publicKey: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revoked: boolean;
  readonly revokedAt: string | null;
  readonly approved: boolean;
}

export interface AuthStatusModel {
  readonly authenticated: boolean;
  readonly isLocal: boolean;
  readonly device?: DeviceModel;
}

export const DeviceModelFromDeviceResponse: From<DeviceResponse, DeviceModel> = {
  from: (dto) => ({
    deviceId: dto.deviceId,
    name: dto.name,
    publicKey: dto.publicKey,
    createdAt: dto.createdAt,
    lastSeenAt: dto.lastSeenAt,
    revoked: dto.revoked,
    revokedAt: dto.revokedAt,
    approved: dto.approved,
  }),
};

export const DeviceModelsFromDeviceListResponse: From<DeviceListResponse, readonly DeviceModel[]> = {
  from: (dto) => dto.map((device) => DeviceModelFromDeviceResponse.from(device)),
};

export const AuthStatusModelFromAuthStatusResponse: From<AuthStatusResponse, AuthStatusModel> = {
  from: (dto) => ({
    authenticated: dto.authenticated,
    isLocal: dto.isLocal,
    device: dto.device ? DeviceModelFromDeviceResponse.from(dto.device) : undefined,
  }),
};
