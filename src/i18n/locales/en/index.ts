import { enCommon } from './common';
import { enEvents } from './events';
import { enLobby } from './lobby';
import { enMiniBoard } from './miniBoard';
import { enModals } from './modals';
import { enWordChoice } from './wordChoice';

export const enResources = {
  common: enCommon,
  events: enEvents,
  lobby: enLobby,
  modals: enModals,
  miniBoard: enMiniBoard,
  wordChoice: enWordChoice,
} as const;
