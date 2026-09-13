import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent, DeviceTicketComponent, IconComponent } from '@app/ui';
import { DevicesService } from '../services/devices.service.js';
import { DeviceIdentityService, RuntimeStatusService, DeviceTrustService } from '../../../core/index.js';
import type { DeviceModel } from '../../../domain/index.js';
import { Either } from 'effect';

@Component({
  selector: 'app-devices-list-page',
  standalone: true,
  imports: [CommonModule, BadgeComponent, IconComponent, DeviceTicketComponent],
  templateUrl: './devices-list.component.html',
  host: { class: 'flex flex-col gap-6 min-w-0 w-full' },
  // Component-scoped, not root: see DevicesService's own doc comment for why this list needs a
  // fresh fetch every time this page is entered rather than a value cached for the app's lifetime.
  providers: [DevicesService],
})
export class DevicesListComponent implements OnInit {
  readonly service = inject(DevicesService);
  private readonly identity = inject(DeviceIdentityService);
  private readonly runtimeStatus = inject(RuntimeStatusService);
  private readonly deviceTrust = inject(DeviceTrustService);

  readonly confirmingId = signal<string | null>(null);
  readonly revokingId = signal<string | null>(null);
  readonly approvingId = signal<string | null>(null);
  readonly confirmingDeleteId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  ngOnInit(): void {
    this.service.ensureLoaded();
  }

  isThisDevice(device: DeviceModel): boolean {
    return device.deviceId === this.identity.currentDeviceId();
  }

  /**
   * The backend only lets a device manage itself over a signed request —
   * `isLocal` (physically at the server) is the one path allowed to manage
   * any device. Mirrors `AuthController.assertSelfOrLocal` so the UI never
   * offers an action the API would reject with a 403.
   */
  canManage(device: DeviceModel): boolean {
    return this.isLocal() || this.isThisDevice(device);
  }

  /** Approving (or rejecting) a pending enrollment is `isLocal`-only — never self-service — matching `AuthController.approveDevice`. */
  canApprove(): boolean {
    return this.isLocal();
  }

  /** Permanently deleting a revoked device is `isLocal`-only, same bar as approving — matching `AuthController.deleteDevice`. */
  canDelete(): boolean {
    return this.isLocal();
  }

  private isLocal(): boolean {
    return this.runtimeStatus.authStatus()?.isLocal === true;
  }

  approveDevice(device: DeviceModel): void {
    this.approvingId.set(device.deviceId);
    this.service.approve$(device.deviceId).subscribe(Either.match({
      onRight: () => {
        this.service.onApproved(device.deviceId);
        this.approvingId.set(null);
      },
      onLeft: () => {
        this.approvingId.set(null);
      },
    }));
  }

  requestRevoke(deviceId: string): void {
    this.confirmingId.set(deviceId);
  }

  cancelRevoke(): void {
    this.confirmingId.set(null);
  }

  confirmRevoke(device: DeviceModel): void {
    this.revokingId.set(device.deviceId);
    this.service.revoke$(device.deviceId).subscribe(Either.match({
      onRight: () => {
        this.service.onRevoked(device.deviceId);
        this.confirmingId.set(null);
        this.revokingId.set(null);

        // The revoke response itself never 401s — the signature that carried
        // it was still valid at verification time — so nothing would
        // otherwise catch this until some *later* protected call happened to
        // fail. Closing the gate here, immediately, is what stops the SPA
        // from staying navigable on a session the server no longer trusts.
        if (this.isThisDevice(device)) {
          this.deviceTrust.invalidateTrust('You revoked this device. Ask to be trusted again to continue.');
        }
      },
      onLeft: () => {
        this.revokingId.set(null);
      },
    }));
  }

  requestDelete(deviceId: string): void {
    this.confirmingDeleteId.set(deviceId);
  }

  cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  confirmDelete(device: DeviceModel): void {
    this.deletingId.set(device.deviceId);
    this.service.delete$(device.deviceId).subscribe(Either.match({
      onRight: () => {
        this.service.onDeleted(device.deviceId);
        this.confirmingDeleteId.set(null);
        this.deletingId.set(null);
      },
      onLeft: () => {
        this.deletingId.set(null);
      },
    }));
  }

  rename(device: DeviceModel, name: string): void {
    this.service.rename$(device.deviceId, name).subscribe(Either.match({
      onRight: () => this.service.onRenamed(device.deviceId, name),
      onLeft: () => {
        // The row already reverted to its previous name on blur since the ticket
        // doesn't optimistically update — a failed rename is simply a no-op here.
      },
    }));
  }
}
