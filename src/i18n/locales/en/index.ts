import { enCommon } from './common';
import { enEvents } from './events';
import { enMiniBoard } from './miniBoard';
import { enModals } from './modals';
import { enWordChoice } from './wordChoice';

export const enResources = {
  common: enCommon,
  events: enEvents,
  modals: enModals,
  miniBoard: enMiniBoard,
  wordChoice: enWordChoice,
} as const;
