import { Component, inject, signal, effect } from '@angular/core';
import { DeviceTrustService } from '../../../core/index.js';
import { InputComponent } from '../../atoms/input/input.component.js';
import { IconComponent } from '../../atoms/icon/icon.component.js';
import { CommonModule } from '@angular/common';

/**
 * Registering a new plate to the press: the full-viewport moment a browser
 * this server has never seen proves itself, once, before anything else
 * loads. Driven entirely by `DeviceTrustService` (`deviceTrustGuard` is what
 * actually shows it) — mirrors `RouteCurtainComponent`'s root-mount shape,
 * but sits one layer above it (z-60 over the curtain's z-50): the curtain
 * ships pre-opaque from SSR on first boot, so this card has to render on
 * top of it to ever be visible, rather than trading places with it.
 */
@Component({
  selector: 'app-enrollment-gate',
  standalone: true,
  imports: [CommonModule, IconComponent, InputComponent],
  templateUrl: './enrollment-gate.component.html',
  host: {
    class: 'fixed inset-0 z-[60] bg-press flex items-center justify-center p-4',
    '[class.hidden]': '!gateVisible()',
    '[attr.aria-hidden]': '!gateVisible()',
    role: 'dialog',
    '[attr.aria-modal]': 'gateVisible()',
    'aria-label': 'Trust this device',
  },
})
export class EnrollmentGateComponent {
  private readonly deviceTrust = inject(DeviceTrustService);

  readonly gateVisible = this.deviceTrust.gateVisible;
  readonly enrolling = this.deviceTrust.enrolling;
  readonly errorMessage = this.deviceTrust.errorMessage;
  readonly pending = this.deviceTrust.trusted;

  readonly name = signal('');

  constructor() {
    // Prefills from a recovered-but-unsubmittable enrollment (e.g. this
    // browser generated a keypair and the request failed while offline) so
    // the person doesn't have to retype a name they already gave — only
    // when they haven't started typing something else themselves.
    effect(() => {
      const recovered = this.deviceTrust.pendingName();
      if (recovered && !this.name()) {
        this.name.set(recovered);
      }
    });
  }

  onNameInput(value: string): void {
    this.name.set(value);
  }

  submit(): void {
    const trimmed = this.name().trim();
    if (!trimmed || this.enrolling()) {
      return;
    }
    this.deviceTrust.enroll(trimmed);
  }
}
