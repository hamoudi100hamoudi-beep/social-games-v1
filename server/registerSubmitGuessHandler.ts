export type CheckRateLimitFn = (
  limitsMap: Map<string, number[]>,
  key: string,
  maxMessages: number,
  windowMs: number
) => boolean;

const defaultGuessLimits = new Map<string, number[]>();

export const defaultCheckRateLimit: CheckRateLimitFn = (
  limitsMap: Map<string, number[]>,
  key: string,
  maxMessages: number,
  windowMs: number
): boolean => {
  const now = Date.now();
  const timestamps = limitsMap.get(key) || [];
  const recent = timestamps.filter(ts => now - ts < windowMs);
  if (recent.length >= maxMessages) {
    return false;
  }
  recent.push(now);
  limitsMap.set(key, recent);
  return true;
};

export interface SubmitGuessDependencies {
  roomManager: any;
  guessLimits?: Map<string, number[]>;
  checkRateLimit?: CheckRateLimitFn;
}

/**
 * Production handler for submit_guess enforcing strict payload validation
 * and rate limiting before invoking RoomManager.submitGuess.
 */
export function handleSubmitGuess(
  socket: any,
  data: any,
  deps: SubmitGuessDependencies
): void {
  try {
    const { roomManager, guessLimits = defaultGuessLimits, checkRateLimit = defaultCheckRateLimit } = deps;
    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    // Apply rate limit accounting first to prevent invalid payloads from bypassing rate limits
    const rateLimitKey = player.persistentId || socket.id;
    if (checkRateLimit && !checkRateLimit(guessLimits, rateLimitKey, 5, 2000)) {
      return; // Ignore if rate limited
    }

    // Strict payload validation:
    // payload must be an object containing a valid, non-empty string in the `guess` property
    if (!data || typeof data !== 'object' || typeof data.guess !== 'string') {
      return; // Silently reject null, undefined, non-objects, missing guess, numbers, objects, arrays
    }

    const trimmedGuess = data.guess.trim();
    if (trimmedGuess.length === 0 || trimmedGuess.length > 250) {
      return; // Silently reject empty, whitespace-only, or overly long guesses
    }

    roomManager.submitGuess(player.roomId, socket.id, trimmedGuess);
  } catch (err) {
    console.error("Error in handleSubmitGuess:", err);
  }
}

/**
 * Registers the submit_guess event listener on a socket using the shared production handler.
 */
export function registerSubmitGuessHandler(
  socket: any,
  deps: SubmitGuessDependencies
): void {
  socket.on('submit_guess', (data: any) => {
    handleSubmitGuess(socket, data, deps);
  });
}
