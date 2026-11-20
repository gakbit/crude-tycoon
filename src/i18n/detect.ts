import { LANGUAGE_OPTIONS, SupportedLanguage } from './types';

export const LANGUAGE_STORAGE_KEY = 'crude_tycoon_lang_v1';

const SUPPORTED_LANGUAGE_SET = new Set<string>(
  LANGUAGE_OPTIONS.map((opt) => opt.code)
);

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGE_SET.has(value);
}

/**
 * Pure locale matcher checking browser language tags in priority order
 * using primary ISO-639-1 subtags (e.g. 'de-AT' -> 'de', 'zh-Hans-CN' -> 'zh').
 * Unrecognized locales cleanly fall back to 'en'.
 */
export function detectBrowserLanguage(
  languages?: readonly string[],
  fallbackLanguage?: string
): SupportedLanguage {
  const candidates: string[] = [];
  if (Array.isArray(languages)) {
    for (const item of languages) {
      if (typeof item === 'string' && item.trim()) {
        candidates.push(item.trim());
      }
    }
  }
  if (typeof fallbackLanguage === 'string' && fallbackLanguage.trim()) {
    candidates.push(fallbackLanguage.trim());
  }

  for (const rawTag of candidates) {
    const normalized = rawTag.toLowerCase().replace(/_/g, '-');
    const primary = normalized.split('-')[0];
    if (isSupportedLanguage(primary)) {
      return primary;
    }
  }

  return 'en';
}

export function loadStoredLanguage(): SupportedLanguage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveStoredLanguage(lang: SupportedLanguage): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function resolveInitialLanguage(): SupportedLanguage {
  const stored = loadStoredLanguage();
  if (stored) {
    return stored;
  }
  if (typeof navigator !== 'undefined') {
    return detectBrowserLanguage(navigator.languages, navigator.language);
  }
  return 'en';
}

let activeLanguage: SupportedLanguage = resolveInitialLanguage();
const listeners = new Set<(lang: SupportedLanguage) => void>();

export function getActiveLanguage(): SupportedLanguage {
  return activeLanguage;
}

export function setActiveLanguage(
  lang: SupportedLanguage,
  persist: boolean = true
): void {
  if (!isSupportedLanguage(lang)) return;
  const changed = activeLanguage !== lang;
  activeLanguage = lang;
  if (persist) {
    saveStoredLanguage(lang);
  }
  if (changed) {
    listeners.forEach((listener) => listener(lang));
  }
}

export function subscribeLanguage(
  listener: (lang: SupportedLanguage) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = params[key];
    return val !== undefined && val !== null ? String(val) : match;
  });
}
