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
