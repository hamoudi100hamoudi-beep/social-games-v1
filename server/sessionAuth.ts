import crypto from 'crypto';

export interface CredentialRecord {
  secretHash: string; // 64-char hex SHA-256
  createdAt: number;
  lastUsedAt: number;
}

/**
 * SessionAuthStore maintains a private, in-memory repository of cryptographic reconnect credentials.
 * 
 * Invariants:
 * 1. Raw secrets are NEVER stored in memory or logged; only SHA-256 digest hashes are retained.
 * 2. Credential hashes are kept strictly isolated from Player objects and Room state, preventing any
 *    possibility of serializing credentials into public `room_state_update` broadcasts.
 * 3. Secret verification uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channels.
 * 4. Store size is bounded to prevent unbounded memory growth from stale entries.
 */
export class SessionAuthStore {
  private credentials: Map<string, CredentialRecord> = new Map();
  private readonly maxEntries: number = 5000;

  public hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  public isValidSecret(secret: unknown): secret is string {
    return typeof secret === 'string' && secret.trim().length >= 16 && secret.length <= 128;
  }

  public isValidPersistentId(id: unknown): id is string {
    return typeof id === 'string' && id.trim().length >= 3 && id.length <= 64;
  }

  public registerCredential(persistentId: string, secret: string): boolean {
    if (!this.isValidPersistentId(persistentId) || !this.isValidSecret(secret)) {
      return false;
    }

    const cleanId = persistentId.trim();
    // Invariant: Initial registration ONLY. Never allow overwriting an existing credential.
    if (this.credentials.has(cleanId)) {
      return false;
    }

    const hash = this.hashSecret(secret.trim());
    const now = Date.now();

    this.credentials.set(cleanId, {
      secretHash: hash,
      createdAt: now,
      lastUsedAt: now,
    });

    if (this.credentials.size > this.maxEntries) {
      this.pruneOldest(500);
    }

    return true;
  }

  public hasCredential(persistentId: string): boolean {
    if (!this.isValidPersistentId(persistentId)) return false;
    return this.credentials.has(persistentId.trim());
  }

  public verifyCredential(persistentId: string, secret: unknown): boolean {
    if (!this.isValidPersistentId(persistentId) || !this.isValidSecret(secret)) {
      return false;
    }

    const cleanId = persistentId.trim();
    const record = this.credentials.get(cleanId);
    if (!record) {
      return false;
    }

    const computedHash = this.hashSecret(secret.trim());
    try {
      const bufA = Buffer.from(computedHash, 'hex');
      const bufB = Buffer.from(record.secretHash, 'hex');
      if (bufA.length !== bufB.length) return false;
      const isMatch = crypto.timingSafeEqual(bufA, bufB);
      if (isMatch) {
        record.lastUsedAt = Date.now();
      }
      return isMatch;
    } catch {
      return false;
    }
  }

  public removeCredential(persistentId: string): void {
    if (typeof persistentId === 'string') {
      this.credentials.delete(persistentId.trim());
    }
  }

  /**
   * Periodic pruning to prevent memory bloat while strictly protecting active players.
   * @param isActivePredicate Callback to determine if a persistentId is currently active in any room.
   */
  public prune(isActivePredicate: (persistentId: string) => boolean): void {
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    for (const [id, record] of this.credentials.entries()) {
      if (now - record.lastUsedAt > MAX_AGE_MS) {
        // Invariant: Never prune an active player's credential!
        if (!isActivePredicate(id)) {
          this.credentials.delete(id);
        }
      }
    }
  }

  private pruneOldest(count: number): void {
    let removed = 0;
    for (const id of this.credentials.keys()) {
      if (removed >= count) break;
      this.credentials.delete(id);
      removed++;
    }
  }

  public clearAllForTesting(): void {
    this.credentials.clear();
  }

  public get size(): number {
    return this.credentials.size;
  }
}

export const sessionAuthStore = new SessionAuthStore();
