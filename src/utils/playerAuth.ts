import { safeLocalStorage } from './storage';

/**
 * Retrieves or initializes the persistent player identity and cryptographic reconnect secret.
 * 
 * - playerId (persistentId): The public identifier used for UI slots, scores, and turn queues.
 * - reconnectSecret: A 192-bit cryptographically strong secret token used ONLY for proving ownership
 *   during room join/reconnection. Never shared with other clients or exposed in public room state.
 */
export function getPlayerIdentity(): { playerId: string; reconnectSecret: string } {
  if (typeof window === 'undefined') {
    return { playerId: '', reconnectSecret: '' };
  }

  let playerId = safeLocalStorage.getItem('gartic_player_id');
  if (!playerId) {
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.getRandomValues === 'function') {
      const idBytes = new Uint8Array(12);
      window.crypto.getRandomValues(idBytes);
      playerId = 'usr-' + Array.from(idBytes, b => b.toString(16).padStart(2, '0')).join('');
    } else {
      playerId = 'usr-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
    }
    safeLocalStorage.setItem('gartic_player_id', playerId);
  }

  let reconnectSecret = safeLocalStorage.getItem('gartic_reconnect_secret');
  if (!reconnectSecret) {
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.getRandomValues === 'function') {
      const secBytes = new Uint8Array(24); // 192 bits of entropy
      window.crypto.getRandomValues(secBytes);
      reconnectSecret = Array.from(secBytes, b => b.toString(16).padStart(2, '0')).join('');
    } else {
      reconnectSecret = 'sec-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
    }
    safeLocalStorage.setItem('gartic_reconnect_secret', reconnectSecret);
  }

  return { playerId, reconnectSecret };
}
