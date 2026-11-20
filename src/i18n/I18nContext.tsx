import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getDict,
  getLocaleTag,
  LANGUAGE_OPTIONS,
  resolveInitialLanguage,
  setActiveLanguage,
  subscribeLanguage,
  SupportedLanguage,
  TranslationSchema,
} from './index';

interface I18nContextValue {
  lang: SupportedLanguage;
  localeTag: string;
  dict: TranslationSchema;
  setLanguage: (lang: SupportedLanguage) => void;
  options: typeof LANGUAGE_OPTIONS;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function syncDocumentMetadata(lang: SupportedLanguage, dict: TranslationSchema): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = getLocaleTag(lang);
  document.title = dict.meta.pageTitle;

  const setMetaContent = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) {
      el.setAttribute('content', content);
    }
  };

  setMetaContent('meta[name="description"]', dict.meta.pageDescription);
  setMetaContent('meta[property="og:title"]', dict.meta.pageTitle);
  setMetaContent('meta[property="og:description"]', dict.meta.pageDescription);
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<SupportedLanguage>(() =>
    resolveInitialLanguage()
  );

  useEffect(() => {
    setActiveLanguage(lang, false);
    const unsubscribe = subscribeLanguage((nextLang) => {
      setLangState(nextLang);
    });
    return unsubscribe;
  }, [lang]);

  const dict = useMemo(() => getDict(lang), [lang]);
  const localeTag = useMemo(() => getLocaleTag(lang), [lang]);

  useEffect(() => {
    syncDocumentMetadata(lang, dict);
  }, [lang, dict]);

  const handleSetLanguage = useCallback((nextLang: SupportedLanguage) => {
    setActiveLanguage(nextLang, true);
    setLangState(nextLang);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      localeTag,
      dict,
      setLanguage: handleSetLanguage,
      options: LANGUAGE_OPTIONS,
    }),
    [lang, localeTag, dict, handleSetLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const fallbackLang = resolveInitialLanguage();
    return {
      lang: fallbackLang,
      localeTag: getLocaleTag(fallbackLang),
      dict: getDict(fallbackLang),
      setLanguage: setActiveLanguage,
      options: LANGUAGE_OPTIONS,
    };
  }
  return ctx;
}
