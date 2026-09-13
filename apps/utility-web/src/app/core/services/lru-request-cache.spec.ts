import { of, Subject } from 'rxjs';
import { LruRequestCache } from './lru-request-cache';

describe('LruRequestCache', () => {
  it('coalesces concurrent calls into a single loader invocation', () => {
    const cache = new LruRequestCache<string, number>({ capacity: 10 });
    const source = new Subject<number>();
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return source.asObservable();
    };

    const first: number[] = [];
    const second: number[] = [];
    cache.get('a', loader).subscribe((value) => first.push(value));
    cache.get('a', loader).subscribe((value) => second.push(value));

    expect(loaderCalls).toBe(1);

    source.next(42);
    source.complete();

    expect(first).toEqual([42]);
    expect(second).toEqual([42]);
  });

  it('serves resolved values from cache without calling the loader again', () => {
    const cache = new LruRequestCache<string, number>({ capacity: 10 });
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return of(7);
    };

    cache.get('a', loader).subscribe();
    const results: number[] = [];
    cache.get('a', loader).subscribe((value) => results.push(value));

    expect(loaderCalls).toBe(1);
    expect(results).toEqual([7]);
  });

  it('evicts the least-recently-used entry once capacity is exceeded', () => {
    const cache = new LruRequestCache<string, number>({ capacity: 2 });
    const load = (value: number) => () => of(value);

    cache.get('a', load(1)).subscribe();
    cache.get('b', load(2)).subscribe();
    cache.get('a', load(1)).subscribe(); // touch 'a' so 'b' becomes the LRU entry
    cache.get('c', load(3)).subscribe(); // evicts 'b'

    let bLoaderCalls = 0;
    cache.get('b', () => {
      bLoaderCalls++;
      return of(2);
    }).subscribe();

    expect(bLoaderCalls).toBe(1);
  });

  it('does not cache a value the shouldCache predicate rejects', () => {
    const cache = new LruRequestCache<string, { ok: boolean }>({
      capacity: 10,
      shouldCache: (value) => value.ok,
    });
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return of({ ok: false });
    };

    cache.get('a', loader).subscribe();
    cache.get('a', loader).subscribe();

    expect(loaderCalls).toBe(2);
  });

  it('re-runs the loader after invalidate() and clear()', () => {
    const cache = new LruRequestCache<string, number>({ capacity: 10 });
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return of(loaderCalls);
    };

    cache.get('a', loader).subscribe();
    cache.invalidate('a');
    cache.get('a', loader).subscribe();
    cache.clear();
    cache.get('a', loader).subscribe();

    expect(loaderCalls).toBe(3);
  });

  it('expires entries once their ttl has elapsed', async () => {
    const cache = new LruRequestCache<string, number>({ capacity: 10, ttlMs: 10 });
    let loaderCalls = 0;
    const loader = () => {
      loaderCalls++;
      return of(loaderCalls);
    };

    cache.get('a', loader).subscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    cache.get('a', loader).subscribe();

    expect(loaderCalls).toBe(2);
  });
});
