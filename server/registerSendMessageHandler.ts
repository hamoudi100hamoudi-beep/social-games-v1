export type CheckRateLimitFn = (
  limitsMap: Map<string, number[]>,
  key: string,
  maxMessages: number,
  windowMs: number
) => boolean;

const defaultChatLimits = new Map<string, number[]>();

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

export interface SendMessageDependencies {
  io: any;
  roomManager: any;
  chatLimits?: Map<string, number[]>;
  checkRateLimit?: CheckRateLimitFn;
  normalizeArabic: (str: string) => string;
}

/**
 * Production handler for send_message enforcing strict payload validation,
 * rate limiting, anti-cheat word leak checks, and broadcasting.
 */
export function handleSendMessage(
  socket: any,
  data: any,
  deps: SendMessageDependencies
): void {
  try {
    const { io, roomManager, chatLimits = defaultChatLimits, checkRateLimit = defaultCheckRateLimit, normalizeArabic } = deps;
    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    // Apply rate limit accounting first
    const rateLimitKey = player.persistentId || socket.id;
    if (checkRateLimit && !checkRateLimit(chatLimits, rateLimitKey, 5, 2000)) {
      return;
    }

    // Strict payload validation
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.text !== 'string') {
      return;
    }

    const trimmedText = data.text.trim();
    if (trimmedText.length === 0 || trimmedText.length > 250) {
      return;
    }

    const room = roomManager.getRoom(player.roomId);
    if (room && room.gameState.status === 'DRAWING' && room.gameState.currentWord) {
       const guess = trimmedText.toLowerCase();
       const target = room.gameState.currentWord.toLowerCase().trim();
       const guessNorm = normalizeArabic(guess);
       const targetNorm = normalizeArabic(target);
       
       if (guess && target && (guess.includes(target) || guessNorm.includes(targetNorm))) {
          socket.emit('receive_message', {
            id: 'sys-cheat-' + Date.now(),
            text: '🚫 لا يمكنك كتابة الإجابة في الدردشة أثناء الرسم!',
            type: 'warning'
          });
          return;
       }
    }

    const msg = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: trimmedText,
      sender: player.name,
      senderId: socket.id,
      avatar: player.avatar,
      type: 'message'
    };
    roomManager.saveChatMessage(player.roomId, msg);
    if (io) {
      io.to(player.roomId).emit('receive_message', msg);
    }
  } catch (err) {
    console.error("Error in handleSendMessage:", err);
  }
}

/**
 * Registers the send_message event listener on a socket using the shared production handler.
 */
export function registerSendMessageHandler(
  socket: any,
  deps: SendMessageDependencies
): void {
  socket.on('send_message', (data: any) => {
    handleSendMessage(socket, data, deps);
  });
}
