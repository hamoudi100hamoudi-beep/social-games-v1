const CLEANUP_INTERVAL_MS = 10000;
const lastSweepTimes = new WeakMap<Map<string, number[]>, number>();

export function checkRateLimit(
  limitsMap: Map<string, number[]>,
  key: string,
  maxMessages: number,
  windowMs: number
): boolean {
  const now = Date.now();

  // Time-gated sweep for stale keys in limitsMap (at most once every CLEANUP_INTERVAL_MS per map)
  const lastSweep = lastSweepTimes.get(limitsMap) || 0;
  if (now - lastSweep >= CLEANUP_INTERVAL_MS) {
    lastSweepTimes.set(limitsMap, now);
    for (const [k, timestamps] of limitsMap.entries()) {
      if (k === key) continue; // Skip current key; will be evaluated/updated below
      const active = timestamps.filter(ts => now - ts < windowMs);
      if (active.length === 0) {
        limitsMap.delete(k);
      } else if (active.length < timestamps.length) {
        limitsMap.set(k, active);
      }
    }
  }

  const timestamps = limitsMap.get(key) || [];
  const recent = timestamps.filter(ts => now - ts < windowMs);
  if (recent.length >= maxMessages) {
    limitsMap.set(key, recent);
    return false; // Rate limited
  }
  recent.push(now);
  limitsMap.set(key, recent);
  return true; // Allowed
}

export type ControlRateLimitGroup =
  | 'join_room'
  | 'get_room_info'
  | 'get_rooms_info'
  | 'free_draw_toggle'
  | 'drawing_identity'
  | 'request_drawing_identities';

export interface ControlRateLimitConfig {
  readonly maxTokens: number;
  readonly refillPerSec: number;
}

export const CONTROL_RATE_LIMITS: Readonly<Record<ControlRateLimitGroup, ControlRateLimitConfig>> = {
  join_room: { maxTokens: 4, refillPerSec: 0.5 },
  get_room_info: { maxTokens: 10, refillPerSec: 5 },
  get_rooms_info: { maxTokens: 4, refillPerSec: 1 },
  free_draw_toggle: { maxTokens: 4, refillPerSec: 1 },
  drawing_identity: { maxTokens: 8, refillPerSec: 2 },
  request_drawing_identities: { maxTokens: 4, refillPerSec: 1 },
};

export interface ControlTokenBucketSlot {
  tokens: number;
  lastRefillMs: number;
}

export interface SocketControlBucketsRecord {
  join_room?: ControlTokenBucketSlot;
  get_room_info?: ControlTokenBucketSlot;
  get_rooms_info?: ControlTokenBucketSlot;
  free_draw_toggle?: ControlTokenBucketSlot;
  drawing_identity?: ControlTokenBucketSlot;
  request_drawing_identities?: ControlTokenBucketSlot;
}

/**
 * O(1) constant-time per-socket token-bucket limiter for Socket.IO control events.
 * Stores fixed per-socket bucket slots in one socket-keyed record and cleans up
 * with a single Map.delete(socketId) on disconnect without arrays, sweeps, or timers.
 */
export class ControlRateLimiter {
  public readonly limits: Readonly<Record<ControlRateLimitGroup, ControlRateLimitConfig>>;
  private readonly sockets = new Map<string, SocketControlBucketsRecord>();

  constructor(
    overrides?: Partial<Record<ControlRateLimitGroup, Partial<ControlRateLimitConfig>>>
  ) {
    if (!overrides) {
      this.limits = CONTROL_RATE_LIMITS;
      return;
    }

    const resolve = (group: ControlRateLimitGroup): ControlRateLimitConfig => {
      const base = CONTROL_RATE_LIMITS[group];
      const ov = overrides[group];
      return {
        maxTokens:
          typeof ov?.maxTokens === 'number' && Number.isFinite(ov.maxTokens) && ov.maxTokens > 0
            ? ov.maxTokens
            : base.maxTokens,
        refillPerSec:
          typeof ov?.refillPerSec === 'number' && Number.isFinite(ov.refillPerSec) && ov.refillPerSec > 0
            ? ov.refillPerSec
            : base.refillPerSec,
      };
    };

    this.limits = {
      join_room: resolve('join_room'),
      get_room_info: resolve('get_room_info'),
      get_rooms_info: resolve('get_rooms_info'),
      free_draw_toggle: resolve('free_draw_toggle'),
      drawing_identity: resolve('drawing_identity'),
      request_drawing_identities: resolve('request_drawing_identities'),
    };
  }

  /**
   * Lazily refills the socket's bucket for `group` in O(1) and consumes 1 token.
   */
  public consume(
    socketId: string,
    group: ControlRateLimitGroup,
    nowMs: number = Date.now()
  ): boolean {
    if (!socketId || typeof socketId !== 'string') return false;

    const config = this.limits[group];
    if (!config || config.maxTokens < 1) return false;

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    let record = this.sockets.get(socketId);

    if (!record) {
      record = {};
      record[group] = {
        tokens: config.maxTokens - 1,
        lastRefillMs: now,
      };
      this.sockets.set(socketId, record);
      return true;
    }

    const slot = record[group];
    if (!slot) {
      record[group] = {
        tokens: config.maxTokens - 1,
        lastRefillMs: now,
      };
      return true;
    }

    const elapsedMs = now > slot.lastRefillMs ? now - slot.lastRefillMs : 0;
    if (elapsedMs > 0) {
      slot.tokens = Math.min(
        config.maxTokens,
        slot.tokens + (elapsedMs / 1000) * config.refillPerSec
      );
      slot.lastRefillMs = now;
    }

    if (slot.tokens < 1) {
      return false;
    }

    slot.tokens -= 1;
    return true;
  }

  /**
   * Immediately frees all control rate-limit buckets for a disconnected socket in O(1).
   */
  public cleanupSocket(socketId: string): void {
    if (socketId) {
      this.sockets.delete(socketId);
    }
  }

  public clear(): void {
    this.sockets.clear();
  }

  public getTrackedSocketCount(): number {
    return this.sockets.size;
  }

  public getSocketRecord(socketId: string): Readonly<SocketControlBucketsRecord> | undefined {
    return this.sockets.get(socketId);
  }
}

export const defaultControlRateLimiter = new ControlRateLimiter();

export function cleanupControlRateLimit(socketId: string): void {
  defaultControlRateLimiter.cleanupSocket(socketId);
}
