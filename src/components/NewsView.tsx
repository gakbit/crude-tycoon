/**
 * Chronological newsroom, geopolitical crises monitor, and operations log.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Newspaper } from 'lucide-react';
import { GameState, NewsCategory } from '../engine/gameTypes';
import {
  formatCurrencyI18n,
  getLocalizedEvent,
  getLocalizedNewsEntry,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface NewsViewProps {
  state: GameState;
}

export const NewsView: React.FC<NewsViewProps> = ({ state }) => {
  const { lang, dict } = useI18n();
  const [filter, setFilter] = useState<'ALL' | NewsCategory>('ALL');

  const categories: Array<{ id: 'ALL' | NewsCategory; label: string }> = [
    { id: 'ALL', label: dict.newsView.filterAll },
    { id: 'GEOPOLITICS', label: dict.newsCategories.GEOPOLITICS },
    { id: 'MARKET', label: dict.newsCategories.MARKET },
    { id: 'OPERATIONS', label: dict.newsCategories.OPERATIONS },
    { id: 'RIVAL', label: dict.newsCategories.RIVAL },
  ];

  const filteredNews = useMemo(() => {
    if (filter === 'ALL') return state.newsLog;
    return state.newsLog.filter((item) => item.category === filter);
  }, [state.newsLog, filter]);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Filterable News Log */}
        <div className="lg:col-span-8 retro-panel p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2D3846] pb-4">
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-[#E59A24]" />
              <h1 className="font-display text-xl font-bold text-[#F8FAFC]">
                {dict.newsView.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-[#12161B] p-1 border border-[#2B3543]">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    filter === c.id
                      ? 'bg-[#283340] text-[#E59A24]'
                      : 'text-[#8D9CAD] hover:text-[#E6ECF2]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#252E3A] border border-[#2B3543] bg-[#13181F]">
            {filteredNews.length > 0 ? (
              filteredNews.map((entry) => {
                const loc = getLocalizedNewsEntry(
                  entry,
                  { startYear: state.startYear, startMonth: state.startMonth },
                  lang
                );
                return (
                  <article key={entry.id} className="p-4 space-y-1">
                    <div className="text-[11px] text-[#8D9CAD] font-mono tabular-nums">
                      {interpolate(dict.newsView.entryDatePrefix, {
                        date: loc.dateLabel,
                        turn: entry.turn,
                      })}{' '}
                      ·{' '}
                      <span className="text-[#E59A24]">
                        {dict.newsCategories[entry.category]}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-[#F3F6FA]">
                      {loc.headline}
                    </h2>
                    <p className="text-xs leading-relaxed text-[#B4C1CF]">
                      {loc.detail}
                    </p>
                  </article>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-[#8D9CAD]">
                {dict.newsView.emptyLog}
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Columns: Active Global & Regional Crises */}
        <div className="lg:col-span-4 retro-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#2D3846] pb-3">
            <AlertTriangle className="h-4 w-4 text-[#E59A24]" />
            <h2 className="font-display text-base font-bold text-[#F3F6FA]">
              {dict.newsView.activeGlobalTitle}
            </h2>
          </div>

          {state.activeEvents.length > 0 ? (
            <div className="space-y-3">
              {state.activeEvents.map((ev) => {
                const locEv = getLocalizedEvent(ev, lang);
                return (
                  <div
                    key={ev.id}
                    className={`border p-3.5 text-xs space-y-1.5 ${
                      ev.severity === 'CRITICAL'
                        ? 'border-[#D94436]/60 bg-[#2A1719]'
                        : ev.severity === 'WARNING'
                          ? 'border-[#E59A24]/50 bg-[#272015]'
                          : 'border-[#2E9E5B]/50 bg-[#16251D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-bold text-[#F3F6FA]">
                      <span>{locEv.title}</span>
                      <span className="font-mono tabular-nums text-[#E59A24] shrink-0">
                        {interpolate(dict.worldMap.monthsRemaining, {
                          turns: ev.turnsRemaining,
                        })}
                      </span>
                    </div>
                    <p className="text-[#CBD5E1] leading-relaxed">
                      {locEv.description}
                    </p>
                    <div className="font-mono text-[11px] tabular-nums text-[#9FB0C2] pt-1">
                      {interpolate(dict.newsView.worldPriceImpact, {
                        pct: Math.round(ev.priceImpactMultiplier * 100),
                      })}{' '}
                      ·{' '}
                      {ev.productionModifier === 0
                        ? dict.worldMap.fullShutdown
                        : interpolate(dict.newsView.productionImpact, {
                            pct: Math.round(ev.productionModifier * 100),
                          })}
                      {(ev.regionalPriceMultiplier ?? 1) < 1
                        ? ` · ${interpolate(dict.newsView.localPriceImpact, {
                            pct: Math.round((ev.regionalPriceMultiplier ?? 1) * 100),
                          })}`
                        : ''}
                      {(ev.ownerRepairCost ?? 0) > 0
                        ? ` · ${interpolate(dict.newsView.costImpact, {
                            amount: formatCurrencyI18n(ev.ownerRepairCost ?? 0, lang),
                          })}`
                        : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#8D9CAD] leading-relaxed">
              {dict.newsView.noCrisesNotice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

