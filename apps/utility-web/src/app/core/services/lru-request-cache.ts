import type { Observable } from 'rxjs';

import { of, tap, finalize, shareReplay } from 'rxjs';

export interface LruRequestCacheOptions<V> {
  /** Maximum number of resolved entries kept before the least-recently-used one is evicted. */
  readonly capacity: number;
  /** How long a resolved entry stays valid. Omit to keep entries until evicted or invalidated. */
  readonly ttlMs?: number;
  /** Decides whether a resolved value is worth caching (e.g. skip caching an error payload). Defaults to always caching. */
  readonly shouldCache?: (value: V) => boolean;
}

interface CacheEntry<V> {
  readonly value: V;
  readonly expiresAt: number | undefined;
}

/**
 * LRU cache for observable-returning lookups, mirroring the request-coalescing behavior of
 * Effect's `Cache`: the first `get()` for a key runs the loader and shares its in-flight
 * observable with every concurrent caller, then serves the resolved value from the LRU store
 * until it expires, is evicted, or is explicitly invalidated.
 */
export class LruRequestCache<K, V> {
  private readonly resolved = new Map<K, CacheEntry<V>>();
  private readonly inflight = new Map<K, Observable<V>>();

  constructor(private readonly options: LruRequestCacheOptions<V>) {}

  get(key: K, loader: () => Observable<V>): Observable<V> {
    const cached = this.resolved.get(key);
    if (cached && !this.isExpired(cached)) {
      this.touch(key, cached);
      return of(cached.value);
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const shared$ = loader().pipe(
      tap((value) => this.store(key, value)),
      finalize(() => this.inflight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.inflight.set(key, shared$);
    return shared$;
  }

  invalidate(key: K): void {
    this.resolved.delete(key);
  }

  clear(): void {
    this.resolved.clear();
  }

  private touch(key: K, entry: CacheEntry<V>): void {
    this.resolved.delete(key);
    this.resolved.set(key, entry);
  }

  private store(key: K, value: V): void {
    if (this.options.shouldCache && !this.options.shouldCache(value)) {
      return;
    }

    const ttlMs = this.options.ttlMs;
    this.resolved.delete(key);
    this.resolved.set(key, { value, expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined });

    while (this.resolved.size > this.options.capacity) {
      const oldestKey = this.resolved.keys().next().value as K;
      this.resolved.delete(oldestKey);
    }
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  }
}
