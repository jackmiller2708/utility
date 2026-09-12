import type { DeviceModel } from '../../../domain/index.js';

import { Component, input, output, effect, inject, ElementRef, viewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BadgeComponent } from '../../atoms/badge/badge.component.js';
import { MotionService } from '../../../core/index.js';

/** Mirrors the server's `REVOKED_DEVICE_RETENTION_MS` (`DeviceAuthService`) — display only, the server is the actual source of truth for when a row gets purged. */
const REVOKED_DEVICE_RETENTION_DAYS = 30;

/**
 * A stamped ticket row for one enrolled device — the Devices page's
 * counterpart to `JobTicketComponent`, reusing the same list vocabulary
 * rather than inventing a new one: Stamped In on arrival, Struck Plate's CSS
 * carries the revoked look, revoking plays Misregistration (a rejected plate
 * snapping out of register), and approving a pending device plays Pulled
 * Sheet — the same "a job just completed" moment a finished run uses. A row
 * never leaves the list on revoke or approve — it stays, visibly updated, as
 * the record of what this device is, until it's deleted (manually, or by the
 * server's own retention sweep 30 days after revocation), which is the only
 * thing that actually removes it. Rename, revoke, and delete all stay in-row
 * (click-to-edit, an armed two-step confirm) per the system's no-modal rule;
 * approve/reject on a still-pending row skip the confirm step since neither
 * one is undoing an already-granted trust.
 */
@Component({
  selector: 'app-device-ticket',
  standalone: true,
  imports: [CommonModule, BadgeComponent],
  templateUrl: './device-ticket.component.html',
  host: {
    class: 'flex relative items-start gap-3 border rounded-lg bg-paper-fresh border-paper-deckle overflow-hidden p-4',
    '[class.struck-plate]': 'device().revoked',
  },
})
export class DeviceTicketComponent {
  private readonly motion = inject(MotionService);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  device = input.required<DeviceModel>();
  /** Position within the list — caps the Stamped In stagger delay. */
  index = input<number>(0);
  isThisDevice = input<boolean>(false);
  /** False for another device viewed over a signed (non-`isLocal`) connection — the backend only lets a device manage itself remotely, so rename/revoke aren't offered on a row this session can't actually act on. */
  canManage = input<boolean>(true);
  /** True only when `isLocal` — approving (or rejecting) a pending enrollment is never self-service, matching `AuthController.approveDevice`. */
  canApprove = input<boolean>(false);
  /** True only when `isLocal` — permanently deleting a revoked device is never self-service, matching `AuthController.deleteDevice`. */
  canDelete = input<boolean>(false);
  confirming = input<boolean>(false);
  revoking = input<boolean>(false);
  approving = input<boolean>(false);
  confirmingDelete = input<boolean>(false);
  deleting = input<boolean>(false);

  renamed = output<string>();
  revokeRequested = output<void>();
  revokeCancelled = output<void>();
  revokeConfirmed = output<void>();
  approveRequested = output<void>();
  deleteRequested = output<void>();
  deleteCancelled = output<void>();
  deleteConfirmed = output<void>();

  readonly editingName = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private _stamped = false;
  private _cancellingRename = false;
  private _previousRevoked: boolean | null = null;
  private _previousApproved: boolean | null = null;

  constructor() {
    effect(() => {
      const revoked = this.device().revoked;
      const approved = this.device().approved;

      if (!this._stamped) {
        this._stamped = true;
        this._previousRevoked = revoked;
        this._previousApproved = approved;
        this.motion.stampIn(this.hostRef.nativeElement, this.index());
        return;
      }

      if (revoked && !this._previousRevoked) {
        this.motion.misregister(this.hostRef.nativeElement);
      } else if (approved && !this._previousApproved) {
        this.motion.pulledSheet(this.hostRef.nativeElement);
      }
      this._previousRevoked = revoked;
      this._previousApproved = approved;
    });

    effect(() => {
      if (this.editingName()) {
        queueMicrotask(() => this.nameInput()?.nativeElement.focus());
      }
    });
  }

  lastSeenLabel(): string {
    const date = new Date(this.device().lastSeenAt);
    if (Number.isNaN(date.getTime())) {
      return this.device().lastSeenAt;
    }
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** Days left before the retention sweep purges this row, or `null` when there's nothing to count down (not revoked, or revoked before this field existed). */
  daysUntilPurge(): number | null {
    const revokedAt = this.device().revokedAt;
    if (!revokedAt) {
      return null;
    }
    const revokedTime = new Date(revokedAt).getTime();
    if (Number.isNaN(revokedTime)) {
      return null;
    }
    const elapsedDays = (Date.now() - revokedTime) / (24 * 60 * 60 * 1000);
    return Math.max(0, Math.ceil(REVOKED_DEVICE_RETENTION_DAYS - elapsedDays));
  }

  startRename(): void {
    this._cancellingRename = false;
    this.editingName.set(true);
  }

  cancelRename(): void {
    this._cancellingRename = true;
    this.editingName.set(false);
  }

  onEnterKey(event: Event): void {
    (event.target as HTMLInputElement).blur();
  }

  commitRename(event: Event): void {
    if (this._cancellingRename) {
      this._cancellingRename = false;
      return;
    }

    const value = (event.target as HTMLInputElement).value.trim();
    this.editingName.set(false);
    if (value && value !== this.device().name) {
      this.renamed.emit(value);
    }
  }
}
