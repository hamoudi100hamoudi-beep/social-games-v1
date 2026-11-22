/// <reference types="vite/client" />
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { arResources } from './locales/ar';
import { enResources } from './locales/en';
import {
  getStoredLanguageMode,
  resolveLanguage,
  saveLanguageMode,
  syncDocumentLanguage,
} from './languageDetector';
import type { AppLanguage, LanguageMode } from './types';

let currentLanguageMode: LanguageMode = getStoredLanguageMode();
const modeListeners = new Set<(mode: LanguageMode) => void>();

const initialLanguage = resolveLanguage(currentLanguageMode);

const isDev = Boolean(import.meta.env?.DEV);

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: enResources,
      ar: arResources,
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    supportedLngs: ['ar', 'en'],
    defaultNS: 'common',
    ns: ['common'],
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
    saveMissing: isDev,
    missingKeyHandler: isDev
      ? (lngs, ns, key) => {
          console.warn(
            `[i18n] Missing translation key "${ns}:${key}" for [${lngs.join(', ')}]`
          );
        }
      : undefined,
  });
}

syncDocumentLanguage(initialLanguage);

export function getLanguageMode(): LanguageMode {
  return currentLanguageMode;
}

export function getResolvedLanguage(): AppLanguage {
  return i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
}

export function setLanguageMode(mode: LanguageMode): AppLanguage {
  currentLanguageMode = mode;
  saveLanguageMode(mode);

  const nextLanguage = resolveLanguage(mode);
  if (i18n.resolvedLanguage !== nextLanguage) {
    void i18n.changeLanguage(nextLanguage);
  }
  syncDocumentLanguage(nextLanguage);

  modeListeners.forEach((listener) => listener(mode));
  return nextLanguage;
}

export function subscribeLanguageMode(
  listener: (mode: LanguageMode) => void
): () => void {
  modeListeners.add(listener);
  return () => {
    modeListeners.delete(listener);
  };
}

export default i18n;
