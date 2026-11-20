/**
 * Scrolling 1990s-style bottom wire ticker displaying live crude oil prices,
 * regional spot quotes, active crises, and key headlines from the game log.
 */

import React, { useMemo } from 'react';
import { REGIONS_BY_ID } from '../data/regionsData';
import { ActiveTab, GameState } from '../engine/gameTypes';
import { getLocalizedEvent, getLocalizedNewsEntry } from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface NewsTickerProps {
  state: GameState;
  onNavigateTab: (tab: ActiveTab) => void;
}

interface TickerItem {
  id: string;
  label: string;
  value: string;
  tone: 'AMBER' | 'GREEN' | 'RED' | 'NEUTRAL';
  targetTab: ActiveTab;
}

export const NewsTicker: React.FC<NewsTickerProps> = ({
  state,
  onNavigateTab,
}) => {
  const { lang, dict } = useI18n();
  const spot = state.market.spotPricePerBarrel;
  const delta = spot - state.market.previousPrice;
  const deltaPrefix = delta >= 0 ? '+' : '';

  const tickerItems = useMemo<TickerItem[]>(() => {
    const items: TickerItem[] = [];

    // 1. Global spot crude quote & market cycle
    items.push({
      id: 'spot_global',
      label: dict.marketView.chartPriceName,
      value: `$${spot.toFixed(2)} ${dict.units.perBarrel} (${deltaPrefix}${delta.toFixed(2)})`,
      tone: delta >= 0 ? 'GREEN' : 'RED',
      targetTab: 'MARKET',
    });

    items.push({
      id: 'market_cycle',
      label: dict.topBar.tabMarket,
      value: dict.marketCycles[state.market.cyclePhase].label,
      tone: 'AMBER',
      targetTab: 'MARKET',
    });

    // 2. Benchmark regional spot prices adjusted by logistics multiplier
    const benchmarkIds: Array<keyof typeof REGIONS_BY_ID> = [
      'north_sea',
      'texas_permian',
      'persian_gulf',
    ];
    for (const regId of benchmarkIds) {
      const reg = REGIONS_BY_ID[regId];
      const regPrice = spot * reg.logisticsMultiplier;
      items.push({
        id: `quote_${reg.id}`,
        label: reg.shortCode,
        value: `$${regPrice.toFixed(2)} ${dict.units.perBarrel}`,
        tone: 'NEUTRAL',
        targetTab: 'MAP',
      });
    }

    // 3. Active geopolitical crises
    for (const ev of state.activeEvents) {
      const locEv = getLocalizedEvent(ev, lang);
      items.push({
        id: `crisis_${ev.id}`,
        label: dict.worldMap.crisisShort,
        value: `${locEv.title} (${ev.turnsRemaining} ${dict.units.monthsShort})`,
        tone: ev.severity === 'CRITICAL' ? 'RED' : 'AMBER',
        targetTab: 'NEWS',
      });
    }

    // 4. Latest key headlines from the news log
    const recentLogs = state.newsLog.slice(0, 6);
    for (const log of recentLogs) {
      const locLog = getLocalizedNewsEntry(
        log,
        { startYear: state.startYear, startMonth: state.startMonth },
        lang
      );
      items.push({
        id: `news_${log.id}`,
        label: locLog.dateLabel,
        value: `${locLog.headline} — ${locLog.detail}`,
        tone: 'NEUTRAL',
        targetTab: 'NEWS',
      });
    }

    return items;
  }, [
    spot,
    delta,
    deltaPrefix,
    state.market.cyclePhase,
    state.activeEvents,
    state.newsLog,
    state.startYear,
    state.startMonth,
    lang,
    dict,
  ]);

  const getToneClass = (tone: TickerItem['tone']): string => {
    switch (tone) {
      case 'GREEN':
        return 'text-[#44B872]';
      case 'RED':
        return 'text-[#E8665A]';
      case 'AMBER':
        return 'text-[#E59A24]';
      default:
        return 'text-[#E6ECF2]';
    }
  };

  return (
    <aside
      aria-label={dict.newsTicker.liveTicker}
      className="fixed right-0 bottom-0 left-0 z-30 flex h-9 items-center border-t border-[#354150] bg-[#101419] text-xs select-none"
    >
      {/* Left Fixed Anchor: Spot Price & Wire Button */}
      <button
        type="button"
        onClick={() => onNavigateTab('MARKET')}
        className="flex h-full items-center gap-2.5 border-r border-[#354150] bg-[#181F28] px-4 font-mono font-semibold tabular-nums text-[#E59A24] hover:bg-[#212A36] whitespace-nowrap shrink-0 cursor-pointer"
      >
        <span>
          {dict.topBar.spotPrice}: ${spot.toFixed(2)}
        </span>
        <span className={delta >= 0 ? 'text-[#44B872]' : 'text-[#E8665A]'}>
          {deltaPrefix}
          {delta.toFixed(2)}
        </span>
      </button>

      {/* Scrolling Marquee Viewport */}
      <div className="relative flex-1 overflow-hidden h-full flex items-center">
        <div className="ticker-track flex items-center whitespace-nowrap">
          {[0, 1].map((dupIndex) => (
            <div
              key={dupIndex}
              aria-hidden={dupIndex === 1}
              className="flex items-center shrink-0"
            >
              {tickerItems.map((item) => (
                <button
                  key={`${dupIndex}_${item.id}`}
                  type="button"
                  tabIndex={dupIndex === 1 ? -1 : 0}
                  onClick={() => onNavigateTab(item.targetTab)}
                  className="inline-flex items-center gap-2 px-5 py-1 hover:text-[#FFE0A3] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="font-mono text-[11px] font-semibold text-[#8D9CAD]">
                    {item.label}:
                  </span>
                  <span
                    className={`font-mono text-xs tabular-nums ${getToneClass(
                      item.tone
                    )}`}
                  >
                    {item.value}
                  </span>
                  <span aria-hidden="true" className="ml-3 text-[#354150]">
                    ///
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Right Quick Link to Full Newsroom */}
      <button
        type="button"
        onClick={() => onNavigateTab('NEWS')}
        className="hidden sm:flex h-full items-center border-l border-[#354150] bg-[#181F28] px-3.5 text-[11px] font-semibold text-[#B4C1CF] hover:bg-[#212A36] hover:text-[#F3F6FA] whitespace-nowrap shrink-0 cursor-pointer"
      >
        {dict.topBar.tabNews}
      </button>
    </aside>
  );
};
