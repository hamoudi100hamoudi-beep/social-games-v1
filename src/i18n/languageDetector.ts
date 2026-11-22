import { safeLocalStorage } from '../utils/storage';
import {
  LANGUAGE_MODES,
  RTL_LANGUAGES,
  type AppLanguage,
  type LanguageMode,
} from './types';

export const LANGUAGE_MODE_STORAGE_KEY = 'drawio_ui_lang_mode';

export function isValidLanguageMode(value: unknown): value is LanguageMode {
  return (
    typeof value === 'string' &&
    (LANGUAGE_MODES as readonly string[]).includes(value)
  );
}

export function detectBrowserLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') {
    return 'en';
  }

  const primary = navigator.languages?.[0] || navigator.language || '';
  const normalized = primary.trim().toLowerCase();

  return normalized.startsWith('ar') ? 'ar' : 'en';
}

export function getStoredLanguageMode(): LanguageMode {
  const stored = safeLocalStorage.getItem(LANGUAGE_MODE_STORAGE_KEY);
  return isValidLanguageMode(stored) ? stored : 'auto';
}

export function saveLanguageMode(mode: LanguageMode): void {
  safeLocalStorage.setItem(LANGUAGE_MODE_STORAGE_KEY, mode);
}

export function resolveLanguage(mode: LanguageMode): AppLanguage {
  if (mode === 'ar' || mode === 'en') {
    return mode;
  }
  return detectBrowserLanguage();
}

export function isRTLLanguage(lang: string | undefined): boolean {
  if (!lang) return false;
  const baseLang = lang.trim().toLowerCase().split(/[-_]/)[0] as AppLanguage;
  return RTL_LANGUAGES.has(baseLang);
}

/**
 * Updates only <html lang="..."> safely.
 * Intentionally does NOT set document.documentElement.dir = "rtl"
 * to preserve fixed room grid (32%/68%), SmoothTimer geometry, and LTR drawing board.
 */
export function syncDocumentLanguage(lang: AppLanguage): void {
  if (typeof document === 'undefined' || !document.documentElement) {
    return;
  }
  document.documentElement.lang = lang;
}
