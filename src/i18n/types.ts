import type { enResources } from './locales/en';

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_MODES = ['auto', 'ar', 'en'] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const RTL_LANGUAGES: ReadonlySet<AppLanguage> = new Set(['ar']);

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

type PluralBaseKey<T> = {
  [K in keyof T & string]: K extends `${infer Base}_${PluralSuffix}` ? Base : never;
}[keyof T & string];

export type DeepLocaleSchema<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepLocaleSchema<T[K]>;
};

export type DeepPluralLocaleSchema<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepPluralLocaleSchema<T[K]>;
} & (PluralBaseKey<T> extends never
  ? unknown
  : { readonly [P in `${PluralBaseKey<T>}_${PluralSuffix}`]?: string });

export type AppTranslationResources = DeepLocaleSchema<typeof enResources>;
export type AppNamespace = keyof AppTranslationResources;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    returnNull: false;
    resources: AppTranslationResources;
  }
}
