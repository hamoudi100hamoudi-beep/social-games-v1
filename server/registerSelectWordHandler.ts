export interface SelectWordDependencies {
  roomManager: any;
}

/**
 * Production handler for select_word enforcing strict payload validation
 * before invoking RoomManager.startGameRound.
 */
export function handleSelectWord(
  socket: any,
  data: any,
  deps: SelectWordDependencies
): void {
  try {
    const { roomManager } = deps;
    const player = roomManager.getPlayer(socket.id);
    if (!player || !player.roomId) return;

    // Strict payload validation:
    // payload must be an object containing a valid, non-empty string in the `word` property
    if (!data || typeof data !== 'object' || typeof data.word !== 'string') {
      return; // Silently reject null, undefined, non-objects, missing word, numbers, objects, arrays
    }

    const trimmedWord = data.word.trim();
    if (trimmedWord.length === 0) {
      return; // Silently reject empty or whitespace-only words
    }

    roomManager.startGameRound(player.roomId, trimmedWord, socket.id);
  } catch (err) {
    console.error("Error in handleSelectWord:", err);
  }
}

/**
 * Registers the select_word event listener on a socket using the shared production handler.
 */
export function registerSelectWordHandler(
  socket: any,
  deps: SelectWordDependencies
): void {
  socket.on('select_word', (data: any) => {
    handleSelectWord(socket, data, deps);
  });
}
