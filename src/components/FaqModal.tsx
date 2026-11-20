/**
 * Frequently Asked Questions modal explaining Crude Tycoon mechanics in the active language.
 */

import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSelector } from './LanguageSelector';

interface FaqModalProps {
  onClose: () => void;
}

export const FaqModal: React.FC<FaqModalProps> = ({ onClose }) => {
  const { dict } = useI18n();
  const s = dict.faqModal.sections;

  const faqSections = [
    { title: s.goalTitle, items: s.goalItems },
    { title: s.drillingTitle, items: s.drillingItems },
    { title: s.analystTitle, items: s.analystItems },
    { title: s.sabotageTitle, items: s.sabotageItems },
    { title: s.tankerTitle, items: s.tankerItems },
    { title: s.bankTitle, items: s.bankItems },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/85 p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[780px] overflow-hidden my-auto">
        <div className="flex items-center justify-between border-b border-[#354150] bg-[#161C24] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-[#E59A24]" />
            <div>
              <h2
                id="faq-modal-title"
                className="font-display text-lg font-bold text-[#F3F6FA]"
              >
                {dict.faqModal.title}
              </h2>
              <p className="text-[11px] text-[#9FB0C2]">
                {dict.faqModal.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.faqModal.close}
            className="retro-button bg-[#232B35] p-1.5 text-[#CBD5E1] hover:bg-[#2F3A48] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-4">
          <div className="border border-[#2B3543] bg-[#161C24] p-3">
            <LanguageSelector showHint />
          </div>

          <div className="divide-y divide-[#2B3543] border border-[#2B3543] bg-[#13181F]">
            {faqSections.map((sec) => (
              <div key={sec.title} className="p-4 space-y-1.5">
                <h3 className="text-sm font-bold text-[#E59A24]">{sec.title}</h3>
                <div className="space-y-1">
                  {sec.items.map((line) => (
                    <p
                      key={line}
                      className="text-xs leading-relaxed text-[#CBD5E1]"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            <div className="p-4 space-y-1.5">
              <h3 className="text-sm font-bold text-[#E59A24]">
                {s.difficultiesTitle}
              </h3>
              <p className="whitespace-pre-line text-xs leading-relaxed text-[#CBD5E1]">
                {s.difficultiesSummary}
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="retro-button bg-[#E59A24] px-5 py-2 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
            >
              {dict.faqModal.closeFooter}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
