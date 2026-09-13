import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { responseInterceptor } from './interceptors';
import { DeviceTrustService } from './services/device-trust.service';

describe('responseInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let deviceTrust: { invalidateTrust: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    deviceTrust = { invalidateTrust: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([responseInterceptor])),
        provideHttpClientTesting(),
        { provide: DeviceTrustService, useValue: deviceTrust },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('invalidates trust on a 401', async () => {
    const result = firstValueFrom(http.get('/api/v1/tools'));
    httpMock.expectOne('/api/v1/tools').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    await result;

    expect(deviceTrust.invalidateTrust).toHaveBeenCalledTimes(1);
  });

  it('leaves trust alone on a non-401 error', async () => {
    const result = firstValueFrom(http.get('/api/v1/tools'));
    httpMock.expectOne('/api/v1/tools').flush('Not Found', { status: 404, statusText: 'Not Found' });
    await result;

    expect(deviceTrust.invalidateTrust).not.toHaveBeenCalled();
  });

  it('leaves trust alone on success', async () => {
    const result = firstValueFrom(http.get('/api/v1/tools'));
    httpMock.expectOne('/api/v1/tools').flush({ tools: [] });
    await result;

    expect(deviceTrust.invalidateTrust).not.toHaveBeenCalled();
  });
});
