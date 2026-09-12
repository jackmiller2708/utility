import type { CanActivateChildFn } from '@angular/router';
import { inject } from '@angular/core';
import { DeviceTrustService } from '../services/device-trust.service.js';

/**
 * Holds every navigation open until this browser is confirmed trusted (or,
 * during SSR / on `localhost`, resolves immediately — see
 * `DeviceTrustService.ensureTrusted`). Applied as `canActivateChild` on
 * `app.routes.ts`'s pathless wrapping route rather than repeated per leaf,
 * so it runs once, ahead of every tool route's own `curtainReadyGuard` —
 * the curtain must never open onto an ungated app.
 */
export const deviceTrustGuard: CanActivateChildFn = () => {
  const deviceTrust = inject(DeviceTrustService);
  return deviceTrust.ensureTrusted().then(() => true);
};
