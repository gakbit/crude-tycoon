/**
 * Global crude oil market analytics, Recharts 12-month price history line chart,
 * cycle telemetry, stockpile selling desk, and corporate credit line management.
 */

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Landmark } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { REGIONS_DATA } from '../data/regionsData';
import { calculateSaleProceeds } from '../engine/economyEngine';
import { GameState, RegionId } from '../engine/gameTypes';
import { getPlayerCompany } from '../engine/turnEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
  formatGameShortDateI18n,
  getLocalizedRegion,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface MarketViewProps {
  state: GameState;
  onSellRegionalOil: (regionId: RegionId, barrels: number) => void;
  onSellAllOil: () => void;
  onTakeLoan: (amount: number) => void;
  onRepayLoan: (amount: number) => void;
}

export const MarketView: React.FC<MarketViewProps> = ({
  state,
  onSellRegionalOil,
  onSellAllOil,
  onTakeLoan,
  onRepayLoan,
}) => {
  const { lang, dict } = useI18n();
  const player = getPlayerCompany(state);
  const last12Prices = state.market.priceHistory.slice(-12);
  const minP = Math.max(15, Math.floor(Math.min(...last12Prices) * 0.88));
  const maxP = Math.ceil(Math.max(...last12Prices) * 1.12);

  const chartData = useMemo(() => {
    return last12Prices.map((price, idx) => {
      const turnOffset = state.turn - (last12Prices.length - 1 - idx);
      return {
        label: formatGameShortDateI18n(
          state.startYear,
          state.startMonth,
          turnOffset,
          lang
        ),
        fullDate: formatGameDateI18n(
          state.startYear,
          state.startMonth,
          turnOffset,
          lang
        ),
        price: Number(price.toFixed(2)),
      };
    });
  }, [last12Prices, state.turn, state.startYear, state.startMonth, lang]);

  const average12mPrice =
    last12Prices.reduce((sum, p) => sum + p, 0) /
    Math.max(1, last12Prices.length);

  const ownedRegionsWithOil = REGIONS_DATA.filter((r) => {
    const rt = state.regions[r.id];
    return rt.ownerCompanyId === player.id && rt.storedBarrels > 0;
  });

  const totalInventoryValue = ownedRegionsWithOil.reduce((sum, r) => {
    const rt = state.regions[r.id];
    return (
      sum +
      calculateSaleProceeds(
        rt.storedBarrels,
        state.market.spotPricePerBarrel,
        r.id,
        rt.crisisPriceMultiplier ?? 1.0
      )
    );
  }, 0);

  const availableCredit = Math.max(0, player.creditLimit - player.debt);
  const priceUp = state.market.spotPricePerBarrel >= state.market.previousPrice;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Price Chart & Market Balance */}
        <div className="lg:col-span-8 retro-panel p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2D3846] pb-4">
            <div>
              <h1 className="font-display text-xl font-bold text-[#F8FAFC]">
                {dict.marketView.exchangeTitle}
              </h1>
              <p className="mt-0.5 text-xs text-[#9FB0C2]">
                {dict.marketView.marketCycleLabel}{' '}
                <strong className="text-[#E59A24]">
                  {dict.marketCycles[state.market.cyclePhase].label}
                </strong>{' '}
                · {dict.marketView.eventMultLabel}{' '}
                <span className="font-mono tabular-nums">
                  {Math.round(state.market.activePriceMultiplier * 100)}%
                </span>
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs text-[#8D9CAD]">
                {dict.marketView.currentSpotPrice}
              </div>
              <div className="flex items-center justify-end gap-2 font-mono text-2xl font-bold tabular-nums text-[#E59A24]">
                {priceUp ? (
                  <TrendingUp className="h-5 w-5 text-[#44B872]" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-[#E8665A]" />
                )}
                <span>${state.market.spotPricePerBarrel.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Recharts 12-Month Oil Price Line Chart */}
          <div className="retro-inset p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#8D9CAD]">
              <span>{dict.marketView.chart12mTitle}</span>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                {dict.marketView.chart12mAvg}{' '}
                <strong className="text-[#E59A24]">
                  ${average12mPrice.toFixed(2)}
                </strong>
              </span>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: -8, bottom: 4 }}
                >
                  <CartesianGrid stroke="#222C38" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    stroke="#6F7E8F"
                    tick={{
                      fill: '#8D9CAD',
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                    tickLine={{ stroke: '#354150' }}
                  />
                  <YAxis
                    domain={[minP, maxP]}
                    stroke="#6F7E8F"
                    tickFormatter={(val: number) => `$${val}`}
                    tick={{
                      fill: '#8D9CAD',
                      fontSize: 11,
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                    tickLine={{ stroke: '#354150' }}
                  />
                  <Tooltip
                    cursor={{ stroke: '#48586C', strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null;
                      }
                      const datum = payload[0].payload as {
                        fullDate: string;
                        price: number;
                      };
                      return (
                        <div className="border border-[#425062] bg-[#141920] px-3 py-2 text-xs shadow-md">
                          <div className="text-[#9FB0C2]">{datum.fullDate}</div>
                          <div className="font-mono text-sm font-bold tabular-nums text-[#E59A24]">
                            ${datum.price.toFixed(2)} {dict.units.perBarrel}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={average12mPrice}
                    stroke="#48586C"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#E59A24"
                    strokeWidth={2.5}
                    dot={{
                      r: 3.5,
                      fill: '#E59A24',
                      stroke: '#13181F',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: '#FFE0A3',
                      stroke: '#E59A24',
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Supply vs Demand Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-[#2B3543] bg-[#141920] p-4 text-xs">
            <div>
              <div className="text-[#8D9CAD]">
                {dict.marketView.globalDemandLabel}
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-[#E6ECF2] mt-1">
                {formatBarrelsI18n(state.market.globalDemandBbl, lang)}
              </div>
            </div>
            <div>
              <div className="text-[#8D9CAD]">
                {dict.marketView.prevSupplyLabel}
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-[#E6ECF2] mt-1">
                {formatBarrelsI18n(state.market.globalSupplyBbl, lang)}
              </div>
            </div>
            <div>
              <div className="text-[#8D9CAD]">
                {dict.marketView.supplyDemandRatioLabel}
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-[#E59A24] mt-1">
                {state.market.globalSupplyBbl > 0
                  ? interpolate(dict.marketView.coveragePctValue, {
                      pct: Math.round(
                        (state.market.globalSupplyBbl /
                          state.market.globalDemandBbl) *
                          100
                      ),
                    })
                  : dict.marketView.initialMarketValue}
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Sales Desk & Corporate Banking */}
        <div className="lg:col-span-4 space-y-6">
          {/* Stockpile Sales */}
          <div className="retro-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#2D3846] pb-3">
              <h2 className="font-display text-base font-bold text-[#F3F6FA]">
                {dict.marketView.inventoryTitle}
              </h2>
              <span className="font-mono text-xs font-semibold tabular-nums text-[#44B872]">
                {interpolate(dict.marketView.inventoryValueLabel, {
                  value: formatCurrencyI18n(totalInventoryValue, lang),
                })}
              </span>
            </div>

            {ownedRegionsWithOil.length > 0 ? (
              <div className="space-y-3">
                <div className="divide-y divide-[#252E3A] border border-[#2B3543] bg-[#13181F]">
                  {ownedRegionsWithOil.map((r) => {
                    const rt = state.regions[r.id];
                    const fullVal = calculateSaleProceeds(
                      rt.storedBarrels,
                      state.market.spotPricePerBarrel,
                      r.id,
                      rt.crisisPriceMultiplier ?? 1.0
                    );
                    const locRegion = getLocalizedRegion(r.id, lang);
                    return (
                      <div key={r.id} className="p-3 text-xs space-y-2">
                        <div className="flex justify-between font-semibold text-[#E6ECF2]">
                          <span>
                            {r.shortCode} · {locRegion.name}
                          </span>
                          <span className="font-mono tabular-nums text-[#E59A24]">
                            {formatBarrelsI18n(rt.storedBarrels, lang)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onSellRegionalOil(
                                r.id,
                                Math.round(rt.storedBarrels * 0.5)
                              )
                            }
                            className="retro-button flex-1 bg-[#232B35] px-2.5 py-1.5 font-medium text-[#CBD5E1] hover:bg-[#2E3845] whitespace-nowrap cursor-pointer"
                          >
                            {dict.marketView.sellHalfButton}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSellRegionalOil(r.id, rt.storedBarrels)
                            }
                            className="retro-button flex-1 bg-[#2E9E5B] px-2.5 py-1.5 font-bold text-white hover:bg-[#36B56A] whitespace-nowrap cursor-pointer"
                          >
                            100% (+{formatCurrencyI18n(fullVal, lang)})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onSellAllOil}
                  className="retro-button w-full flex items-center justify-center gap-2 bg-[#E59A24] px-4 py-2.5 text-sm font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>
                    {interpolate(dict.marketView.sellAllButton, {
                      proceeds: formatCurrencyI18n(totalInventoryValue, lang),
                    })}
                  </span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#8D9CAD] py-2">
                {dict.marketView.noStoredOil}
              </p>
            )}
          </div>

          {/* Bank Loan & Credit */}
          <div className="retro-panel p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#2D3846] pb-3">
              <Landmark className="h-4 w-4 text-[#E59A24]" />
              <h2 className="font-display text-base font-bold text-[#F3F6FA]">
                {dict.marketView.bankTitle}
              </h2>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#8D9CAD]">
                  {dict.marketView.currentDebt}:
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    player.debt > 0 ? 'text-[#E8665A]' : 'text-[#E6ECF2]'
                  }`}
                >
                  {formatCurrencyI18n(player.debt, lang)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8D9CAD]">
                  {dict.marketView.availableCredit}:
                </span>
                <span className="font-mono font-semibold tabular-nums text-[#44B872]">
                  {formatCurrencyI18n(availableCredit, lang)}
                </span>
              </div>
              <p className="text-[11px] text-[#8D9CAD] pt-1">
                {dict.marketView.bankInterestRateNote}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                disabled={availableCredit < 250000}
                onClick={() => onTakeLoan(250000)}
                className="retro-button bg-[#25303C] px-3 py-2 font-semibold text-[#E6ECF2] hover:bg-[#303E4E] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {interpolate(dict.marketView.borrowLoanButton, {
                  amount: formatCurrencyI18n(250000, lang),
                })}
              </button>
              <button
                type="button"
                disabled={availableCredit < 500000}
                onClick={() => onTakeLoan(500000)}
                className="retro-button bg-[#25303C] px-3 py-2 font-semibold text-[#E6ECF2] hover:bg-[#303E4E] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {interpolate(dict.marketView.borrowLoanButton, {
                  amount: formatCurrencyI18n(500000, lang),
                })}
              </button>
              <button
                type="button"
                disabled={player.debt === 0 || player.cash < 250000}
                onClick={() => onRepayLoan(250000)}
                className="retro-button bg-[#1D2B24] px-3 py-2 font-semibold text-[#9ED9B4] hover:bg-[#25382E] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {interpolate(dict.marketView.repayLoanButton, {
                  amount: formatCurrencyI18n(250000, lang),
                })}
              </button>
              <button
                type="button"
                disabled={player.debt === 0 || player.cash <= 0}
                onClick={() => onRepayLoan(player.debt)}
                className="retro-button bg-[#1D2B24] px-3 py-2 font-semibold text-[#9ED9B4] hover:bg-[#25382E] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {dict.marketView.repayAllShortButton}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
