import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from '../../../core/services/api-client.service.js';
import { DeviceModel, DeviceModelsFromDeviceListResponse } from '../../../domain/index.js';
import { Either } from 'effect';

/**
 * The enrolled-device registry backing the Devices page. Deliberately component-scoped
 * (provided on `DevicesListComponent`, not `providedIn: 'root'`) rather than a `RecipesService`-style
 * app-wide singleton: this list changes from *outside* this browser's own actions all the time —
 * another device gets approved or revoked, or (the case that motivated this) revoking your own
 * current device sends you back through the enrollment gate and you return with a new device
 * row. A root singleton's "fetched once" flag would never know to refetch after any of that; a
 * fresh instance per visit to the page means it always does.
 */
@Injectable()
export class DevicesService {
  private readonly apiClient = inject(ApiClientService);

  private readonly _devices = signal<readonly DeviceModel[]>([]);
  private readonly _loaded = signal(false);
  private readonly _isLoading = signal(false);

  readonly devices = this._devices.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  ensureLoaded(): void {
    if (this._loaded()) {
      return;
    }
    this.refresh();
  }

  refresh(): void {
    this._isLoading.set(true);
    this.apiClient.listDevices$().subscribe(Either.match({
      onRight: (res) => {
        this._devices.set(DeviceModelsFromDeviceListResponse.from(res));
        this._loaded.set(true);
        this._isLoading.set(false);
      },
      onLeft: () => {
        this._isLoading.set(false);
      },
    }));
  }

  rename$(deviceId: string, name: string) {
    return this.apiClient.renameDevice$(deviceId, name);
  }

  revoke$(deviceId: string) {
    return this.apiClient.revokeDevice$(deviceId);
  }

  approve$(deviceId: string) {
    return this.apiClient.approveDevice$(deviceId);
  }

  delete$(deviceId: string) {
    return this.apiClient.deleteDevice$(deviceId);
  }

  onRenamed(deviceId: string, name: string): void {
    this._devices.update((list) => list.map((device) => device.deviceId === deviceId ? { ...device, name } : device));
  }

  onRevoked(deviceId: string): void {
    this._devices.update((list) => list.map((device) => device.deviceId === deviceId ? { ...device, revoked: true } : device));
  }

  onApproved(deviceId: string): void {
    this._devices.update((list) => list.map((device) => device.deviceId === deviceId ? { ...device, approved: true } : device));
  }

  onDeleted(deviceId: string): void {
    this._devices.update((list) => list.filter((device) => device.deviceId !== deviceId));
  }
}
