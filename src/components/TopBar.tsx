/**
 * Strict three-zone Top Bar and single-row operational HUD strip.
 */

import React from 'react';
import { Volume2, VolumeX, Save, LogOut } from 'lucide-react';
import { REGIONS_DATA } from '../data/regionsData';
import { ActiveTab, Company, GameState } from '../engine/gameTypes';
import { getPlayerCompany } from '../engine/turnEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface TopBarProps {
  state: GameState;
  onSelectTab: (tab: ActiveTab) => void;
  onAdvanceTurn: () => void;
  onOpenSaveModal: () => void;
  onToggleMute: () => void;
  onReturnToTitle: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  state,
  onSelectTab,
  onAdvanceTurn,
  onOpenSaveModal,
  onToggleMute,
  onReturnToTitle,
}) => {
  const { lang, dict } = useI18n();
  const player: Company = getPlayerCompany(state);

  const navTabs: Array<{ id: ActiveTab; label: string }> = [
    { id: 'MAP', label: dict.topBar.tabMap },
    { id: 'MARKET', label: dict.topBar.tabMarket },
    { id: 'COMPANIES', label: dict.topBar.tabCompanies },
    { id: 'NEWS', label: dict.topBar.tabNews },
  ];

  const totalStoredBarrels = REGIONS_DATA.reduce((sum, r) => {
    const rt = state.regions[r.id];
    return rt.ownerCompanyId === player.id ? sum + rt.storedBarrels : sum;
  }, 0);

  const priceDelta = state.market.spotPricePerBarrel - state.market.previousPrice;
  const priceDeltaSign = priceDelta > 0 ? '+' : '';
  const dateLabel = formatGameDateI18n(
    state.startYear,
    state.startMonth,
    state.turn,
    lang
  );

  return (
    <div className="border-b border-[#354150] bg-[#161B22]">
      {/* Strict 3-zone Top Bar Contract (wraps nav cleanly on narrow mobile) */}
      <header className="mx-auto flex max-w-[1440px] flex-wrap md:flex-nowrap items-center justify-between gap-y-2.5 gap-x-4 md:gap-8 px-3 sm:px-6 py-3 sm:py-3.5">
        {/* Zone 1: Brand Wordmark */}
        <div className="shrink-0 order-1">
          <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#F3F6FA] whitespace-nowrap">
            {dict.meta.appName}
          </span>
        </div>

        {/* Zone 2: 4 Single-line Nav Links */}
        <nav
          aria-label={dict.meta.appName}
          className="order-3 md:order-2 w-full md:w-auto grid grid-cols-4 md:flex md:items-center gap-1 md:gap-6 border-t border-[#26303D] pt-2 md:border-t-0 md:pt-0"
        >
          {navTabs.map((tab) => {
            const isActive = state.activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`relative py-1.5 text-center text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E59A24] ${
                  isActive
                    ? 'text-[#E59A24]'
                    : 'text-[#A2B0C0] hover:text-[#F3F6FA]'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 bottom-0 left-0 h-0.5 bg-[#E59A24]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Turn Action */}
        <div className="shrink-0 order-2 md:order-3">
          <button
            type="button"
            onClick={onAdvanceTurn}
            className="retro-button bg-[#E59A24] px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFE0A3]"
          >
            {dict.topBar.nextMonth}
          </button>
        </div>
      </header>

      {/* Secondary Operational HUD Strip */}
      <div className="border-t border-[#26303D] bg-[#12161B]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-semibold text-[#E6ECF2]">{player.name}</span>
            </div>

            <span aria-hidden="true" className="text-[#354150]">
              /
            </span>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono font-medium tabular-nums text-[#E6ECF2]">
                {dateLabel} · {dict.topBar.turnPrefix} {state.turn}
                {!state.endlessMode ? ` / ${state.maxTurns}` : ''}
              </span>
            </div>

            <span aria-hidden="true" className="text-[#354150]">
              /
            </span>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[#8D9CAD]">{dict.topBar.cash}:</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  player.cash < 0 ? 'text-[#E8665A]' : 'text-[#44B872]'
                }`}
              >
                {formatCurrencyI18n(player.cash, lang)}
              </span>
            </div>

            <span aria-hidden="true" className="text-[#354150]">
              /
            </span>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[#8D9CAD]">{dict.topBar.netWorth}:</span>
              <span className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                {formatCurrencyI18n(player.netWorth, lang)}
              </span>
            </div>

            <span aria-hidden="true" className="text-[#354150]">
              /
            </span>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[#8D9CAD]">{dict.marketView.storedCol}:</span>
              <span className="font-mono font-medium tabular-nums text-[#E6ECF2]">
                {formatBarrelsI18n(totalStoredBarrels, lang)}
              </span>
            </div>

            <span aria-hidden="true" className="text-[#354150]">
              /
            </span>

            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-[#8D9CAD]">{dict.topBar.spotPrice}:</span>
              <span className="font-mono font-semibold tabular-nums text-[#E59A24]">
                ${state.market.spotPricePerBarrel.toFixed(2)} {dict.units.perBarrel}
              </span>
              <span
                className={`font-mono tabular-nums ${
                  priceDelta >= 0 ? 'text-[#44B872]' : 'text-[#E8665A]'
                }`}
              >
                ({priceDeltaSign}
                {priceDelta.toFixed(2)})
              </span>
            </div>
          </div>

          {/* Utility Controls (strictly NO LanguageSelector here) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSaveModal}
              className="retro-button flex items-center gap-1.5 bg-[#1D242D] px-3 py-1.5 text-xs font-medium text-[#D2DCE6] hover:bg-[#27313D] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-[#E59A24]" />
              <span>{dict.topBar.saveLoadButton}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label="Audio toggle"
              className="retro-button flex items-center justify-center bg-[#1D242D] p-1.5 text-xs font-medium text-[#D2DCE6] hover:bg-[#27313D] shrink-0 cursor-pointer"
            >
              {state.soundMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-[#8D9CAD]" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-[#44B872]" />
              )}
            </button>

            <button
              type="button"
              onClick={onReturnToTitle}
              aria-label={dict.saveLoadModal.closeButton}
              className="retro-button flex items-center justify-center bg-[#1D242D] p-1.5 text-xs font-medium text-[#D2DCE6] hover:bg-[#27313D] shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 text-[#A2B0C0]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
