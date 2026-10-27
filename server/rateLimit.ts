export function checkRateLimit(
  limitsMap: Map<string, number[]>,
  key: string,
  maxMessages: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = limitsMap.get(key) || [];
  const recent = timestamps.filter(ts => now - ts < windowMs);
  if (recent.length >= maxMessages) {
    return false; // Rate limited
  }
  recent.push(now);
  limitsMap.set(key, recent);
  return true; // Allowed
}
