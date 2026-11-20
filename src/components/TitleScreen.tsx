/**
 * Retro 1990s industrial strategy title screen with company setup, difficulty selection,
 * and local browser save loading.
 */

import React, { useEffect, useState } from 'react';
import { Play, FolderOpen, Trash2, HelpCircle } from 'lucide-react';
import { DifficultyLevel, SaveSlotSummary } from '../engine/gameTypes';
import { getDifficultyBalanceConfig } from '../engine/turnEngine';
import {
  formatCurrencyI18n,
  getLocalizedHorizonLabel,
  interpolate,
  TRANSLATIONS,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { FaqModal } from './FaqModal';
import { LanguageSelector } from './LanguageSelector';

interface TitleScreenProps {
  hasAutosave: boolean;
  saveSlots: Array<{
    slotId: string;
    label: string;
    summary: SaveSlotSummary | null;
  }>;
  onStartNewGame: (companyName: string, difficulty: DifficultyLevel) => void;
  onContinueAutosave: () => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

const DIFFICULTY_IDS: DifficultyLevel[] = ['EASY', 'STANDARD', 'HARD'];

const DEFAULT_COMPANY_NAMES = new Set<string>(
  Object.values(TRANSLATIONS).map((d) => d.companies.defaultPlayerName)
);

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasAutosave,
  saveSlots,
  onStartNewGame,
  onContinueAutosave,
  onLoadSlot,
  onDeleteSlot,
}) => {
  const { lang, dict } = useI18n();
  const [companyName, setCompanyName] = useState(
    () => dict.companies.defaultPlayerName
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('STANDARD');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    setCompanyName((prev) => {
      if (!prev.trim() || DEFAULT_COMPANY_NAMES.has(prev)) {
        return dict.companies.defaultPlayerName;
      }
      return prev;
    });
  }, [dict.companies.defaultPlayerName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartNewGame(companyName, difficulty);
  };

  return (
    <div className="min-h-screen bg-[#12161B] text-[#E6ECF2] flex flex-col justify-center py-10 px-6">
      <div className="mx-auto w-full max-w-[1160px] space-y-6">
        {/* Language Selector Strip */}
        <div className="flex justify-end">
          <LanguageSelector showHint />
        </div>

        {/* Main Hero Split */}
        <div className="retro-panel grid grid-cols-1 lg:grid-cols-12 items-stretch overflow-hidden">
          {/* Left Visual Showcase */}
          <div className="lg:col-span-7 relative min-h-[320px] bg-[#161C24] border-b lg:border-b-0 lg:border-r border-[#354150]">
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/title_oil_refinery_1794943627311.jpg"
                alt={dict.meta.appName}
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gradient-to-br from-[#1C2530] to-[#11151B] p-8 text-center">
                <span className="font-display text-3xl font-bold text-[#E59A24]">
                  {dict.meta.appName.toUpperCase()}
                </span>
                <p className="mt-2 text-sm text-[#9FB0C2]">
                  {dict.titleScreen.subtitle}
                </p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#12161B]/95 via-[#12161B]/35 to-transparent" />
            <div className="absolute right-0 bottom-0 left-0 p-6 md:p-8">
              <div className="flex items-center gap-4">
                {!emblemFailed && (
                  <img
                    src="/src/assets/images/tycoon_crest_emblem_1794943628297.jpg"
                    alt={dict.meta.appName}
                    referrerPolicy="no-referrer"
                    onError={() => setEmblemFailed(true)}
                    className="h-14 w-14 border border-[#E59A24]/60 object-cover shrink-0"
                  />
                )}
                <div>
                  <h1 className="font-display text-4xl font-bold tracking-tight text-[#F8FAFC]">
                    {dict.meta.appName}
                  </h1>
                  <p className="mt-1 text-sm text-[#C3CFD9]">
                    {dict.titleScreen.subtitle}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Setup Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-5 flex flex-col justify-between p-6 md:p-8 space-y-6"
          >
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-[#F3F6FA]">
                  {dict.titleScreen.setupTitle}
                </h2>
                <p className="mt-1 text-xs text-[#9FB0C2]">
                  {dict.meta.pageDescription}
                </p>
              </div>

              <div>
                <label
                  htmlFor="company-name"
                  className="block text-xs font-semibold text-[#B4C1CF] mb-1.5"
                >
                  {dict.titleScreen.companyNameLabel}
                </label>
                <input
                  id="company-name"
                  type="text"
                  maxLength={32}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="retro-inset w-full px-3.5 py-2.5 text-sm font-medium text-[#F3F6FA] focus:border-[#E59A24] focus:outline-none"
                  placeholder={dict.titleScreen.companyNamePlaceholder}
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#B4C1CF] mb-2">
                  {dict.titleScreen.difficultyLabel}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTY_IDS.map((diffId) => {
                    const selected = difficulty === diffId;
                    const diffTrans = dict.difficulties[diffId];
                    return (
                      <button
                        key={diffId}
                        type="button"
                        onClick={() => setDifficulty(diffId)}
                        className={`retro-button px-3 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                          selected
                            ? 'bg-[#E59A24] text-[#12161B] border-[#F3B753]'
                            : 'bg-[#232B35] text-[#CBD5E1] hover:bg-[#2C3643]'
                        }`}
                      >
                        {diffTrans.label}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const cfg = getDifficultyBalanceConfig(difficulty);
                  const diffTrans = dict.difficulties[difficulty];
                  return (
                    <div className="mt-2.5 border border-[#2D3846] bg-[#151B22] p-3 text-xs space-y-1">
                      <div className="flex justify-between text-[#CBD5E1]">
                        <span>{dict.titleScreen.startingCashLabel}:</span>
                        <span className="font-mono font-semibold tabular-nums text-[#44B872]">
                          {formatCurrencyI18n(cfg.playerStartingCash, lang)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#CBD5E1]">
                        <span>{dict.titleScreen.targetPrefix}:</span>
                        <span className="font-mono font-semibold tabular-nums text-[#E59A24]">
                          {formatCurrencyI18n(cfg.victoryNetWorthTarget, lang)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#CBD5E1]">
                        <span>{dict.titleScreen.horizonPrefix}:</span>
                        <span className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                          {interpolate(dict.units.turnsCount, {
                            count: cfg.maxTurns,
                          })}{' '}
                          ({getLocalizedHorizonLabel(cfg.maxTurns, lang)})
                        </span>
                      </div>
                      <p className="pt-1 text-[#8D9CAD]">{diffTrans.tagline}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="submit"
                className="retro-button w-full flex items-center justify-center gap-2 bg-[#E59A24] px-5 py-3 text-sm font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{dict.titleScreen.startButton}</span>
              </button>

              {hasAutosave && (
                <button
                  type="button"
                  onClick={onContinueAutosave}
                  className="retro-button w-full flex items-center justify-center gap-2 bg-[#25303C] px-5 py-2.5 text-sm font-semibold text-[#E6ECF2] hover:bg-[#2E3B4A] whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="h-4 w-4 text-[#E59A24]" />
                  <span>
                    {dict.titleScreen.continueHeader} (
                    {dict.titleScreen.autosaveTag})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowFaq(true)}
                className="retro-button w-full flex items-center justify-center gap-2 bg-[#1A2129] px-5 py-2.5 text-xs font-semibold text-[#CBD5E1] hover:bg-[#242E39] whitespace-nowrap cursor-pointer"
              >
                <HelpCircle className="h-4 w-4 text-[#E59A24]" />
                <span>{dict.titleScreen.faqButton}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Row: Saved Slots */}
        <div className="retro-panel p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-[#F3F6FA]">
              {dict.titleScreen.loadSlotHeader}
            </h3>
            <span className="text-xs text-[#8D9CAD]">
              {dict.saveLoadModal.subtitle}
            </span>
          </div>
          <div className="divide-y divide-[#2B3543] border border-[#2B3543] bg-[#141920]">
            {saveSlots.map((slot) => (
              <div
                key={slot.slotId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
              >
                {slot.summary ? (
                  <>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#E6ECF2]">
                        {slot.label} · {slot.summary.companyName}
                      </div>
                      <div className="font-mono tabular-nums text-[#8D9CAD]">
                        {slot.summary.dateLabel} ({dict.titleScreen.turnPrefix}{' '}
                        {slot.summary.turn}) · {dict.topBar.netWorth}:{' '}
                        <span className="text-[#E59A24]">
                          {formatCurrencyI18n(slot.summary.netWorth, lang)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadSlot(slot.slotId)}
                        className="retro-button bg-[#293544] px-3 py-1.5 text-xs font-semibold text-[#F3F6FA] hover:bg-[#344356] whitespace-nowrap cursor-pointer"
                      >
                        {dict.saveLoadModal.load}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.slotId)}
                        aria-label={`${dict.saveLoadModal.delete}: ${slot.label}`}
                        className="retro-button bg-[#2A1D20] px-2.5 py-1.5 text-xs text-[#E8665A] hover:bg-[#3A2529] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex w-full items-center justify-between text-[#6F7E8F]">
                    <span>{slot.label}</span>
                    <span>{dict.saveLoadModal.emptySlot}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showFaq && <FaqModal onClose={() => setShowFaq(false)} />}
    </div>
  );
};
