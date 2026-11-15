export const DEFAULT_DRAW_MAX_PACKETS = 80;
export const DEFAULT_DRAW_PACKET_REFILL_PER_SEC = 35;
export const DEFAULT_DRAW_MAX_WORK_UNITS = 524_288; // 512 KiB
export const DEFAULT_DRAW_WORK_REFILL_PER_SEC = 65_536; // 64 KiB/s

export interface DrawBucketState {
  packetTokens: number;
  workTokens: number;
  lastRefillMs: number;
}

export interface DrawRateLimiterOptions {
  maxPackets?: number;
  packetRefillPerSec?: number;
  maxWorkUnits?: number;
  workRefillPerSec?: number;
}

/**
 * O(1) constant-memory per-socket dual token bucket for draw_binary ingress.
 * Tracks packet count and decoded/payload work units per socket.id without
 * timestamp arrays, periodic sweeps, or background timers.
 */
export class DrawRateLimiter {
  public readonly maxPackets: number;
  public readonly packetRefillPerSec: number;
  public readonly maxWorkUnits: number;
  public readonly workRefillPerSec: number;

  private readonly buckets = new Map<string, DrawBucketState>();

  constructor(options: DrawRateLimiterOptions = {}) {
    this.maxPackets =
      typeof options.maxPackets === 'number' && Number.isFinite(options.maxPackets) && options.maxPackets > 0
        ? options.maxPackets
        : DEFAULT_DRAW_MAX_PACKETS;
    this.packetRefillPerSec =
      typeof options.packetRefillPerSec === 'number' && Number.isFinite(options.packetRefillPerSec) && options.packetRefillPerSec > 0
        ? options.packetRefillPerSec
        : DEFAULT_DRAW_PACKET_REFILL_PER_SEC;
    this.maxWorkUnits =
      typeof options.maxWorkUnits === 'number' && Number.isFinite(options.maxWorkUnits) && options.maxWorkUnits > 0
        ? options.maxWorkUnits
        : DEFAULT_DRAW_MAX_WORK_UNITS;
    this.workRefillPerSec =
      typeof options.workRefillPerSec === 'number' && Number.isFinite(options.workRefillPerSec) && options.workRefillPerSec > 0
        ? options.workRefillPerSec
        : DEFAULT_DRAW_WORK_REFILL_PER_SEC;
  }

  /**
   * Refills tokens lazily in O(1) and atomically attempts to deduct 1 packet
   * and `workUnits` from the socket's bucket.
   */
  public consume(socketId: string, workUnits: number, nowMs: number = Date.now()): boolean {
    if (!socketId || typeof socketId !== 'string') return false;

    const cost = Number.isFinite(workUnits) && workUnits > 0 ? workUnits : 0;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();

    let state = this.buckets.get(socketId);
    if (!state) {
      if (this.maxPackets < 1 || this.maxWorkUnits < cost) {
        return false;
      }
      state = {
        packetTokens: this.maxPackets - 1,
        workTokens: this.maxWorkUnits - cost,
        lastRefillMs: now,
      };
      this.buckets.set(socketId, state);
      return true;
    }

    const elapsedMs = now > state.lastRefillMs ? now - state.lastRefillMs : 0;
    if (elapsedMs > 0) {
      const elapsedSec = elapsedMs / 1000;
      state.packetTokens = Math.min(
        this.maxPackets,
        state.packetTokens + elapsedSec * this.packetRefillPerSec
      );
      state.workTokens = Math.min(
        this.maxWorkUnits,
        state.workTokens + elapsedSec * this.workRefillPerSec
      );
      state.lastRefillMs = now;
    }

    if (state.packetTokens < 1 || state.workTokens < cost) {
      return false;
    }

    state.packetTokens -= 1;
    state.workTokens -= cost;
    return true;
  }

  /**
   * Immediately frees bucket state when a socket disconnects.
   */
  public cleanupSocket(socketId: string): void {
    if (socketId) {
      this.buckets.delete(socketId);
    }
  }

  public clear(): void {
    this.buckets.clear();
  }

  public getTrackedSocketCount(): number {
    return this.buckets.size;
  }

  public getSocketState(socketId: string): Readonly<DrawBucketState> | undefined {
    return this.buckets.get(socketId);
  }
}

export const defaultDrawRateLimiter = new DrawRateLimiter();

export function cleanupDrawRateLimit(socketId: string): void {
  defaultDrawRateLimiter.cleanupSocket(socketId);
}
