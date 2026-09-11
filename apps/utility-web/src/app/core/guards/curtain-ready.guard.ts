import type { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { RouteCurtainService } from '../services/route-curtain.service.js';

/**
 * Holds a navigation open until the route-transition curtain has fully
 * covered the viewport, so the destination component is created entirely
 * behind it — never revealed mid-fade, however fast the route resolves.
 */
export const curtainReadyGuard: CanActivateFn = () => {
  const curtain = inject(RouteCurtainService);
  return curtain.show().then(() => true);
};
