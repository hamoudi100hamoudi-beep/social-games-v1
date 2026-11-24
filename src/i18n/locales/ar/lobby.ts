import type { enLobby } from '../en/lobby';
import type { DeepLocaleSchema } from '../../types';

export const arLobby = {
  home: {
    nicknameLabel: 'الاسم المستعار',
    nicknamePlaceholder: 'أدخل اسمك...',
    roomsButton: 'الغرف',
  },
  avatarCarousel: {
    prevAria: 'الأفاتار السابق',
    nextAria: 'الأفاتار التالي',
    openGridAria: 'اختر أفاتار من القائمة',
  },
  avatarGrid: {
    title: 'اختر أفاتار',
    addCustomEmoji: 'أضف إيموجي مخصص',
    selectAvatar: 'اختر الأفاتار {{emoji}}',
  },
  rooms: {
    backAria: 'العودة إلى الرئيسية',
    newRoom: 'غرفة جديدة',
    newRoomUnavailable: 'هذه الميزة غير متوفرة بعد',
  },
  roomInfo: {
    play: 'العب',
    players: 'اللاعبون',
    theme: 'الموضوع',
    toWin: 'للفوز',
    open: 'مفتوح',
    points: '{{count}} نقطة',
  },
} satisfies DeepLocaleSchema<typeof enLobby>;
