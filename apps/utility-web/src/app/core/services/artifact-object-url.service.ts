import { Injectable, inject, signal } from '@angular/core';
import { Either } from 'effect';
import { ApiClientService } from './api-client.service';
import { DeviceTrustService } from './device-trust.service';

type UrlKind = 'file' | 'download' | 'preview';

/**
 * `DeviceAuthGuard` requires signed-request headers (`x-device-id`/`x-timestamp`/`x-nonce`/
 * `x-signature`) for any non-local request, which a plain `<img src>`/`<a href>` can never
 * carry — those are bare browser resource loads, not requests the signing interceptor ever
 * sees. So artifact bytes are fetched once through the signed `HttpClient` as a blob and kept
 * as an object URL, which every subsequent `<img>`/`<video>`/`<a>` binding can resolve locally
 * with no further request.
 *
 * `getFileUrl`/`getDownloadUrl` are safe to call from inside a `computed()`: a cache miss
 * returns `null` and kicks off the fetch, but the cache is only ever written from the fetch's
 * async `subscribe` callback — never synchronously during the read — so a `computed()` built
 * on top of this recomputes cleanly once the fetch resolves instead of writing mid-evaluation.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactObjectUrlService {
  private readonly _apiClient = inject(ApiClientService);
  private readonly _deviceTrust = inject(DeviceTrustService);

  private readonly _fileUrls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _downloadUrls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _previewUrls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _pending = new Set<string>();

  getFileUrl(id: string): string | null {
    return this.resolve(id, 'file');
  }

  getDownloadUrl(id: string): string | null {
    return this.resolve(id, 'download');
  }

  /** A compressed WebP re-encode, for on-screen inspection — always this format, regardless of what the artifact was actually saved as. Never use this URL for a download link: it silently swaps the file's real bytes for a lossy preview. */
  getPreviewUrl(id: string): string | null {
    return this.resolve(id, 'preview');
  }

  private resolve(id: string, kind: UrlKind): string | null {
    const cache = kind === 'file' ? this._fileUrls : kind === 'download' ? this._downloadUrls : this._previewUrls;
    const existing = cache().get(id);

    if (existing) {
      return existing;
    }

    const pendingKey = `${kind}:${id}`;

    if (!this._pending.has(pendingKey)) {
      this._pending.add(pendingKey);

      const blob$ = kind === 'file' ? this._apiClient.getArtifactFileBlob$(id)
        : kind === 'download' ? this._apiClient.getArtifactDownloadBlob$(id)
        : this._apiClient.getArtifactPreviewBlob$(id);

      blob$.subscribe((result) => {
        this._pending.delete(pendingKey);

        if (Either.isRight(result)) {
          const objectUrl = URL.createObjectURL(result.right);
          cache.update((map) => new Map(map).set(id, objectUrl));
        } else if (result.left.code === 401) {
          // Blob fetches skip the shared interceptor's centralized 401 handling (see
          // `responseInterceptor`), so this is the one place that still needs to react to it.
          this._deviceTrust.invalidateTrust('This device is no longer trusted. Ask to be trusted again to continue.');
        }
      });
    }

    return null;
  }
}
