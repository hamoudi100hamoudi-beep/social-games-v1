import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLanguageMode,
  setLanguageMode,
  subscribeLanguageMode,
} from './index';
import { isRTLLanguage } from './languageDetector';
import type { AppLanguage, AppNamespace, LanguageMode } from './types';

export function useAppTranslation(ns: AppNamespace = 'common') {
  const { t, i18n } = useTranslation(ns);
  const [languageMode, setModeState] = useState<LanguageMode>(() =>
    getLanguageMode()
  );

  useEffect(() => {
    setModeState(getLanguageMode());
    return subscribeLanguageMode(setModeState);
  }, []);

  const currentLanguage: AppLanguage =
    i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const isRTL = isRTLLanguage(currentLanguage);

  const changeLanguageMode = useCallback((mode: LanguageMode) => {
    setLanguageMode(mode);
  }, []);

  return {
    t,
    i18n,
    languageMode,
    currentLanguage,
    isRTL,
    changeLanguageMode,
  };
}
