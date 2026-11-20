import React from 'react';
import { Globe } from 'lucide-react';
import { SupportedLanguage } from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface LanguageSelectorProps {
  compact?: boolean;
  showHint?: boolean;
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  compact = false,
  showHint = false,
  className = '',
}) => {
  const { lang, setLanguage, dict, options } = useI18n();

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <label
          htmlFor="language-selector-control"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C3CFD9] whitespace-nowrap"
        >
          <Globe className="h-3.5 w-3.5 text-[#E59A24] shrink-0" />
          <span>{dict.meta.languageLabel}</span>
        </label>
        <select
          id="language-selector-control"
          aria-label={dict.meta.languageLabel}
          value={lang}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          className={`min-h-[40px] border border-[#354150] bg-[#12161B] text-[#F3F6FA] focus:border-[#E59A24] focus:outline-none cursor-pointer ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs sm:text-sm'
          }`}
        >
          {options.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.nativeLabel} ({opt.shortCode})
            </option>
          ))}
        </select>
      </div>
      {showHint && (
        <p className="text-[11px] text-[#8D9CAD]">{dict.meta.languageHint}</p>
      )}
    </div>
  );
};
