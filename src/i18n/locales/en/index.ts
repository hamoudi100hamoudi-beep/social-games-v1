import { enCommon } from './common';
import { enMiniBoard } from './miniBoard';
import { enModals } from './modals';
import { enWordChoice } from './wordChoice';

export const enResources = {
  common: enCommon,
  modals: enModals,
  miniBoard: enMiniBoard,
  wordChoice: enWordChoice,
} as const;
