/**
 * Save and Load slots modal backed by browser localStorage.
 */

import React from 'react';
import { Save, FolderOpen, Trash2, X } from 'lucide-react';
import { SaveSlotSummary } from '../engine/gameTypes';
import { formatCurrencyI18n, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSelector } from './LanguageSelector';

interface SaveLoadModalProps {
  saveSlots: Array<{
    slotId: string;
    label: string;
    summary: SaveSlotSummary | null;
  }>;
  onSaveSlot: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onClose: () => void;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  saveSlots,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onClose,
}) => {
  const { lang, dict } = useI18n();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/85 p-4"
    >
      <div className="retro-panel w-full max-w-[640px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#354150] bg-[#161C24] px-6 py-4">
          <h2
            id="save-modal-title"
            className="font-display text-lg font-bold text-[#F3F6FA]"
          >
            {dict.saveLoadModal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.saveLoadModal.closeAria}
            className="retro-button bg-[#232B35] p-1.5 text-[#CBD5E1] hover:bg-[#2F3A48] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="border border-[#2B3543] bg-[#161C24] p-3">
            <LanguageSelector showHint />
          </div>

          <p className="text-xs text-[#9FB0C2]">
            {dict.saveLoadModal.subtitle}
          </p>

          <div className="divide-y divide-[#2B3543] border border-[#2B3543] bg-[#13181F]">
            {saveSlots.map((slot) => (
              <div
                key={slot.slotId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-[#F3F6FA]">
                    {slot.label}
                  </div>
                  {slot.summary ? (
                    <div className="font-mono tabular-nums text-[#8D9CAD]">
                      {slot.summary.companyName} ·{' '}
                      {interpolate(dict.saveLoadModal.slotTurnPrefix, {
                        turn: slot.summary.turn,
                        date: slot.summary.dateLabel,
                      })}{' '}
                      · {dict.topBar.netWorth}:{' '}
                      <span className="text-[#E59A24]">
                        {formatCurrencyI18n(slot.summary.netWorth, lang)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[#6F7E8F]">
                      {dict.saveLoadModal.emptySlot}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSaveSlot(slot.slotId)}
                    className="retro-button flex items-center gap-1.5 bg-[#E59A24] px-3 py-1.5 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>
                      {slot.summary
                        ? dict.saveLoadModal.overwrite
                        : dict.saveLoadModal.saveHere}
                    </span>
                  </button>

                  {slot.summary && (
                    <>
                      <button
                        type="button"
                        onClick={() => onLoadSlot(slot.slotId)}
                        className="retro-button flex items-center gap-1.5 bg-[#293544] px-3 py-1.5 text-xs font-semibold text-[#F3F6FA] hover:bg-[#344356] whitespace-nowrap cursor-pointer"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-[#E59A24]" />
                        <span>{dict.saveLoadModal.load}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.slotId)}
                        aria-label={`${dict.saveLoadModal.delete}: ${slot.label}`}
                        className="retro-button bg-[#2A1D20] px-2.5 py-1.5 text-xs text-[#E8665A] hover:bg-[#3A2529] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="retro-button bg-[#232B35] px-4 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#2F3A48] whitespace-nowrap cursor-pointer"
            >
              {dict.saveLoadModal.closeButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
