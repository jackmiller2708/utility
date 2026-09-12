import { InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface ApiConfig {
  readonly baseUrl: string;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG', {
  providedIn: 'root',
  /**
   * A relative path in the browser: same-origin under Caddy (or a dev
   * proxy), correct whether the app is reached as `localhost:4200` or a LAN
   * hostname, and the only shape that lets the device-signing interceptor's
   * `request.url` match the path the backend's `DeviceAuthGuard` signs
   * against (`req.originalUrl`) byte for byte. SSR keeps the direct dev
   * default — a relative URL has no origin to resolve against on the
   * server, and the interceptor's `Either.left` fallback already handles
   * that request failing gracefully in a multi-container deployment where
   * the SSR process can't reach the API on its own loopback.
   */
  factory: () => ({
    baseUrl: isPlatformBrowser(inject(PLATFORM_ID)) ? '/api/v1' : 'http://127.0.0.1:3000/api/v1',
  }),
});
