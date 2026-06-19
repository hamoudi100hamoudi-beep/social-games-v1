export interface GameState {
  status: 'WAITING' | 'CHOOSING' | 'DRAWING' | 'ROUND_END' | 'PODIUM';
  currentDrawerId: string | null;
  currentWord: string | null;
  timeLeft: number;
  correctGuessers: string[]; // Socket IDs of players who guessed correctly
  turnQueue: string[]; // Order of socket IDs for turns
  wordOptions?: string[]; // Words to choose from for the current drawer
  hintsUsed: number;
  revealedIndices: number[];
  roundEndReason?: 'timeout' | 'all_guessed' | 'drawer_left' | 'turn_lost' | 'skipped' | 'canceled';
  roundEndWord?: string;
  drawHistory?: {event: string, data: any}[];
  reports?: string[]; // Player persistentIds/socketIds who reported the current turn
  isDrawingActive?: boolean; // GATEKEEPER FLAG FOR UNDO SAFETY
  lastStrokeIndex?: number | null;
}

export interface Player {
  id: string; // Socket ID
  name: string;
  avatar: string;
  roomId: string | null;
  score: number;
  wins: number;
  isOffline?: boolean;
  offlineSince?: number;
  persistentId?: string;
  lastActivity?: number;
  afkWarningSent?: boolean;
}

export interface Room {
  id: string;
  players: Player[];
  gameState: GameState;
  timer?: NodeJS.Timeout; // For backend interval reference
  usedWords: string[];
  chatMessages?: any[];
  guessMessages?: any[];
  turnStartScores?: Record<string, number>; // Backup of scores to roll back on report/cancellation
  bannedUsers?: string[];
  votekicks?: Record<string, string[]>;
}
