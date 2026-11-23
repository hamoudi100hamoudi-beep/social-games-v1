import type { enModals } from '../en/modals';
import type { DeepPluralLocaleSchema } from '../../types';

export const arModals = {
  exit: {
    question: 'هل تريد مغادرة اللعبة؟',
  },
  skip: {
    question: 'هل تريد تجاوز دورك في الرسم؟',
  },
  report: {
    question: 'هل أنت متأكد من الإبلاغ عن هذه الرسمة؟',
  },
  afk: {
    question: 'هل ما زلت هنا؟',
    actionHint: 'اضغط موافق للاستمرار في اللعب',
    disconnectCountdown_zero: 'سيتم فصل الاتصال بعد: <val>{{count}}</val> ثوانٍ',
    disconnectCountdown_one: 'سيتم فصل الاتصال بعد: ثانية واحدة',
    disconnectCountdown_two: 'سيتم فصل الاتصال بعد: ثانيتين',
    disconnectCountdown_few: 'سيتم فصل الاتصال بعد: <val>{{count}}</val> ثوانٍ',
    disconnectCountdown_many: 'سيتم فصل الاتصال بعد: <val>{{count}}</val> ثانية',
    disconnectCountdown_other: 'سيتم فصل الاتصال بعد: <val>{{count}}</val> ثانية',
  },
  profile: {
    selfAccount: 'هذا هو حسابك الشخصي',
    block: 'حظر',
    unblock: 'إلغاء الحظر',
    votekick: 'تصويت للطرد',
    removeVote: 'إلغاء التصويت',
  },
  alerts: {
    cooldown: {
      message: 'لقد قمت بالتصويت مؤخرًا. يرجى الانتظار للمحاولة مرة أخرى.',
    },
    kicked: {
      message: 'تم طردك من هذه الغرفة بناءً على تصويت اللاعبين الآخرين.',
    },
    nicknameTaken: {
      message: 'يوجد شخص آخر في الغرفة بنفس الاسم، غيّره لتتمكن من الدخول.',
    },
    roomFull: {
      message: 'هذه الغرفة ممتلئة بالكامل.',
    },
    serverFull: {
      message: 'بلغ الخادم طاقته الاستيعابية القصوى حاليًا، يرجى المحاولة بعد قليل.',
    },
    joinTimeout: {
      message: 'تعذر الاتصال بالغرفة في الوقت المحدد، يرجى المحاولة مرة أخرى.',
    },
  },
  customEmoji: {
    subtitle: 'أضف إيموجيك الخاص من كيبورد الهاتف 🎨',
    pickPrompt: 'اختر إيموجي',
    placeholder: 'اضغط هنا واستخدم كيبورد الإيموجي...',
    invalidError: 'الرجاء إدخال إيموجي من كيبورد الهاتف 🎨',
    submitButton: 'إضافة للإيموجيات',
  },
  colorWheel: {
    compareTooltip: 'مقارنة اللون: انقر على النصف الأول لاسترجاع اللون السابق',
    revertTooltip: 'استرجاع اللون السابق',
    currentTooltip: 'اللون المختار حاليًا',
    opacity: 'الكثافة',
    saveTooltip: 'حفظ اللون الحالي في اللوحة',
    save: 'حفظ',
    deleteTooltip: 'حذف اللون المحدد',
    deleteSelectedTooltip: 'حذف اللون المحدد ({{color}})',
    savedColors: 'الألوان المحفوظة',
    savedCount_zero: '{{count}}/{{max}} لون',
    savedCount_one: '{{count}}/{{max}} لون',
    savedCount_two: '{{count}}/{{max}} لون',
    savedCount_few: '{{count}}/{{max}} ألوان',
    savedCount_many: '{{count}}/{{max}} لونًا',
    savedCount_other: '{{count}}/{{max}} لون',
    emptyHint: 'اضغط على "حفظ" لإضافة ألوانك المفضلة هنا',
  },
  connection: {
    disconnectedTitle: 'انقطع الاتصال بالخادم',
    reconnectedTitle: 'عاد الاتصال',
    prolongedDisconnect: 'تعذر استعادة الاتصال حتى الآن. يرجى التحقق من اتصالك بالإنترنت.',
    reconnecting: 'نحاول إعادة الاتصال تلقائيًا...',
    rejoining: 'جارٍ إعادة الانضمام إلى الغرفة...',
    returnToLobby: 'العودة إلى الردهة',
  },
} satisfies DeepPluralLocaleSchema<typeof enModals>;
