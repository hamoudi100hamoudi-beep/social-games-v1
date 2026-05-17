export interface GameState {
  status: 'waiting' | 'playing' | 'results';
  currentDrawerId: string | null;
  currentWord: string | null;
}

export interface Player {
  id: string; // Socket ID
  name: string;
  avatar: string;
  roomId: string | null;
}

export interface Room {
  id: string;
  players: Player[];
  gameState: GameState;
}
