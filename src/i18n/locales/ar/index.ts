import { arCommon } from './common';
import { arModals } from './modals';
import type { enResources } from '../en';
import type { DeepLocaleSchema } from '../../types';

export const arResources = {
  common: arCommon,
  modals: arModals,
} satisfies DeepLocaleSchema<typeof enResources>;
