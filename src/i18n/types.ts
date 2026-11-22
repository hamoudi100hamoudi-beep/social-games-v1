import type { enResources } from './locales/en';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_MODES = ['auto', 'ar', 'en'] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const RTL_LANGUAGES: ReadonlySet<AppLanguage> = new Set(['ar']);

export type DeepLocaleSchema<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepLocaleSchema<T[K]>;
};

export type AppTranslationResources = DeepLocaleSchema<typeof enResources>;
export type AppNamespace = keyof AppTranslationResources;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    returnNull: false;
    resources: AppTranslationResources;
  }
}
