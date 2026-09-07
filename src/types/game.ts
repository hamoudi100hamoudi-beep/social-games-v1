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
  isFastAllGuessed?: boolean;
  noOneGuessedVariant?: 1 | 2;
  drawingStartTime?: number;
  drawHistory?: {event: string, data: any}[];
  reports?: string[]; // Player persistentIds/socketIds who reported the current turn
  isDrawingActive?: boolean; // GATEKEEPER FLAG FOR UNDO SAFETY
  lastStrokeIndex?: number | null;
  redoStack?: any[];
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
  maxPlayers?: number;
  winningScore?: number;
  theme?: string;
  isFreeDraw?: boolean;
  activeDrawers?: string[];
}

export interface RoomConfig {
  id: string;
  name: string;
  tag: string;
  theme: string;
  maxPlayers: number;
  winningScore: number;
  isFreeDraw?: boolean;
}

export const ROOM_PRESETS: RoomConfig[] = [
  {
    id: 'General #Test',
    name: 'General',
    tag: '#Test',
    theme: 'General',
    maxPlayers: 5,
    winningScore: 30,
  },
  {
    id: 'General #10P',
    name: 'General',
    tag: '#10P',
    theme: 'General',
    maxPlayers: 10,
    winningScore: 120,
  },
  {
    id: 'Free Draw',
    name: 'Free Draw',
    tag: '',
    theme: 'Free Draw',
    maxPlayers: 5,
    winningScore: 0,
    isFreeDraw: true,
  },
];

export function getRoomConfig(roomId: string): RoomConfig {
  const normalized = (roomId || '').trim().toLowerCase();
  const found = ROOM_PRESETS.find(
    (r) => r.id.toLowerCase() === normalized
  );
  if (found) return found;

  if (normalized === 'general' || normalized === 'general #test' || normalized === 'test' || normalized === '#test') {
    return ROOM_PRESETS[0];
  }

  if (
    normalized === '10p' ||
    normalized === '#10p' ||
    normalized === 'p10' ||
    normalized === '#p10' ||
    normalized.includes('10p') ||
    normalized.includes('p10')
  ) {
    return ROOM_PRESETS[1];
  }

  if (
    normalized === 'free' ||
    normalized === '#free' ||
    normalized === 'freedraw' ||
    normalized.includes('free') ||
    normalized.includes('حر')
  ) {
    return ROOM_PRESETS[2];
  }

  return {
    id: roomId,
    name: roomId,
    tag: '#Custom',
    theme: 'General',
    maxPlayers: 5,
    winningScore: 30,
  };
}
