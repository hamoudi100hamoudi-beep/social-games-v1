import type { enWordChoice } from '../en/wordChoice';
import type { DeepLocaleSchema } from '../../types';

export const arWordChoice = {
  title: 'حان دورك!',
  prompt: 'اختر كلمة لترسمها',
  drawButton: 'ارسم',
  orDivider: 'أو',
} satisfies DeepLocaleSchema<typeof enWordChoice>;
