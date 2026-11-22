import { arCommon } from './common';
import type { enResources } from '../en';
import type { DeepLocaleSchema } from '../../types';

export const arResources = {
  common: arCommon,
} satisfies DeepLocaleSchema<typeof enResources>;
