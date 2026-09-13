import { Injectable } from '@angular/core';
import { From } from '@utility/adapter';

const DB_NAME = 'utility-device-identity';
const STORE_NAME = 'identity';
const RECORD_KEY = 'current';
const SIGN_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;

interface IdentityRecord {
  /** `null` until the server has confirmed enrollment and assigned an id — see the class doc for why this state is persisted at all. */
  readonly deviceId: string | null;
  /** The name last submitted with this keypair — kept so an unconfirmed enrollment can be silently resubmitted (e.g. after a reload) without asking the person to type it again. */
  readonly name: string;
  readonly publicKeyPem: string;
  readonly privateKey: CryptoKey;
}

export interface SignedRequest {
  readonly deviceId: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly signature: string;
}

export const HeadersFromSignedRequest: From<SignedRequest, { [header: string]: string }> = {
  from: (signed) => ({
    'x-device-id': signed.deviceId,
    'x-timestamp': signed.timestamp,
    'x-nonce': signed.nonce,
    'x-signature': signed.signature,
  })
} 

const bufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

const derToPem = (der: ArrayBuffer, label: string): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
};

/**
 * Owns this browser's device keypair: generation, IndexedDB storage, and
 * request signing. The private key is generated `extractable: true` only
 * because `generateKey` applies one extractable flag to both halves of an
 * asymmetric pair and the public key must be exportable to enroll — this
 * code itself never calls `exportKey` on the private half, and the
 * `CryptoKey` is stored directly in IndexedDB (structured-clone, never
 * serialized to a string) rather than as raw key material.
 *
 * The keypair is written to IndexedDB the moment it's generated — *before*
 * the enroll request goes out — with `deviceId: null` marking it
 * unconfirmed, rather than being held in memory until the server responds.
 * A page refresh, closed tab, or dropped response between the server
 * accepting the enrollment and this browser recording that fact would
 * otherwise orphan that identity: the next load would have no record of it,
 * generate a brand-new keypair, and submit a second request — since
 * `DeviceAuthService.registerDevice` on the server dedupes by public key,
 * that only avoids a duplicate device row if the retry reuses the *same*
 * key. Persisting eagerly means `beginEnrollment` and `pendingEnrollment`
 * can always recover and reuse that same unconfirmed keypair regardless of
 * when the interruption happened, so the whole enroll flow is idempotent
 * end to end and the person is never asked to type their device name twice.
 *
 * SSR-safe by construction: every method is a no-op / resolves to `null`
 * when `window`/`indexedDB` don't exist, matching `RouteCurtainService`'s
 * pattern for the same reason (no browser APIs during prerendering).
 */
@Injectable({ providedIn: 'root' })
export class DeviceIdentityService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private cached?: IdentityRecord | null;

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  private async loadRecord(): Promise<IdentityRecord | null> {
    if (!this.isBrowser()) {
      return null;
    }
    if (this.cached !== undefined) {
      return this.cached;
    }

    const db = await this.openDb();
    const record = await new Promise<IdentityRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve((req.result as IdentityRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });

    this.cached = record;
    return record;
  }

  /** Whether this browser holds a *confirmed* device identity — the server has assigned it a deviceId. False for an unconfirmed one still waiting to be (re)submitted; use `pendingEnrollment()` for that. May still be revoked/unrecognized server-side — that's a live check, not a local one. */
  async hasIdentity(): Promise<boolean> {
    const record = await this.loadRecord();
    return record !== null && record.deviceId !== null;
  }

  /** An enrollment that was generated (and possibly already sent) but never got confirmed locally — the caller should resubmit it as-is rather than starting a fresh one, so a retry reuses the same public key. */
  async pendingEnrollment(): Promise<{ readonly name: string; readonly publicKeyPem: string } | null> {
    const record = await this.loadRecord();
    return record && record.deviceId === null ? { name: record.name, publicKeyPem: record.publicKeyPem } : null;
  }

  currentDeviceId(): string | null {
    return this.cached?.deviceId ?? null;
  }

  /**
   * Returns the PEM to enroll with. If an unconfirmed enrollment already
   * exists locally (a prior attempt that never reached `confirm`), its
   * keypair is reused as-is rather than generating a new one — the server
   * dedupes by public key, so reusing it is what makes a retry idempotent.
   * Otherwise generates a fresh keypair and persists it immediately, before
   * the caller ever contacts the server (see the class doc for why).
   */
  async beginEnrollment(name: string): Promise<string> {
    const existing = await this.loadRecord();
    if (existing && existing.deviceId === null) {
      if (existing.name !== name) {
        await this.writeRecord({ ...existing, name });
      }
      return existing.publicKeyPem;
    }

    const keyPair = await crypto.subtle.generateKey(SIGN_ALGORITHM, true, ['sign', 'verify']);
    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyPem = derToPem(spki, 'PUBLIC KEY');
    await this.writeRecord({ deviceId: null, name, publicKeyPem, privateKey: keyPair.privateKey });
    return publicKeyPem;
  }

  /** Marks a previously-persisted enrollment confirmed once the server has assigned a deviceId. */
  async confirm(deviceId: string): Promise<void> {
    const record = await this.loadRecord();
    if (!record) {
      throw new Error('No pending device identity to confirm — call beginEnrollment() first');
    }
    await this.writeRecord({ ...record, deviceId });
  }

  private async writeRecord(record: IdentityRecord): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.cached = record;
  }

  /** Discards the local identity — used when the server reports this device revoked, so the app falls back to a clean re-enrollment rather than looping on rejected signatures. */
  async clear(): Promise<void> {
    if (!this.isBrowser()) {
      return;
    }
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.cached = null;
  }

  /**
   * Signs one request per `DeviceAuthGuard`'s payload contract
   * (`METHOD:path:timestamp:nonce:` — the guard never sends a body hash).
   * Returns `null` when there's no confirmed identity yet (none at all, or
   * still an unconfirmed enrollment with no server-assigned deviceId to
   * sign with); the interceptor treats that as "send unsigned," which is
   * correct pre-enrollment.
   */
  async sign(method: string, path: string): Promise<SignedRequest | null> {
    const identity = await this.loadRecord();
    if (!identity || identity.deviceId === null) {
      return null;
    }

    const timestamp = Date.now().toString();
    const nonce = bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const payload = `${method.toUpperCase()}:${path}:${timestamp}:${nonce}:`;

    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      identity.privateKey,
      new TextEncoder().encode(payload),
    );

    return { deviceId: identity.deviceId, timestamp, nonce, signature: bufferToHex(signatureBuffer) };
  }
}
