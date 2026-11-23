import type { enMiniBoard } from '../en/miniBoard';
import type { DeepPluralLocaleSchema } from '../../types';

export const arMiniBoard = {
  freeDraw: {
    description: 'ارسم ما تشاء بحرية. بدون مؤقت وبدون كلمة محددة.',
    startButton: 'ابدأ الرسم',
  },
  waiting: {
    message: 'في انتظار اللاعبين',
  },
  choosing: {
    turnOf: 'حان دور',
  },
  roundEnd: {
    defaultDrawer: 'الرسام',
    skippedSelf: 'لقد تخطيت الدور',
    skippedOther: 'قام <drawer>{{drawerName}}</drawer> بتخطي الدور',
    turnLostSelf: 'لقد خسرت دورك :(',
    turnLostOther: 'خسر <drawer>{{drawerName}}</drawer> الدور',
    canceledScore: 'لقد تم إلغاء نقاط الدور',
    intervalSubtitle: 'خذ قسطًا من الراحة',
    allGuessed: 'أصاب الجميع الإجابة!',
    nobodyGuessed: 'لم يُصب أحد الإجابة :(',
    theAnswerWas: 'كانت الإجابة:',
  },
  podium: {
    restOfLeaderboard: 'بقية قائمة المتصدرين',
    points_zero: '{{count}} نقطة',
    points_one: 'نقطة واحدة',
    points_two: 'نقطتان',
    points_few: '{{count}} نقاط',
    points_many: '{{count}} نقطة',
    points_other: '{{count}} نقطة',
    medalAlt: {
      first: 'المركز الأول',
      second: 'المركز الثاني',
      third: 'المركز الثالث',
    },
  },
} satisfies DeepPluralLocaleSchema<typeof enMiniBoard>;
