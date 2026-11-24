import type { enCommon } from '../en/common';
import type { DeepLocaleSchema } from '../../types';

export const arCommon = {
  languageSelector: {
    ariaLabel: 'اختر اللغة',
    auto: 'تلقائي',
    ar: 'العربية',
    en: 'English',
  },
  actions: {
    yes: 'نعم',
    no: 'لا',
    ok: 'موافق',
    close: 'إغلاق',
  },
  units: {
    points: '{{count}} نقطة',
  },
} satisfies DeepLocaleSchema<typeof enCommon>;
