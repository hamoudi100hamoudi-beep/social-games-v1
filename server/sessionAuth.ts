import crypto from 'crypto';

export interface CredentialRecord {
  secretHash: string; // 64-char hex SHA-256
  createdAt: number;
  lastUsedAt: number;
}

export type IsActivePredicate = (persistentId: string) => boolean;

/**
 * SessionAuthStore maintains a private, in-memory repository of cryptographic reconnect credentials.
 * 
 * Invariants:
 * 1. Raw secrets are NEVER stored in memory or logged; only SHA-256 digest hashes are retained.
 * 2. Credential hashes are kept strictly isolated from Player objects and Room state, preventing any
 *    possibility of serializing credentials into public `room_state_update` broadcasts.
 * 3. Secret verification uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channels.
 * 4. Store size is bounded to prevent unbounded memory growth from stale entries.
 * 5. Active players' credentials are NEVER pruned under storage pressure. Reclaiming space only prunes
 *    provably inactive credentials. If no inactive space can be reclaimed, new registrations are rejected.
 */
export class SessionAuthStore {
  private credentials: Map<string, CredentialRecord> = new Map();
  private readonly maxEntries: number;
  private activePredicate?: IsActivePredicate;

  constructor(maxEntries: number = 5000, activePredicate?: IsActivePredicate) {
    this.maxEntries = maxEntries;
    if (activePredicate) {
      this.activePredicate = activePredicate;
    }
  }

  public setActivePredicate(predicate: IsActivePredicate): void {
    this.activePredicate = predicate;
  }

  public get capacity(): number {
    return this.maxEntries;
  }

  public get size(): number {
    return this.credentials.size;
  }

  public hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  public isValidSecret(secret: unknown): secret is string {
    return typeof secret === 'string' && secret.trim().length >= 16 && secret.length <= 128;
  }

  public isValidPersistentId(id: unknown): id is string {
    return typeof id === 'string' && id.trim().length >= 3 && id.length <= 64;
  }

  /**
   * Checks whether the store has capacity to accept a new credential registration.
   * If at or above maxEntries, returns true only if at least one provably inactive entry can be reclaimed.
   */
  public canRegisterNew(isActivePredicate?: IsActivePredicate): boolean {
    if (this.credentials.size < this.maxEntries) {
      return true;
    }

    const predicate = isActivePredicate || this.activePredicate;
    if (!predicate) {
      return false; // Cannot prove any credential is inactive without a predicate
    }

    for (const id of this.credentials.keys()) {
      if (!predicate(id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Reclaims space by pruning provably inactive credentials (LRU based on lastUsedAt).
   * Active credentials (where predicate(id) === true) are strictly protected and never pruned.
   * @returns The number of inactive credentials pruned.
   */
  public pruneInactive(isActivePredicate?: IsActivePredicate, maxToPrune?: number): number {
    const predicate = isActivePredicate || this.activePredicate;
    if (!predicate) {
      return 0;
    }

    const inactiveList: { id: string; lastUsedAt: number }[] = [];
    for (const [id, record] of this.credentials.entries()) {
      if (!predicate(id)) {
        inactiveList.push({ id, lastUsedAt: record.lastUsedAt });
      }
    }

    if (inactiveList.length === 0) {
      return 0;
    }

    // Sort LRU: oldest lastUsedAt first
    inactiveList.sort((a, b) => a.lastUsedAt - b.lastUsedAt);

    const limit = maxToPrune !== undefined
      ? Math.min(inactiveList.length, maxToPrune)
      : Math.min(inactiveList.length, Math.max(1, Math.min(500, Math.ceil(this.maxEntries * 0.1))));

    let prunedCount = 0;
    for (let i = 0; i < limit; i++) {
      this.credentials.delete(inactiveList[i].id);
      prunedCount++;
    }

    return prunedCount;
  }

  public registerCredential(
    persistentId: string, 
    secret: string, 
    isActivePredicate?: IsActivePredicate
  ): boolean {
    if (!this.isValidPersistentId(persistentId) || !this.isValidSecret(secret)) {
      return false;
    }

    const cleanId = persistentId.trim();
    // Invariant: Initial registration ONLY. Never allow overwriting an existing credential.
    if (this.credentials.has(cleanId)) {
      return false;
    }

    // Invariant: Cap protection. Never exceed maxEntries and never evict active players.
    if (this.credentials.size >= this.maxEntries) {
      this.pruneInactive(isActivePredicate);

      // If still at capacity, reject new registration safely
      if (this.credentials.size >= this.maxEntries) {
        return false;
      }
    }

    const hash = this.hashSecret(secret.trim());
    const now = Date.now();

    this.credentials.set(cleanId, {
      secretHash: hash,
      createdAt: now,
      lastUsedAt: now,
    });

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
  public prune(isActivePredicate?: IsActivePredicate): void {
    const predicate = isActivePredicate || this.activePredicate;
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    for (const [id, record] of this.credentials.entries()) {
      if (now - record.lastUsedAt > MAX_AGE_MS) {
        // Invariant: Never prune an active player's credential!
        if (!predicate || !predicate(id)) {
          this.credentials.delete(id);
        }
      }
    }
  }

  public clearAllForTesting(): void {
    this.credentials.clear();
  }
}

export const sessionAuthStore = new SessionAuthStore();
