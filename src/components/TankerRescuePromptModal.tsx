/**
 * Turn-transition emergency maritime crisis alert modal offering Tanker Rescue
 * via manual vessel control, elevated-cost external rescue service, or skipping.
 */

import React from 'react';
import { AlertTriangle, Navigation, ShieldCheck, X } from 'lucide-react';
import {
  DifficultyLevel,
  PendingTankerRescuePrompt,
  RegionId,
} from '../engine/gameTypes';
import { getTankerRescueConfig } from '../engine/operationsEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  getLocalizedEvent,
  getLocalizedRegion,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface TankerRescuePromptModalProps {
  prompt: PendingTankerRescuePrompt;
  difficulty: DifficultyLevel;
  playerCash: number;
  onStartManualRescue: (regionId: RegionId, eventId: string) => void;
  onHireExternalFleet: (regionId: RegionId, eventId: string) => void;
  onDismiss: () => void;
}

export const TankerRescuePromptModal: React.FC<
  TankerRescuePromptModalProps
> = ({
  prompt,
  difficulty,
  playerCash,
  onStartManualRescue,
  onHireExternalFleet,
  onDismiss,
}) => {
  const { lang, dict } = useI18n();
  const tp = dict.tankerPrompt;
  const regTrans = getLocalizedRegion(prompt.regionId, lang);
  const locEv = getLocalizedEvent(
    {
      id: prompt.eventId,
      templateId: prompt.templateId,
      title: prompt.eventTitle,
      description: prompt.eventDescription,
      affectedRegionId: null,
    },
    lang
  );

  const isStormOnly =
    prompt.eventId.startsWith('storm_disruption') && prompt.baseRepairCost <= 0;
  const cfg = getTankerRescueConfig(
    difficulty,
    prompt.baseRepairCost,
    isStormOnly
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tanker-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/88 p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[680px] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#D94436]/50 bg-[#2C1819] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[#F87171]" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#F4A59D]">
                {tp.badge}
              </div>
              <h2
                id="tanker-prompt-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {tp.titlePrefix} {regTrans.name}
              </h2>
              <p className="text-xs text-[#E2B4B0] truncate">{locEv.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dict.saveLoadModal.closeAria}
            className="retro-button bg-[#232B35] p-1.5 text-[#CBD5E1] hover:bg-[#2F3A48] shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-[#CBD5E1] leading-relaxed">{locEv.description}</p>

          {/* Crisis Telemetry Summary */}
          <div className="space-y-1.5 border border-[#2D3846] bg-[#13181F] p-3.5 font-mono tabular-nums text-[11px]">
            <div className="text-[#E8665A] font-semibold">
              {interpolate(tp.spilledNotice, {
                barrels: formatBarrelsI18n(prompt.spilledBarrelsAmount, lang),
                cost: formatCurrencyI18n(prompt.baseRepairCost, lang),
              })}
            </div>
            <div className="text-[#E59A24]">
              {interpolate(tp.lostProductionNotice, {
                barrels: formatBarrelsI18n(prompt.lostProductionBarrels, lang),
              })}
            </div>
          </div>

          {/* 2 Rescue Execution Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option A: Manual Tanker Navigation */}
            <div className="border border-[#E59A24]/60 bg-[#1B1812] p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#E59A24]">
                  {tp.manualOptionBadge}
                </div>
                <div className="flex items-center gap-2 font-bold text-[#E59A24] text-sm">
                  <Navigation className="h-4 w-4 shrink-0" />
                  <span>{tp.manualOptionTitle}</span>
                </div>
                <p className="text-[#CBD5E1] leading-relaxed">
                  {tp.manualOptionDesc} ({cfg.timeLimitSec}s · {cfg.maxHullHp} HP)
                </p>
                <div className="font-mono text-[11px] tabular-nums space-y-0.5 pt-1">
                  <div className="text-[#44B872]">
                    {interpolate(tp.manualSuccessTag, {
                      pct: Math.round(cfg.recoveryRatio * 100),
                    })}
                  </div>
                  <div className="text-[#E8665A]">
                    {interpolate(tp.manualFailTag, {
                      mult: cfg.failMultiplier,
                    })}{' '}
                    (-{formatCurrencyI18n(cfg.failTotalCrisisCost, lang)})
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onStartManualRescue(prompt.regionId, prompt.eventId)
                }
                className="retro-button w-full bg-[#E59A24] px-4 py-2.5 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
              >
                {tp.manualStartButton}
              </button>
            </div>

            {/* Option B: External Rescue Fleet (Elevated Fee, Guaranteed) */}
            <div className="border border-[#2D3846] bg-[#141920] p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#38BDF8]">
                  {tp.externalOptionBadge}
                </div>
                <div className="flex items-center gap-2 font-bold text-[#F3F6FA] text-sm">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#38BDF8]" />
                  <span>{tp.externalOptionTitle}</span>
                </div>
                <p className="text-[#9FB0C2] leading-relaxed">
                  {tp.externalOptionDesc}
                </p>
                <div className="font-mono text-[11px] tabular-nums space-y-0.5 pt-1">
                  <div className="text-[#E59A24]">
                    -{formatCurrencyI18n(cfg.externalFleetFee, lang)}
                  </div>
                  <div className="text-[#44B872]">
                    {Math.round(cfg.externalRecoveryRatio * 100)}%
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={playerCash < cfg.externalFleetFee}
                onClick={() =>
                  onHireExternalFleet(prompt.regionId, prompt.eventId)
                }
                className="retro-button w-full bg-[#25303C] px-4 py-2.5 text-xs font-bold text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {interpolate(tp.externalButton, {
                  cost: formatCurrencyI18n(cfg.externalFleetFee, lang),
                })}
              </button>
            </div>
          </div>

          {/* Skip Footer */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#2D3846] pt-3">
            <button
              type="button"
              onClick={onDismiss}
              className="retro-button bg-[#232B35] px-4 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#2F3A48] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {tp.skipButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
