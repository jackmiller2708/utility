import type { AuthStatusResponse } from '@utility/protocol';

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Either } from 'effect';
import { vi } from 'vitest';
import { DeviceTrustService } from './device-trust.service';
import { DeviceIdentityService } from './device-identity.service';
import { ApiClientService } from './api-client.service';

class FakeApiClient implements Pick<ApiClientService, 'getAuthStatus$'> {
  authStatus: AuthStatusResponse = { authenticated: true, isLocal: true };

  getAuthStatus$() {
    return of(Either.right(this.authStatus));
  }
}

describe('DeviceTrustService', () => {
  let service: DeviceTrustService;
  let apiClient: FakeApiClient;
  let identity: DeviceIdentityService;

  beforeEach(() => {
    apiClient = new FakeApiClient();

    TestBed.configureTestingModule({
      providers: [{ provide: ApiClientService, useValue: apiClient }],
    });

    service = TestBed.inject(DeviceTrustService);
    identity = TestBed.inject(DeviceIdentityService);
  });

  it('invalidateTrust() is a no-op before trust has ever been confirmed', () => {
    service.invalidateTrust('should not apply');

    expect(service.trusted()).toBe('checking');
    expect(service.gateVisible()).toBe(false);
    expect(service.errorMessage()).toBeNull();
  });

  it('invalidateTrust() re-opens the gate once trust was confirmed', async () => {
    await service.ensureTrusted();
    expect(service.trusted()).toBe('trusted');
    expect(service.gateVisible()).toBe(false);

    const clearSpy = vi.spyOn(identity, 'clear');

    service.invalidateTrust('this device was revoked');

    expect(service.trusted()).toBe('untrusted');
    expect(service.gateVisible()).toBe(true);
    expect(service.errorMessage()).toBe('this device was revoked');
    expect(clearSpy).toHaveBeenCalled();
  });

  it('invalidateTrust() only acts once per confirmed session', () => {
    service['trustConfirmed'] = true;
    const clearSpy = vi.spyOn(identity, 'clear');

    service.invalidateTrust('first');
    service.invalidateTrust('second');

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(service.errorMessage()).toBe('first');
  });
});
