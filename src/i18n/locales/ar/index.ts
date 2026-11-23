import { arCommon } from './common';
import { arMiniBoard } from './miniBoard';
import { arModals } from './modals';
import { arWordChoice } from './wordChoice';
import type { enResources } from '../en';
import type { DeepLocaleSchema } from '../../types';

export const arResources = {
  common: arCommon,
  modals: arModals,
  miniBoard: arMiniBoard,
  wordChoice: arWordChoice,
} satisfies DeepLocaleSchema<typeof enResources>;
