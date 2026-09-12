import type { AuthStatusResponse } from '@utility/protocol';

import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service.js';
import { DeviceIdentityService } from './device-identity.service.js';
import { ResponseError } from '../errors.js';
import { Either } from 'effect';

const APPROVAL_POLL_INTERVAL_MS = 3000;

/**
 * Owns whether this browser is currently trusted by the server, and the
 * enrollment gate's visibility/state machine. `ensureTrusted()` is the
 * guard's entry point: it resolves once — immediately if the server already
 * recognizes this device (or during SSR, or on `localhost` via the
 * backend's own bypass), otherwise once enrollment completes AND the
 * server operator approves it. Mirrors `RouteCurtainService`'s
 * guard-driven promise pattern.
 */
@Injectable({ providedIn: 'root' })
export class DeviceTrustService {
  private readonly apiClient = inject(ApiClientService);
  private readonly identity = inject(DeviceIdentityService);

  readonly gateVisible = signal(false);
  readonly checking = signal(false);
  readonly enrolling = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** The name from an unconfirmed enrollment recovered locally (see `DeviceIdentityService`) — lets the gate prefill the form instead of asking the person to retype it after a failed resume attempt. */
  readonly pendingName = signal('');

  /** Drives the gate's view: 'checking' during the first trust probe, 'untrusted' shows the name-entry form, 'pending' shows the waiting-for-approval view, 'trusted' hides the gate. */
  readonly trusted = signal<'checking' | 'trusted' | 'untrusted' | 'pending'>('checking');

  private trustConfirmed = false;
  private resolvePending: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  async ensureTrusted(): Promise<void> {
    if (typeof window === 'undefined' || this.trustConfirmed) {
      return;
    }

    // An enrollment that was generated (and maybe already sent) but never
    // got confirmed locally — a refresh or closed tab between the server
    // accepting it and this browser recording that fact. Resubmitting the
    // same keypair is safe either way: unsent, this is just that request
    // finally going out; already sent, `registerDevice`'s public-key dedup
    // hands back that same row. Either way the person never retypes their
    // device name.
    const pending = await this.identity.pendingEnrollment();
    if (pending) {
      this.pendingName.set(pending.name);
      this.gateVisible.set(true);
      this.checking.set(true);
      const submitted = await this.submitEnrollment(pending.name, pending.publicKeyPem);
      this.checking.set(false);
      if (this.trustConfirmed) {
        return;
      }
      if (submitted) {
        // Confirmed but still awaiting approval — `submitEnrollment` already
        // set `trusted` to 'pending' and started polling.
        return new Promise<void>((resolve) => {
          this.resolvePending = resolve;
        });
      }
      // Resubmission failed (still offline, etc.) — fall through to the
      // untrusted form below rather than looping silently; the keypair and
      // name stay intact either way, so retrying (automatically on the next
      // load, or via the form, which reuses the same pending record) is
      // still idempotent.
      this.trusted.set('untrusted');
      return new Promise<void>((resolve) => {
        this.resolvePending = resolve;
      });
    }

    const hasIdentity = await this.identity.hasIdentity();
    this.checking.set(true);
    const result = await this.fetchStatus();
    this.checking.set(false);

    const status = Either.isRight(result) ? result.right : null;
    const networkFailure = Either.isLeft(result);

    if (status?.authenticated) {
      this.finalizeTrusted();
      return;
    }

    // A previously-enrolled identity the server still recognizes but hasn't
    // approved yet (or the request raced the approval) resumes waiting
    // rather than being discarded — losing the keypair here would orphan
    // the pending row and force a confusing re-enroll. A network failure is
    // treated the same way, not as a rejection: `/auth/status` always
    // answers `200` (even "not authenticated" is a normal response), so the
    // only way to land here is a transport error, and we don't yet know the
    // server's real answer. Discarding a valid identity on every blip would
    // force re-enrollment with a brand-new keypair each time — never
    // resolving to the same device row, i.e. exactly the non-idempotent
    // behavior this guards against.
    if (hasIdentity && (networkFailure || (status?.device && !status.device.revoked && !status.device.approved))) {
      this.trusted.set('pending');
      return new Promise<void>((resolve) => {
        this.resolvePending = resolve;
        this.gateVisible.set(true);
        this.startApprovalPolling();
      });
    }

    // Revoked, unrecognized, or no identity at all — a clean slate is
    // correct: the gate's next successful enroll always produces a fresh
    // keypair.
    await this.identity.clear();
    this.trusted.set('untrusted');

    return new Promise<void>((resolve) => {
      this.resolvePending = resolve;
      this.gateVisible.set(true);
    });
  }

  /** Surfaces the raw Either rather than collapsing a transport failure to `null` — callers need to tell "server said no" apart from "couldn't ask," since `/auth/status` itself never errors for "not authenticated." */
  private fetchStatus(): Promise<Either.Either<AuthStatusResponse, ResponseError>> {
    return new Promise((resolve) => {
      this.apiClient.getAuthStatus$().subscribe(resolve);
    });
  }

  async enroll(name: string): Promise<void> {
    this.errorMessage.set(null);
    this.enrolling.set(true);

    let publicKeyPem: string;
    try {
      publicKeyPem = await this.identity.beginEnrollment(name);
    } catch {
      this.enrolling.set(false);
      this.errorMessage.set("Couldn't generate a device identity in this browser.");
      return;
    }

    await this.submitEnrollment(name, publicKeyPem);
    this.enrolling.set(false);
  }

  /**
   * Sends (or resends) one enroll request for an already-generated keypair
   * and reacts to the result. Shared by `enroll()` and `ensureTrusted()`'s
   * silent resume of an unconfirmed enrollment. Resolves `true` once the
   * server has confirmed the device (approved or still pending — either way
   * `trusted`/polling is already updated), `false` on a transport failure.
   */
  private submitEnrollment(name: string, publicKeyPem: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.apiClient.enrollDevice$(name, publicKeyPem).subscribe(Either.match({
        onRight: (device) => {
          this.identity.confirm(device.deviceId).then(() => {
            if (device.approved) {
              this.finalizeTrusted();
            } else {
              this.trusted.set('pending');
              this.startApprovalPolling();
            }
            resolve(true);
          });
        },
        onLeft: (error) => {
          this.errorMessage.set(error.message || "Couldn't reach the server. Check the connection and try again.");
          resolve(false);
        },
      }));
    });
  }

  private startApprovalPolling(): void {
    const tick = async () => {
      const result = await this.fetchStatus();

      // A poll that never reached the server (offline, dropped connection,
      // proxy hiccup) says nothing about approval — keep waiting on the
      // same identity rather than treating silence as rejection.
      if (Either.isLeft(result)) {
        this.pollTimer = setTimeout(tick, APPROVAL_POLL_INTERVAL_MS);
        return;
      }

      const status = result.right;
      if (status.authenticated) {
        this.finalizeTrusted();
        return;
      }
      if (!status.device || status.device.revoked) {
        // Revoked (or rejected) while waiting — stop polling and let the
        // person re-enroll rather than spin forever against a dead identity.
        this.pollTimer = null;
        this.identity.clear().then(() => this.trusted.set('untrusted'));
        return;
      }
      this.pollTimer = setTimeout(tick, APPROVAL_POLL_INTERVAL_MS);
    };
    this.pollTimer = setTimeout(tick, APPROVAL_POLL_INTERVAL_MS);
  }

  private finalizeTrusted(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.trustConfirmed = true;
    this.trusted.set('trusted');
    this.gateVisible.set(false);
    this.resolvePending?.();
    this.resolvePending = null;
  }
}
