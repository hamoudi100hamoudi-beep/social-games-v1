import type { enCommon } from '../en/common';
import type { DeepLocaleSchema } from '../../types';

export const arCommon = {
  languageSelector: {
    ariaLabel: 'اختر اللغة',
    auto: 'تلقائي',
    ar: 'العربية',
    en: 'English',
  },
} satisfies DeepLocaleSchema<typeof enCommon>;
