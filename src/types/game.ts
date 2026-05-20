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
  roundEndReason?: 'timeout' | 'all_guessed' | 'drawer_left' | 'turn_lost' | 'skipped';
  roundEndWord?: string;
}

export interface Player {
  id: string; // Socket ID
  name: string;
  avatar: string;
  roomId: string | null;
  score: number;
  wins: number;
}

export interface Room {
  id: string;
  players: Player[];
  gameState: GameState;
  timer?: NodeJS.Timeout; // For backend interval reference
}
