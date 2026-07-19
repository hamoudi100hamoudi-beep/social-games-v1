export type SoundEvent =
  | 'playerJoin'
  | 'playerLeave'
  | 'correctGuessSelf'
  | 'correctGuessOther'
  | 'wordSelectionShow'
  | 'hintShow'
  | 'roundStart'
  | 'roundEnd'
  | 'buttonClick'
  | 'chatMessage'
  | 'notification';

export interface SoundSettings {
  path: string;
  volume: number;
  delayMs: number;
  cooldown: number;
  enabled: boolean;
}

export const SOUND_CONFIG: Record<SoundEvent, SoundSettings> = {
  playerJoin: {
    path: '/sounds/room/join.wav',
    volume: 1.0,
    delayMs: 0,
    cooldown: 500,
    enabled: true,
  },
  playerLeave: {
    path: '/sounds/room/leave.wav',
    volume: 1.0,
    delayMs: 80,
    cooldown: 500,
    enabled: true,
  },
  correctGuessSelf: {
    path: '/sounds/game/correct-self.wav',
    volume: 1.0,
    delayMs: 120,
    cooldown: 200,
    enabled: true,
  },
  correctGuessOther: {
    path: '/sounds/game/correct-other.wav',
    volume: 0.9,
    delayMs:120,
    cooldown: 200,
    enabled: true,
  },
  wordSelectionShow: {
    path: '/sounds/game/word-selection.wav',
    volume: 1.0,
    delayMs: 0,
    cooldown: 200,
    enabled: true,
  },
  hintShow: {
    path: '/sounds/game/hint.wav',
    volume: 1.0,
    delayMs: 80,
    cooldown: 200,
    enabled: true,
  },
  roundStart: {
    path: '/sounds/game/round-start.wav',
    volume: 1.0,
    delayMs: 0,
    cooldown: 200,
    enabled: true,
  },
  roundEnd: {
    path: '/sounds/game/round-end.wav',
    volume: 1.0,
    delayMs: 80,
    cooldown: 200,
    enabled: true,
  },
  buttonClick: {
    path: '/sounds/ui/button.wav',
    volume: 0.6,
    delayMs: 0,
    cooldown: 50,
    enabled: true,
  },
  chatMessage: {
    path: '/sounds/ui/chat.wav',
    volume: 1.0,
    delayMs: 0,
    cooldown: 100,
    enabled: true,
  },
  notification: {
    path: '/sounds/ui/notification.wav',
    volume: 1.0,
    delayMs: 0,
    cooldown: 200,
    enabled: true,
  },
};
