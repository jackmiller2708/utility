import type { AuthStatusResponse, ToolsListResponse } from '@utility/protocol';

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Either } from 'effect';
import { App } from './app.js';
import { routes } from './app.routes.js';
import { ApiClientService, DeviceTrustService } from './core/index.js';

/** Stands in for the real device-trust round trip so `deviceTrustGuard` resolves deterministically instead of racing an unmocked HTTP call — the gate's own behavior is covered by `DeviceTrustService`'s own specs. */
class FakeApiClient implements Pick<ApiClientService, 'getAuthStatus$' | 'getTools$'> {
  getAuthStatus$() {
    return of(Either.right({ authenticated: true, isLocal: true } satisfies AuthStatusResponse));
  }

  getTools$() {
    return of(Either.right({ tools: [] } satisfies ToolsListResponse));
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        { provide: ApiClientService, useClass: FakeApiClient },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render workbench layout and navigation', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // The workbench shell only mounts once DeviceTrustService confirms
    // trust (see app.html) — that's what this test is actually exercising,
    // so it drives it directly rather than racing the router guard's own
    // call to the same (idempotent) method.
    await TestBed.inject(DeviceTrustService).ensureTrusted();
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-workbench-layout')).toBeTruthy();
  });
});
