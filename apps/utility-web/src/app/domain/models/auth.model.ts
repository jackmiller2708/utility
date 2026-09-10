export interface DeviceModel {
  readonly deviceId: string;
  readonly name: string;
  readonly publicKey: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revoked: boolean;
}

export interface AuthStatusModel {
  readonly authenticated: boolean;
  readonly isLocal: boolean;
  readonly device?: DeviceModel;
}
