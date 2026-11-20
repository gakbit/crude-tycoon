/**
 * Corporate standings, detailed Company Dossier (player & rivals),
 * and cross-company Quarterly/Annual Financial Reports Archive.
 * Responsive across desktop (high-density tables) and mobile (zero-scroll cards & 2x2 selector).
 */

import React, { useMemo, useState } from 'react';
import {
  Building2,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Lock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { REGIONS_BY_ID, REGIONS_DATA } from '../data/regionsData';
import {
  calculateSaleProceeds,
  calculateWellMonthlyOutput,
  getRegionStorageCapacity,
} from '../engine/economyEngine';
import {
  Company,
  GameState,
  QuarterlyReportSnapshot,
} from '../engine/gameTypes';
import {
  ANALYST_AUDIT_DURATION_MONTHS,
  getAnalystMinigameConfig,
  getExternalAnalystCost,
  getPlayerCompany,
} from '../engine/turnEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
  formatLocaleNumber,
  getLocalizedCompanyMotto,
  getLocalizedRegion,
  getLocalizedRegionCrisisLabel,
  getLocalizedWellDisplayName,
  getReportPeriodMetaI18n,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

export type CompaniesSubView = 'STANDINGS' | 'DOSSIER' | 'REPORTS';

interface CompaniesViewProps {
  state: GameState;
  activeSubView: CompaniesSubView;
  onChangeSubView: (subView: CompaniesSubView) => void;
  onHireAnalyst: (companyId: string) => void;
  onStartAnalystMinigame: (companyId: string) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  state,
  activeSubView,
  onChangeSubView,
  onHireAnalyst,
  onStartAnalystMinigame,
}) => {
  const { lang, dict } = useI18n();
  const formatCurrency = (amount: number) => formatCurrencyI18n(amount, lang);
  const formatBarrels = (barrels: number) => formatBarrelsI18n(barrels, lang);
  const getPersonalityLabel = (personality: Company['personality']) =>
    dict.personalities[personality ?? 'PLAYER'];

  const player = getPlayerCompany(state);
  const accessMap = state.analystAccessTurnsByCompanyId ?? {};
  const analystMinigameCfg = getAnalystMinigameConfig(state.difficulty);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    state.playerCompanyId
  );

  // Collect all published report turns (every 3rd turn that has closed)
  const availablePeriods = useMemo(() => {
    const byTurn = new Map<
      number,
      { turn: number; snapshot: QuarterlyReportSnapshot }
    >();
    for (const comp of state.companies) {
      for (const rep of comp.reportHistory ?? []) {
        if (!byTurn.has(rep.reportedAtTurn)) {
          byTurn.set(rep.reportedAtTurn, {
            turn: rep.reportedAtTurn,
            snapshot: rep,
          });
        }
      }
    }
    return Array.from(byTurn.values()).sort((a, b) => b.turn - a.turn);
  }, [state.companies]);

  const [selectedReportTurn, setSelectedReportTurn] = useState<number | null>(
    null
  );

  const effectiveReportTurn =
    selectedReportTurn !== null &&
    availablePeriods.some((p) => p.turn === selectedReportTurn)
      ? selectedReportTurn
      : availablePeriods[0]?.turn ?? null;

  const getVisibleCompanyMetrics = (comp: Company) => {
    const analystTurns = accessMap[comp.id] ?? 0;
    const isLiveVisible = comp.isPlayer || analystTurns > 0;
    const report = comp.lastPublishedReport;

    const reportPeriodLabel = getReportPeriodMetaI18n(
      state.startYear,
      state.startMonth,
      report.reportedAtTurn,
      lang
    ).periodLabel;

    return {
      isLiveVisible,
      analystTurns,
      displayedNetWorth: isLiveVisible ? comp.netWorth : report.netWorth,
      displayedCash: isLiveVisible ? comp.cash : report.cash,
      reportLabel: isLiveVisible
        ? comp.isPlayer
          ? dict.companiesView.liveOwnBooks
          : interpolate(dict.companiesView.liveAuditBooks, {
              turns: analystTurns,
            })
        : report.reportedAtTurn <= 1
          ? dict.companiesView.openingData
          : `${reportPeriodLabel} (${interpolate(dict.companiesView.turnOrdinal, { turn: report.reportedAtTurn })})`,
    };
  };

  const ranked = [...state.companies].sort((a, b) => {
    const netA = getVisibleCompanyMetrics(a).displayedNetWorth;
    const netB = getVisibleCompanyMetrics(b).displayedNetWorth;
    return netB - netA;
  });

  const maxWorth = Math.max(
    1,
    ...ranked.map((c) => getVisibleCompanyMetrics(c).displayedNetWorth)
  );

  const openCompanyDossier = (companyId: string) => {
    setSelectedCompanyId(companyId);
    onChangeSubView('DOSSIER');
  };

  const selectedCompany =
    state.companies.find((c) => c.id === selectedCompanyId) ?? player;
  const selectedMetrics = getVisibleCompanyMetrics(selectedCompany);

  const nextQuarterTurn = state.turn + ((3 - (state.turn % 3)) % 3 || 3);
  const nextAnnualTurn = state.turn + ((12 - (state.turn % 12)) % 12 || 12);

  // Asset valuation breakdown for selected company (used when isLiveVisible)
  const selectedOwnedRegions = REGIONS_DATA.filter(
    (r) => state.regions[r.id].ownerCompanyId === selectedCompany.id
  );
  const selectedWells = state.wells.filter(
    (w) => w.ownerCompanyId === selectedCompany.id
  );

  const concessionsAssetValue = selectedOwnedRegions.reduce(
    (sum, r) => sum + Math.round(r.concessionBasePrice * 0.75),
    0
  );
  const tanksAssetValue = selectedOwnedRegions.reduce((sum, r) => {
    const rt = state.regions[r.id];
    return sum + Math.round(rt.tanksCount * r.tankBuildCost * 0.7);
  }, 0);
  const storedOilAssetValue = selectedOwnedRegions.reduce((sum, r) => {
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
  const wellsAssetValue = selectedWells
    .filter((w) => w.status !== 'DEPLETED')
    .reduce(
      (sum, w) =>
        sum + Math.round(REGIONS_BY_ID[w.regionId].drillingBaseCost * 0.65),
      0
    );

  return (
    <div className="mx-auto max-w-[1440px] px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="retro-panel p-4 sm:p-6 space-y-5">
        {/* Top Header + Responsive Sub-View Segmented Control */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#2D3846] pb-4">
          <div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#F8FAFC]">
              {dict.companiesView.title}
            </h1>
            <p className="mt-1 text-xs text-[#9FB0C2]">
              {dict.companiesView.subtitle}{' '}
              <span className="font-mono font-semibold tabular-nums text-[#E59A24]">
                {formatCurrency(state.victoryNetWorthTarget)}
              </span>{' '}
              · {dict.companiesView.nextQuarterTurnLabel}{' '}
              <span className="font-mono tabular-nums text-[#E6ECF2]">
                {interpolate(dict.companiesView.turnOrdinal, {
                  turn: nextQuarterTurn,
                })}
              </span>{' '}
              · {dict.companiesView.annualCloseTurnLabel}{' '}
              <span className="font-mono tabular-nums text-[#E6ECF2]">
                {interpolate(dict.companiesView.turnOrdinal, {
                  turn: nextAnnualTurn,
                })}
              </span>
            </p>
          </div>

          <div
            role="tablist"
            aria-label={dict.companiesView.tabsAriaLabel}
            className="grid grid-cols-3 sm:inline-flex items-center gap-1 border border-[#2D3846] bg-[#12161B] p-1 w-full lg:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSubView === 'STANDINGS'}
              onClick={() => onChangeSubView('STANDINGS')}
              className={`min-h-[40px] flex items-center justify-center px-2 sm:px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubView === 'STANDINGS'
                  ? 'bg-[#E59A24] text-[#12161B]'
                  : 'text-[#A2B0C0] hover:text-[#F3F6FA]'
              }`}
            >
              <span>{dict.companiesView.tabStandingsShort}</span>
              <span className="hidden sm:inline">
                {dict.companiesView.tabStandingsLongSuffix}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubView === 'DOSSIER'}
              onClick={() => onChangeSubView('DOSSIER')}
              className={`min-h-[40px] flex items-center justify-center px-2 sm:px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubView === 'DOSSIER'
                  ? 'bg-[#E59A24] text-[#12161B]'
                  : 'text-[#A2B0C0] hover:text-[#F3F6FA]'
              }`}
            >
              {dict.companiesView.tabDossier}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubView === 'REPORTS'}
              onClick={() => onChangeSubView('REPORTS')}
              className={`min-h-[40px] flex items-center justify-center px-2 sm:px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubView === 'REPORTS'
                  ? 'bg-[#E59A24] text-[#12161B]'
                  : 'text-[#A2B0C0] hover:text-[#F3F6FA]'
              }`}
            >
              <span className="sm:hidden">
                {dict.companiesView.tabReportsShort}
                {availablePeriods.length > 0
                  ? ` (${availablePeriods.length})`
                  : ''}
              </span>
              <span className="hidden sm:inline">
                {dict.companiesView.tabReportsLong}
                {availablePeriods.length > 0
                  ? ` (${availablePeriods.length})`
                  : ''}
              </span>
            </button>
          </div>
        </div>

        {/* SUB-VIEW 1: STANDINGS */}
        {activeSubView === 'STANDINGS' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8D9CAD]">
              <span>{dict.companiesView.standingsHintLeft}</span>
              <span>{dict.companiesView.standingsHintRight}</span>
            </div>

            {/* Mobile Stacked Company Cards (Zero Horizontal Scroll) */}
            <div className="space-y-3 md:hidden">
              {ranked.map((comp, idx) => {
                const ownedRegions = REGIONS_DATA.filter(
                  (r) => state.regions[r.id].ownerCompanyId === comp.id
                );
                const activeWells = state.wells.filter(
                  (w) =>
                    w.ownerCompanyId === comp.id && w.status !== 'DEPLETED'
                ).length;
                const totalTanks = ownedRegions.reduce(
                  (sum, r) => sum + state.regions[r.id].tanksCount,
                  0
                );
                const metrics = getVisibleCompanyMetrics(comp);
                const report = comp.lastPublishedReport;
                const hasQuarterlyNumbers = report.reportedAtTurn >= 3;
                const targetPct = Math.min(
                  100,
                  Math.round(
                    (metrics.displayedNetWorth / state.victoryNetWorthTarget) *
                      100
                  )
                );
                const widthPct = Math.max(
                  4,
                  Math.min(
                    100,
                    Math.round((metrics.displayedNetWorth / maxWorth) * 100)
                  )
                );

                return (
                  <div
                    key={comp.id}
                    className={`border p-4 space-y-3 text-xs ${
                      comp.isPlayer
                        ? 'border-[#E59A24]/60 bg-[#E59A24]/10'
                        : 'border-[#2D3846] bg-[#13181F]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 font-semibold text-sm text-[#F8FAFC]">
                          <span className="font-mono tabular-nums text-[#9FB0C2]">
                            {idx + 1}.
                          </span>
                          <span
                            className="h-3 w-3 shrink-0"
                            style={{ backgroundColor: comp.colorHex }}
                          />
                          <span className="truncate">{comp.name}</span>
                        </div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          {getPersonalityLabel(comp.personality)} ·{' '}
                          <span
                            className={
                              metrics.isLiveVisible && !comp.isPlayer
                                ? 'text-[#44B872]'
                                : 'text-[#9FB0C2]'
                            }
                          >
                            {metrics.reportLabel}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-[#8D9CAD]">
                          {dict.companiesView.knownNetWorth}
                        </div>
                        <div className="font-mono text-sm font-bold tabular-nums text-[#E59A24]">
                          {formatCurrency(metrics.displayedNetWorth)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-2 w-full bg-[#101419] border border-[#2B3543]">
                        <div
                          className="h-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: comp.colorHex,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-[#8D9CAD] font-mono tabular-nums">
                        <span>
                          {interpolate(dict.units.regionsCount, {
                            count: ownedRegions.length,
                          })}{' '}
                          ·{' '}
                          {interpolate(dict.units.wellsCount, {
                            count: activeWells,
                          })}{' '}
                          ·{' '}
                          {interpolate(dict.units.tanksCount, {
                            count: totalTanks,
                          })}
                        </span>
                        <span>
                          {interpolate(dict.companiesView.goalLabel, {
                            pct: targetPct,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-[#232B35] pt-2.5">
                      <div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          {dict.companiesView.cashLabel}
                        </div>
                        <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                          {formatCurrency(metrics.displayedCash)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          {dict.companiesView.productionLabel}
                        </div>
                        <div className="font-mono tabular-nums text-[#CBD5E1]">
                          {metrics.isLiveVisible
                            ? `${formatLocaleNumber(comp.lastTurnProductionBbl, lang)} ${dict.units.barrelShort}`
                            : hasQuarterlyNumbers
                              ? `${formatLocaleNumber(report.quarterlyProductionBbl, lang)} ${dict.units.barrelShort}`
                              : dict.companiesView.confidential}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          {dict.companiesView.profitLabel}
                        </div>
                        <div className="font-mono tabular-nums font-medium">
                          {metrics.isLiveVisible ? (
                            <span
                              className={
                                comp.lastTurnProfit >= 0
                                  ? 'text-[#44B872]'
                                  : 'text-[#E8665A]'
                              }
                            >
                              {comp.lastTurnProfit >= 0 ? '+' : ''}
                              {formatCurrency(comp.lastTurnProfit)}
                            </span>
                          ) : hasQuarterlyNumbers ? (
                            <span
                              className={
                                report.quarterlyProfit >= 0
                                  ? 'text-[#44B872]'
                                  : 'text-[#E8665A]'
                              }
                            >
                              {report.quarterlyProfit >= 0 ? '+' : ''}
                              {formatCurrency(report.quarterlyProfit)}
                            </span>
                          ) : (
                            <span className="font-sans text-[#6F7E8F]">
                              {dict.companiesView.confidential}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openCompanyDossier(comp.id)}
                        className="retro-button w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 bg-[#1F2833] px-3 py-2 text-xs font-semibold text-[#F3F6FA] hover:bg-[#2A3645] whitespace-nowrap cursor-pointer"
                      >
                        <Building2 className="h-3.5 w-3.5 text-[#E59A24]" />
                        <span>{dict.companiesView.dossierButton}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-[#8D9CAD]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop High-Density Financial Comparison Table */}
            <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">
                      {dict.companiesView.colCompany}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.colAssets}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.productionLabel}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.profitLabel}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.cashLabel}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.knownNetWorth}
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      {dict.companiesView.colOperations}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232B35]">
                  {ranked.map((comp, idx) => {
                    const ownedRegions = REGIONS_DATA.filter(
                      (r) => state.regions[r.id].ownerCompanyId === comp.id
                    );
                    const activeWells = state.wells.filter(
                      (w) =>
                        w.ownerCompanyId === comp.id && w.status !== 'DEPLETED'
                    ).length;
                    const totalTanks = ownedRegions.reduce(
                      (sum, r) => sum + state.regions[r.id].tanksCount,
                      0
                    );

                    const metrics = getVisibleCompanyMetrics(comp);
                    const report = comp.lastPublishedReport;
                    const hasQuarterlyNumbers = report.reportedAtTurn >= 3;

                    return (
                      <tr
                        key={comp.id}
                        onClick={() => openCompanyDossier(comp.id)}
                        className={`cursor-pointer transition-colors ${
                          comp.isPlayer
                            ? 'bg-[#E59A24]/10 hover:bg-[#E59A24]/15'
                            : 'hover:bg-[#1C232D]'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono tabular-nums text-[#8D9CAD]">
                          {idx + 1}.
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-semibold text-[#F3F6FA]">
                            <span
                              className="h-3 w-3 shrink-0"
                              style={{ backgroundColor: comp.colorHex }}
                            />
                            <span>{comp.name}</span>
                          </div>
                          <div className="pl-5 text-[11px] text-[#8D9CAD]">
                            {getPersonalityLabel(comp.personality)} ·{' '}
                            <span
                              className={
                                metrics.isLiveVisible && !comp.isPlayer
                                  ? 'text-[#44B872]'
                                  : 'text-[#8D9CAD]'
                              }
                            >
                              {metrics.reportLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right text-[#CBD5E1]">
                          {ownedRegions.length} ·{' '}
                          {interpolate(dict.units.wellsCount, {
                            count: activeWells,
                          })}{' '}
                          ·{' '}
                          {interpolate(dict.units.tanksCount, {
                            count: totalTanks,
                          })}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right text-[#CBD5E1]">
                          {metrics.isLiveVisible ? (
                            <span>
                              {formatBarrels(comp.lastTurnProductionBbl)}
                              {dict.units.perMonth}
                            </span>
                          ) : hasQuarterlyNumbers ? (
                            <span className="text-[#9FB0C2]">
                              {formatBarrels(report.quarterlyProductionBbl)}{' '}
                              {dict.companiesView.barrels3Months}
                            </span>
                          ) : (
                            <span className="font-sans text-[#6F7E8F]">
                              {dict.companiesView.confidential}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right font-medium">
                          {metrics.isLiveVisible ? (
                            <span
                              className={
                                comp.lastTurnProfit >= 0
                                  ? 'text-[#44B872]'
                                  : 'text-[#E8665A]'
                              }
                            >
                              {comp.lastTurnProfit >= 0 ? '+' : ''}
                              {formatCurrency(comp.lastTurnProfit)}
                            </span>
                          ) : hasQuarterlyNumbers ? (
                            <span
                              className={
                                report.quarterlyProfit >= 0
                                  ? 'text-[#44B872]/85'
                                  : 'text-[#E8665A]/85'
                              }
                            >
                              {report.quarterlyProfit >= 0 ? '+' : ''}
                              {formatCurrency(report.quarterlyProfit)}{' '}
                              {dict.companiesView.profit3Months}
                            </span>
                          ) : (
                            <span className="font-sans text-[#6F7E8F]">
                              {dict.companiesView.confidential}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right text-[#CBD5E1]">
                          {formatCurrency(metrics.displayedCash)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-right font-bold text-[#E59A24]">
                          {formatCurrency(metrics.displayedNetWorth)}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCompanyDossier(comp.id)}
                              className="retro-button inline-flex items-center gap-1.5 bg-[#1D242D] px-2.5 py-1.5 text-[11px] font-semibold text-[#E6ECF2] hover:bg-[#2A3441] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Building2 className="h-3 w-3 text-[#E59A24]" />
                              <span>{dict.companiesView.shortDossierButton}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Desktop Visual Net Worth & Stockpile Intelligence Cards */}
            <div className="hidden md:grid grid-cols-2 gap-4 pt-1">
              {ranked.map((comp) => {
                const metrics = getVisibleCompanyMetrics(comp);
                const widthPct = Math.max(
                  4,
                  Math.min(
                    100,
                    Math.round((metrics.displayedNetWorth / maxWorth) * 100)
                  )
                );
                const targetPct = Math.min(
                  100,
                  Math.round(
                    (metrics.displayedNetWorth / state.victoryNetWorthTarget) *
                      100
                  )
                );

                const totalKnownStockpile = REGIONS_DATA.reduce((sum, r) => {
                  const rt = state.regions[r.id];
                  return rt.ownerCompanyId === comp.id
                    ? sum + rt.storedBarrels
                    : sum;
                }, 0);

                return (
                  <div
                    key={comp.id}
                    className="border border-[#2D3846] bg-[#141920] p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openCompanyDossier(comp.id)}
                        className="font-semibold text-[#F3F6FA] hover:text-[#E59A24] text-left cursor-pointer"
                      >
                        {comp.name}
                      </button>
                      <span className="font-mono tabular-nums text-[#9FB0C2]">
                        {interpolate(dict.companiesView.goalLabel, {
                          pct: targetPct,
                        })}
                      </span>
                    </div>
                    <div className="h-3 w-full bg-[#101419] border border-[#2B3543]">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: comp.colorHex,
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <span className="text-[#8D9CAD]">
                        „{getLocalizedCompanyMotto(comp, lang)}”
                      </span>
                      {metrics.isLiveVisible ? (
                        <span className="font-mono tabular-nums text-[#44B872] flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          <span>
                            {interpolate(dict.companiesView.stockpileLabel, {
                              amount: formatBarrels(totalKnownStockpile),
                            })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#8D9CAD] flex items-center gap-1">
                          <Lock className="h-3 w-3 text-[#E59A24]" />
                          <span>
                            {dict.companiesView.stockpileConfidentialHint}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUB-VIEW 2: COMPANY DOSSIER (PLAYER & RIVALS) */}
        {activeSubView === 'DOSSIER' && (
          <div className="space-y-6">
            {/* Intuitive 2x2 Mobile / 4-Col Desktop Company Selector */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#9FB0C2]">
                {dict.companiesView.selectCompanyLabel}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {state.companies.map((comp) => {
                  const isSelected = comp.id === selectedCompany.id;
                  const metrics = getVisibleCompanyMetrics(comp);
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => setSelectedCompanyId(comp.id)}
                      className={`min-h-[56px] flex flex-col justify-between gap-1 p-3 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-2 border-[#E59A24] bg-[#232D3B] text-[#F8FAFC]'
                          : 'border border-[#2D3846] bg-[#141920] text-[#CBD5E1] hover:border-[#475569] hover:bg-[#1B222C]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 w-full">
                        <span
                          className="h-3 w-3 shrink-0"
                          style={{ backgroundColor: comp.colorHex }}
                        />
                        <span className="text-xs font-bold truncate">
                          {comp.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] w-full pl-5">
                        <span className="text-[#8D9CAD] truncate">
                          {comp.isPlayer
                            ? dict.companiesView.playerTag
                            : dict.companiesView.rivalTag}
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#E59A24] shrink-0">
                          {formatCurrency(metrics.displayedNetWorth)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Company Identity & Analyst Action */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#2D3846] bg-[#141920] p-4 sm:p-5">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-4 w-4 shrink-0"
                    style={{ backgroundColor: selectedCompany.colorHex }}
                  />
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate">
                    {selectedCompany.name}
                  </h2>
                </div>
                <p className="text-xs text-[#9FB0C2]">
                  {getPersonalityLabel(selectedCompany.personality)} · „
                  {getLocalizedCompanyMotto(selectedCompany, lang)}” ·{' '}
                  <span
                    className={
                      selectedMetrics.isLiveVisible
                        ? 'text-[#44B872] font-medium'
                        : 'text-[#E59A24]'
                    }
                  >
                    {selectedMetrics.reportLabel}
                  </span>
                </p>
              </div>

              {!selectedCompany.isPlayer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full lg:w-auto">
                  <button
                    type="button"
                    disabled={player.cash < analystMinigameCfg.cost}
                    onClick={() => onStartAnalystMinigame(selectedCompany.id)}
                    className="retro-button min-h-[42px] flex flex-col items-start justify-center gap-0.5 bg-[#E59A24] px-4 py-2 text-left text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>{dict.companiesView.internalAuditButton}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums font-medium">
                      {interpolate(dict.companiesView.internalAuditDesc, {
                        cost: formatCurrency(analystMinigameCfg.cost),
                        months: analystMinigameCfg.rewardMonths,
                      })}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={player.cash < getExternalAnalystCost(state.difficulty)}
                    onClick={() => onHireAnalyst(selectedCompany.id)}
                    className="retro-button min-h-[42px] flex flex-col items-start justify-center gap-0.5 bg-[#25303C] px-4 py-2 text-left text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <Eye className="h-3.5 w-3.5 text-[#E59A24]" />
                      <span>{dict.companiesView.externalAnalystButton}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[#B4C1CF]">
                      {interpolate(dict.companiesView.externalAnalystDesc, {
                        cost: formatCurrency(
                          getExternalAnalystCost(state.difficulty)
                        ),
                        months: ANALYST_AUDIT_DURATION_MONTHS,
                      })}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* KPI & Balance Sheet Summary Grid */}
            {selectedMetrics.isLiveVisible ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                  <div className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.cashLabel}
                  </div>
                  <div
                    className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                      selectedCompany.cash < 0
                        ? 'text-[#E8665A]'
                        : 'text-[#44B872]'
                    }`}
                  >
                    {formatCurrency(selectedCompany.cash)}
                  </div>
                  <div className="text-[11px] text-[#8D9CAD]">
                    {dict.companiesView.liveCheckingAccount}
                  </div>
                </div>

                <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                  <div className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.creditLineLabel}
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#F3F6FA]">
                    {formatCurrency(selectedCompany.debt)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                    {dict.companiesView.freeCreditPrefix}{' '}
                    {formatCurrency(
                      Math.max(
                        0,
                        selectedCompany.creditLimit - selectedCompany.debt
                      )
                    )}
                  </div>
                </div>

                <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                  <div className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.netWorthLabel}
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#E59A24]">
                    {formatCurrency(selectedCompany.netWorth)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                    {interpolate(dict.companiesView.goalLabel, {
                      pct: Math.min(
                        100,
                        Math.round(
                          (selectedCompany.netWorth /
                            state.victoryNetWorthTarget) *
                            100
                        )
                      ),
                    })}
                  </div>
                </div>

                <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                  <div className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.monthlyOutputLabel}
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#E6ECF2]">
                    {formatBarrels(selectedCompany.lastTurnProductionBbl)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                    {dict.companiesView.quarterCumulativePrefix}{' '}
                    {formatBarrels(
                      selectedCompany.quarterAccumulatedProductionBbl
                    )}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                  <div className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.monthlyProfitLabel}
                  </div>
                  <div
                    className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                      selectedCompany.lastTurnProfit >= 0
                        ? 'text-[#44B872]'
                        : 'text-[#E8665A]'
                    }`}
                  >
                    {selectedCompany.lastTurnProfit >= 0 ? '+' : ''}
                    {formatCurrency(selectedCompany.lastTurnProfit)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                    {dict.companiesView.quarterCumulativePrefix}{' '}
                    {selectedCompany.quarterAccumulatedProfit >= 0 ? '+' : ''}
                    {formatCurrency(selectedCompany.quarterAccumulatedProfit)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                  <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                    <div className="text-xs text-[#8D9CAD]">
                      {dict.companiesView.reportedCash}
                    </div>
                    <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#CBD5E1]">
                      {formatCurrency(
                        selectedCompany.lastPublishedReport.cash
                      )}
                    </div>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {
                        getReportPeriodMetaI18n(
                          state.startYear,
                          state.startMonth,
                          selectedCompany.lastPublishedReport.reportedAtTurn,
                          lang
                        ).periodLabel
                      }
                    </div>
                  </div>

                  <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                    <div className="text-xs text-[#8D9CAD]">
                      {dict.companiesView.reportedDebt}
                    </div>
                    <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#CBD5E1]">
                      {formatCurrency(
                        selectedCompany.lastPublishedReport.debt
                      )}
                    </div>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {dict.companiesView.liveDebtConfidential}
                    </div>
                  </div>

                  <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                    <div className="text-xs text-[#8D9CAD]">
                      {dict.companiesView.knownCompanyValue}
                    </div>
                    <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#E59A24]">
                      {formatCurrency(
                        selectedCompany.lastPublishedReport.netWorth
                      )}
                    </div>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {dict.companiesView.lastReportSubtitle}
                    </div>
                  </div>

                  <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                    <div className="text-xs text-[#8D9CAD]">
                      {dict.companiesView.quarterlyProduction}
                    </div>
                    <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#CBD5E1]">
                      {selectedCompany.lastPublishedReport.reportedAtTurn >= 3
                        ? formatBarrels(
                            selectedCompany.lastPublishedReport
                              .quarterlyProductionBbl
                          )
                        : dict.companiesView.confidential}
                    </div>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {dict.companiesView.monthlyDataSecret}
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 space-y-1">
                    <div className="text-xs text-[#8D9CAD]">
                      {dict.companiesView.quarterlyProfit}
                    </div>
                    <div
                      className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                        selectedCompany.lastPublishedReport.reportedAtTurn < 3
                          ? 'text-[#8D9CAD]'
                          : selectedCompany.lastPublishedReport.quarterlyProfit >=
                              0
                            ? 'text-[#44B872]'
                            : 'text-[#E8665A]'
                      }`}
                    >
                      {selectedCompany.lastPublishedReport.reportedAtTurn >= 3
                        ? `${selectedCompany.lastPublishedReport.quarterlyProfit >= 0 ? '+' : ''}${formatCurrency(selectedCompany.lastPublishedReport.quarterlyProfit)}`
                        : dict.companiesView.confidential}
                    </div>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {selectedCompany.lastPublishedReport.reportedAtTurn >= 3
                        ? dict.companiesView.closedQuarterSubtitle
                        : dict.companiesView.firstReportTurn3}
                    </div>
                  </div>
                </div>

                <div className="flex items-start sm:items-center gap-2 border border-[#2D3846] bg-[#12161B] px-4 py-2.5 text-xs text-[#9FB0C2]">
                  <Lock className="h-3.5 w-3.5 mt-0.5 sm:mt-0 shrink-0 text-[#E59A24]" />
                  <span>{dict.companiesView.rivalSecrecyBanner}</span>
                </div>
              </div>
            )}

            {/* Net Worth Composition & Lifetime Totals (Player & Audited Rivals) */}
            {selectedMetrics.isLiveVisible && (
              <div className="border border-[#2D3846] bg-[#13181F] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232B35] pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-[#F3F6FA]">
                      {dict.companiesView.netWorthCompositionTitle}
                    </h3>
                    <div className="text-[11px] text-[#8D9CAD]">
                      {dict.companiesView.netWorthCompositionNote}
                    </div>
                  </div>
                  <div className="font-mono text-xs tabular-nums text-[#9FB0C2]">
                    {dict.companiesView.lifetimeRevenue}:{' '}
                    <span className="text-[#44B872]">
                      {formatCurrency(selectedCompany.totalRevenue)}
                    </span>{' '}
                    · {dict.companiesView.lifetimeExpenses}:{' '}
                    <span className="text-[#E8665A]">
                      {formatCurrency(selectedCompany.totalExpenses)}
                    </span>{' '}
                    · {dict.companiesView.lifetimeExtracted}:{' '}
                    <span className="text-[#E6ECF2]">
                      {formatBarrels(selectedCompany.totalBarrelsSold)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetCash}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {formatCurrency(selectedCompany.cash)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetStoredOil}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {formatCurrency(storedOilAssetValue)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetConcessions}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {formatCurrency(concessionsAssetValue)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetTanks}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {formatCurrency(tanksAssetValue)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetWells}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {formatCurrency(wellsAssetValue)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[#8D9CAD]">
                      {dict.companiesView.assetDebtDeduction}
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-[#E8665A]">
                      -{formatCurrency(selectedCompany.debt)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Owned Regions & Storage Breakdown */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#F3F6FA]">
                  {interpolate(dict.companiesView.regionalPresenceTitle, {
                    count: selectedOwnedRegions.length,
                  })}
                </h3>
                {!selectedMetrics.isLiveVisible && (
                  <span className="text-xs text-[#8D9CAD]">
                    {dict.companiesView.confidential}
                  </span>
                )}
              </div>

              {selectedOwnedRegions.length === 0 ? (
                <div className="border border-[#2D3846] bg-[#13181F] p-5 text-xs text-[#8D9CAD]">
                  {dict.companiesView.noConcessionsYet}
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-2.5 md:hidden">
                    {selectedOwnedRegions.map((rStatic) => {
                      const rt = state.regions[rStatic.id];
                      const regionWells = selectedWells.filter(
                        (w) =>
                          w.regionId === rStatic.id && w.status !== 'DEPLETED'
                      );
                      const cap = getRegionStorageCapacity(rStatic.id, rt);
                      const fillPct =
                        cap > 0
                          ? Math.round((rt.storedBarrels / cap) * 100)
                          : 0;
                      const locRegionName = getLocalizedRegion(
                        rStatic.id,
                        lang
                      ).name;
                      const locCrisisLabel = getLocalizedRegionCrisisLabel(
                        rStatic.id,
                        rt.crisisTemplateId,
                        state.activeEvents,
                        rt.crisisLabel,
                        lang
                      );

                      return (
                        <div
                          key={rStatic.id}
                          className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#F3F6FA]">
                              {locRegionName}{' '}
                              <span className="font-mono text-[11px] font-normal text-[#8D9CAD]">
                                ({rStatic.shortCode})
                              </span>
                            </span>
                            {rt.activeCrisisTurns > 0 ? (
                              <span className="text-[#E8665A] font-medium">
                                {locCrisisLabel} ·{' '}
                                {interpolate(dict.companiesView.crisisBadge, {
                                  turns: rt.activeCrisisTurns,
                                })}
                              </span>
                            ) : (
                              <span className="text-[#44B872]">
                                {dict.companiesView.regionStatusNormal}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-[#8D9CAD]">
                                {dict.companiesView.wellsLabel}{' '}
                              </span>
                              <span className="font-mono tabular-nums text-[#CBD5E1]">
                                {regionWells.length}/{rStatic.maxWellsAllowed}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#8D9CAD]">
                                {dict.companiesView.tanksLabel}{' '}
                              </span>
                              <span className="font-mono tabular-nums text-[#CBD5E1]">
                                {rt.tanksCount} {dict.units.piecesShort} (
                                {formatLocaleNumber(cap, lang)}{' '}
                                {dict.units.barrelShort})
                              </span>
                            </div>
                            <div>
                              <span className="text-[#8D9CAD]">
                                {dict.companiesView.storedLabel}{' '}
                              </span>
                              {selectedMetrics.isLiveVisible ? (
                                <span className="font-mono tabular-nums text-[#E6ECF2]">
                                  {formatBarrels(rt.storedBarrels)} ({fillPct}%)
                                </span>
                              ) : (
                                <span className="text-[#6F7E8F]">
                                  {dict.companiesView.confidential}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-[#8D9CAD]">
                                {dict.worldMap.remainingReserves}:{' '}
                              </span>
                              {selectedMetrics.isLiveVisible ? (
                                <span className="font-mono tabular-nums text-[#9FB0C2]">
                                  {formatBarrels(rt.remainingReservesBbl)}
                                </span>
                              ) : (
                                <span className="text-[#6F7E8F]">
                                  {dict.companiesView.confidential}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">
                            {dict.marketView.regionCol}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.wellsLabel.replace(/:\s*$/, '')}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.marketView.capacityCol}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.marketView.storedCol}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.worldMap.remainingReserves}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.colStatus}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232B35]">
                        {selectedOwnedRegions.map((rStatic) => {
                          const rt = state.regions[rStatic.id];
                          const regionWells = selectedWells.filter(
                            (w) =>
                              w.regionId === rStatic.id &&
                              w.status !== 'DEPLETED'
                          );
                          const cap = getRegionStorageCapacity(rStatic.id, rt);
                          const fillPct =
                            cap > 0
                              ? Math.round((rt.storedBarrels / cap) * 100)
                              : 0;
                          const locRegionName = getLocalizedRegion(
                            rStatic.id,
                            lang
                          ).name;
                          const locCrisisLabel = getLocalizedRegionCrisisLabel(
                            rStatic.id,
                            rt.crisisTemplateId,
                            state.activeEvents,
                            rt.crisisLabel,
                            lang
                          );

                          return (
                            <tr key={rStatic.id}>
                              <td className="px-4 py-2.5 font-semibold text-[#F3F6FA]">
                                {locRegionName}{' '}
                                <span className="font-mono text-[11px] font-normal text-[#8D9CAD]">
                                  ({rStatic.shortCode})
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                {regionWells.length} / {rStatic.maxWellsAllowed}
                              </td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                {rt.tanksCount} {dict.units.piecesShort} ·{' '}
                                {formatBarrels(cap)}
                              </td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right">
                                {selectedMetrics.isLiveVisible ? (
                                  <span className="text-[#E6ECF2]">
                                    {formatBarrels(rt.storedBarrels)} ({fillPct}
                                    %)
                                  </span>
                                ) : (
                                  <span className="font-sans text-[#6F7E8F]">
                                    {dict.companiesView.confidential}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 font-mono tabular-nums text-right">
                                {selectedMetrics.isLiveVisible ? (
                                  <span className="text-[#9FB0C2]">
                                    {formatBarrels(rt.remainingReservesBbl)}
                                  </span>
                                ) : (
                                  <span className="font-sans text-[#6F7E8F]">
                                    {dict.companiesView.confidential}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {rt.activeCrisisTurns > 0 ? (
                                  <span className="text-[#E8665A] font-medium">
                                    {locCrisisLabel} ·{' '}
                                    {interpolate(
                                      dict.companiesView.crisisBadge,
                                      { turns: rt.activeCrisisTurns }
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[#44B872]">
                                    {dict.companiesView.regionStatusNormal}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Wells Roster */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#F3F6FA]">
                {interpolate(dict.companiesView.wellsRosterTitle, {
                  count: selectedWells.length,
                })}
              </h3>

              {selectedMetrics.isLiveVisible ? (
                selectedWells.length === 0 ? (
                  <div className="border border-[#2D3846] bg-[#13181F] p-5 text-xs text-[#8D9CAD]">
                    {dict.companiesView.noWellsCompanyNotice}
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="space-y-2.5 md:hidden">
                      {selectedWells.map((well) => {
                        const rStatic = REGIONS_BY_ID[well.regionId];
                        const rt = state.regions[well.regionId];
                        const currentOutput = calculateWellMonthlyOutput(
                          well,
                          rt
                        );

                        return (
                          <div
                            key={well.id}
                            className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#F3F6FA]">
                                {getLocalizedWellDisplayName(well, lang)} ·{' '}
                                <span className="font-normal text-[#9FB0C2]">
                                  {rStatic.shortCode}
                                </span>
                              </span>
                              {well.status === 'ACTIVE' ? (
                                <span className="text-[#44B872] font-medium">
                                  {dict.worldMap.statusActive}
                                </span>
                              ) : well.status === 'PAUSED' ? (
                                <span className="text-[#E59A24] font-medium">
                                  {dict.worldMap.statusPaused}
                                </span>
                              ) : (
                                <span className="text-[#E8665A] font-medium">
                                  {dict.worldMap.statusDepleted}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums">
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.colMonthlyOutput}:{' '}
                                </span>
                                <span className="text-[#E6ECF2]">
                                  {formatBarrels(currentOutput)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.quotaAndBonusLabel}{' '}
                                </span>
                                <span className="text-[#CBD5E1]">
                                  {well.productionQuotaPct}% (+
                                  {well.efficiencyBonusPct}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">
                              {dict.companiesView.colWell}
                            </th>
                            <th className="px-4 py-2.5 font-semibold">
                              {dict.marketView.regionCol}
                            </th>
                            <th className="px-4 py-2.5 font-semibold">
                              {dict.companiesView.colStatus}
                            </th>
                            <th className="px-4 py-2.5 font-semibold text-right">
                              {dict.companiesView.colEfficiencyBonus}
                            </th>
                            <th className="px-4 py-2.5 font-semibold text-right">
                              {dict.companiesView.colQuota}
                            </th>
                            <th className="px-4 py-2.5 font-semibold text-right">
                              {dict.companiesView.colMonthlyOutput}
                            </th>
                            <th className="px-4 py-2.5 font-semibold text-right">
                              {dict.companiesView.colCumulativeExtracted}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232B35]">
                          {selectedWells.map((well) => {
                            const locRegionName = getLocalizedRegion(
                              well.regionId,
                              lang
                            ).name;
                            const rt = state.regions[well.regionId];
                            const currentOutput = calculateWellMonthlyOutput(
                              well,
                              rt
                            );

                            return (
                              <tr key={well.id}>
                                <td className="px-4 py-2.5 font-semibold text-[#F3F6FA]">
                                  {getLocalizedWellDisplayName(well, lang)}
                                </td>
                                <td className="px-4 py-2.5 text-[#CBD5E1]">
                                  {locRegionName}
                                </td>
                                <td className="px-4 py-2.5">
                                  {well.status === 'ACTIVE' ? (
                                    <span className="text-[#44B872] font-medium">
                                      {dict.worldMap.statusActive}
                                    </span>
                                  ) : well.status === 'PAUSED' ? (
                                    <span className="text-[#E59A24] font-medium">
                                      {dict.worldMap.statusPaused}
                                    </span>
                                  ) : (
                                    <span className="text-[#E8665A] font-medium">
                                      {dict.worldMap.statusDepleted}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                  +{well.efficiencyBonusPct}%
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                  {well.productionQuotaPct}%
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#E6ECF2]">
                                  {formatBarrels(currentOutput)}
                                  {dict.units.perMonth}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#9FB0C2]">
                                  {formatBarrels(well.totalExtractedBbl)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              ) : (
                <div className="border border-[#2D3846] bg-[#13181F] p-4 text-xs text-[#9FB0C2] flex items-start sm:items-center gap-2">
                  <Lock className="h-3.5 w-3.5 mt-0.5 sm:mt-0 shrink-0 text-[#E59A24]" />
                  <span>
                    {interpolate(
                      dict.companiesView.wellSatelliteSecretNotice,
                      { count: selectedWells.length }
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Company Quarterly & Annual Report History */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#F3F6FA]">
                {dict.companiesView.reportHistoryTitle}
              </h3>

              {(selectedCompany.reportHistory ?? []).length === 0 ? (
                <div className="border border-[#2D3846] bg-[#13181F] p-5 text-xs text-[#8D9CAD]">
                  {dict.companiesView.noCompanyReportsNotice}
                </div>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-2.5 md:hidden">
                    {[...(selectedCompany.reportHistory ?? [])]
                      .reverse()
                      .map((rep, idx, arr) => {
                        const prev = arr[idx + 1];
                        const deltaWorth = prev
                          ? rep.netWorth - prev.netWorth
                          : null;
                        const isAnnual = rep.periodType === 'ANNUAL';
                        const repPeriodLabel = getReportPeriodMetaI18n(
                          state.startYear,
                          state.startMonth,
                          rep.reportedAtTurn,
                          lang
                        ).periodLabel;

                        return (
                          <div
                            key={rep.reportedAtTurn}
                            className={`border p-3.5 space-y-2 text-xs ${
                              isAnnual
                                ? 'border-[#E59A24]/50 bg-[#E59A24]/10'
                                : 'border-[#2D3846] bg-[#13181F]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#F8FAFC]">
                                {repPeriodLabel}
                              </span>
                              <span className="font-mono text-[11px] text-[#9FB0C2]">
                                {interpolate(dict.companiesView.turnOrdinal, {
                                  turn: rep.reportedAtTurn,
                                })}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.productionLabel}:{' '}
                                </span>
                                <span className="text-[#E6ECF2]">
                                  {formatBarrels(rep.quarterlyProductionBbl)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.profitLabel}:{' '}
                                </span>
                                <span
                                  className={
                                    rep.quarterlyProfit >= 0
                                      ? 'text-[#44B872]'
                                      : 'text-[#E8665A]'
                                  }
                                >
                                  {rep.quarterlyProfit >= 0 ? '+' : ''}
                                  {formatCurrency(rep.quarterlyProfit)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.cashLabel}:{' '}
                                </span>
                                <span className="text-[#CBD5E1]">
                                  {formatCurrency(rep.cash)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.netWorthLabel}:{' '}
                                </span>
                                <span className="font-bold text-[#E59A24]">
                                  {formatCurrency(rep.netWorth)}
                                </span>
                                {deltaWorth !== null && (
                                  <span
                                    className={`ml-1 ${
                                      deltaWorth >= 0
                                        ? 'text-[#44B872]'
                                        : 'text-[#E8665A]'
                                    }`}
                                  >
                                    ({deltaWorth >= 0 ? '+' : ''}
                                    {formatCurrency(deltaWorth)})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">
                            {dict.companiesView.colPeriod}
                          </th>
                          <th className="px-4 py-2.5 font-semibold">
                            {dict.companiesView.colDateTurn}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.colPeriodOutput}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.colPeriodProfit}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.colClosingCashDebt}
                          </th>
                          <th className="px-4 py-2.5 font-semibold text-right">
                            {dict.companiesView.colClosingNetWorth}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232B35]">
                        {[...(selectedCompany.reportHistory ?? [])]
                          .reverse()
                          .map((rep, idx, arr) => {
                            const prev = arr[idx + 1];
                            const deltaWorth = prev
                              ? rep.netWorth - prev.netWorth
                              : null;
                            const isAnnual = rep.periodType === 'ANNUAL';
                            const repPeriodLabel = getReportPeriodMetaI18n(
                              state.startYear,
                              state.startMonth,
                              rep.reportedAtTurn,
                              lang
                            ).periodLabel;
                            const repDateLabel = formatGameDateI18n(
                              state.startYear,
                              state.startMonth,
                              rep.reportedAtTurn,
                              lang
                            );

                            return (
                              <tr
                                key={rep.reportedAtTurn}
                                className={isAnnual ? 'bg-[#E59A24]/5' : ''}
                              >
                                <td className="px-4 py-2.5 font-semibold text-[#F3F6FA]">
                                  {repPeriodLabel}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-[#9FB0C2]">
                                  {repDateLabel} ·{' '}
                                  {interpolate(dict.companiesView.turnOrdinal, {
                                    turn: rep.reportedAtTurn,
                                  })}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                  <div>
                                    {formatBarrels(rep.quarterlyProductionBbl)}{' '}
                                    {dict.companiesView.barrels3Months}
                                  </div>
                                  {isAnnual &&
                                    rep.annualProductionBbl !== undefined && (
                                      <div className="text-[11px] text-[#E59A24]">
                                        {dict.companiesView.annualPrefix}{' '}
                                        {formatBarrels(rep.annualProductionBbl)}
                                      </div>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right">
                                  <div
                                    className={
                                      rep.quarterlyProfit >= 0
                                        ? 'text-[#44B872]'
                                        : 'text-[#E8665A]'
                                    }
                                  >
                                    {rep.quarterlyProfit >= 0 ? '+' : ''}
                                    {formatCurrency(rep.quarterlyProfit)}{' '}
                                    {dict.companiesView.profit3Months}
                                  </div>
                                  {isAnnual &&
                                    rep.annualProfit !== undefined && (
                                      <div
                                        className={`text-[11px] ${
                                          rep.annualProfit >= 0
                                            ? 'text-[#44B872]'
                                            : 'text-[#E8665A]'
                                        }`}
                                      >
                                        {dict.companiesView.annualPrefix}{' '}
                                        {rep.annualProfit >= 0 ? '+' : ''}
                                        {formatCurrency(rep.annualProfit)}
                                      </div>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                                  <div>{formatCurrency(rep.cash)}</div>
                                  <div className="text-[11px] text-[#8D9CAD]">
                                    {dict.companiesView.debtPrefix}{' '}
                                    {formatCurrency(rep.debt)}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-right">
                                  <div className="font-bold text-[#E59A24]">
                                    {formatCurrency(rep.netWorth)}
                                  </div>
                                  {deltaWorth !== null && (
                                    <div
                                      className={`text-[11px] ${
                                        deltaWorth >= 0
                                          ? 'text-[#44B872]'
                                          : 'text-[#E8665A]'
                                      }`}
                                    >
                                      {deltaWorth >= 0 ? '+' : ''}
                                      {formatCurrency(deltaWorth)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* SUB-VIEW 3: QUARTERLY & ANNUAL REPORTS ARCHIVE */}
        {activeSubView === 'REPORTS' && (
          <div className="space-y-5">
            {availablePeriods.length === 0 || effectiveReportTurn === null ? (
              <div className="space-y-4">
                <div className="border border-[#2D3846] bg-[#13181F] p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#F3F6FA]">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-[#E59A24]" />
                    <span>{dict.companiesView.noReportsTitle}</span>
                  </div>
                  <p className="text-xs text-[#9FB0C2]">
                    {dict.companiesView.noReportsDesc}
                  </p>
                </div>

                {/* Mobile Opening Cards */}
                <div className="space-y-2.5 md:hidden">
                  {state.companies.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => openCompanyDossier(comp.id)}
                      className="w-full text-left border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1.5 text-xs hover:bg-[#1C232D] cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-[#F3F6FA]">
                          <span
                            className="h-3 w-3 shrink-0"
                            style={{ backgroundColor: comp.colorHex }}
                          />
                          <span>{comp.name}</span>
                        </div>
                        <span className="font-mono font-bold tabular-nums text-[#E59A24]">
                          {formatCurrency(comp.lastPublishedReport.netWorth)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9FB0C2]">
                        {
                          getReportPeriodMetaI18n(
                            state.startYear,
                            state.startMonth,
                            comp.lastPublishedReport.reportedAtTurn,
                            lang
                          ).periodLabel
                        }{' '}
                        ·{' '}
                        {formatGameDateI18n(
                          state.startYear,
                          state.startMonth,
                          comp.lastPublishedReport.reportedAtTurn,
                          lang
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Desktop Opening Table */}
                <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">
                          {dict.companiesView.colCompany}
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          {dict.companiesView.colPeriod}
                        </th>
                        <th className="px-4 py-3 font-semibold text-right">
                          {dict.companiesView.colOpeningCash}
                        </th>
                        <th className="px-4 py-3 font-semibold text-right">
                          {dict.companiesView.colOpeningNetWorth}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232B35]">
                      {state.companies.map((comp) => (
                        <tr
                          key={comp.id}
                          onClick={() => openCompanyDossier(comp.id)}
                          className="cursor-pointer hover:bg-[#1C232D]"
                        >
                          <td className="px-4 py-3 font-semibold text-[#F3F6FA]">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 shrink-0"
                                style={{ backgroundColor: comp.colorHex }}
                              />
                              <span>{comp.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#9FB0C2]">
                            {
                              getReportPeriodMetaI18n(
                                state.startYear,
                                state.startMonth,
                                comp.lastPublishedReport.reportedAtTurn,
                                lang
                              ).periodLabel
                            }{' '}
                            ·{' '}
                            {formatGameDateI18n(
                              state.startYear,
                              state.startMonth,
                              comp.lastPublishedReport.reportedAtTurn,
                              lang
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-right text-[#CBD5E1]">
                            {formatCurrency(comp.lastPublishedReport.cash)}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-right font-bold text-[#E59A24]">
                            {formatCurrency(comp.lastPublishedReport.netWorth)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Period Selector Strip */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#9FB0C2]">
                    {dict.companiesView.selectPeriodLabel}
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 border border-[#2D3846] bg-[#13181F] p-2">
                    {availablePeriods.map(({ turn, snapshot }) => {
                      const isSelected = turn === effectiveReportTurn;
                      const isAnnual = snapshot.periodType === 'ANNUAL';
                      const periodMeta = getReportPeriodMetaI18n(
                        state.startYear,
                        state.startMonth,
                        turn,
                        lang
                      );
                      return (
                        <button
                          key={turn}
                          type="button"
                          onClick={() => setSelectedReportTurn(turn)}
                          className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-[#E59A24] text-[#12161B]'
                              : isAnnual
                                ? 'bg-[#222B36] text-[#F9D697] border border-[#E59A24]/50 hover:bg-[#2B3644]'
                                : 'bg-[#181F28] text-[#A2B0C0] border border-[#2A3441] hover:text-[#F3F6FA]'
                          }`}
                        >
                          {periodMeta.periodLabel} (
                          {interpolate(dict.companiesView.turnOrdinal, { turn })}
                          )
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Period Cross-Company Table & Mobile Cards */}
                {(() => {
                  const selectedMeta = availablePeriods.find(
                    (p) => p.turn === effectiveReportTurn
                  );
                  const isAnnualPeriod =
                    selectedMeta?.snapshot.periodType === 'ANNUAL';
                  const selectedPeriodLabel = getReportPeriodMetaI18n(
                    state.startYear,
                    state.startMonth,
                    effectiveReportTurn,
                    lang
                  ).periodLabel;
                  const selectedPeriodDateLabel = formatGameDateI18n(
                    state.startYear,
                    state.startMonth,
                    effectiveReportTurn,
                    lang
                  );

                  const periodRows = state.companies
                    .map((comp) => {
                      const history = comp.reportHistory ?? [];
                      const index = history.findIndex(
                        (r) => r.reportedAtTurn === effectiveReportTurn
                      );
                      const snap =
                        index >= 0 ? history[index] : comp.lastPublishedReport;
                      const prevSnap = index > 0 ? history[index - 1] : null;
                      const deltaWorth = prevSnap
                        ? snap.netWorth - prevSnap.netWorth
                        : null;
                      return {
                        company: comp,
                        snap,
                        deltaWorth,
                      };
                    })
                    .sort((a, b) => b.snap.netWorth - a.snap.netWorth);

                  return (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9FB0C2]">
                        <span>
                          {interpolate(dict.companiesView.periodMetaLine, {
                            period: selectedPeriodLabel,
                            date: selectedPeriodDateLabel,
                            turn: effectiveReportTurn,
                          })}
                        </span>
                        <span className="hidden md:inline">
                          {dict.companiesView.periodRowHint}
                        </span>
                      </div>

                      {/* Mobile Report Cards */}
                      <div className="space-y-2.5 md:hidden">
                        {periodRows.map((row, idx) => (
                          <div
                            key={row.company.id}
                            className={`border p-3.5 space-y-2.5 text-xs ${
                              row.company.isPlayer
                                ? 'border-[#E59A24]/60 bg-[#E59A24]/10'
                                : 'border-[#2D3846] bg-[#13181F]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 font-semibold text-[#F8FAFC] min-w-0">
                                <span className="font-mono text-[#9FB0C2]">
                                  {idx + 1}.
                                </span>
                                <span
                                  className="h-3 w-3 shrink-0"
                                  style={{
                                    backgroundColor: row.company.colorHex,
                                  }}
                                />
                                <span className="truncate">
                                  {row.company.name}
                                </span>
                              </div>
                              <span className="font-mono font-bold tabular-nums text-[#E59A24] shrink-0">
                                {formatCurrency(row.snap.netWorth)}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.productionLabel}{' '}
                                  {dict.companiesView.barrels3Months}:{' '}
                                </span>
                                <span className="text-[#E6ECF2]">
                                  {formatBarrels(
                                    row.snap.quarterlyProductionBbl
                                  )}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.profitLabel}{' '}
                                  {dict.companiesView.profit3Months}:{' '}
                                </span>
                                <span
                                  className={
                                    row.snap.quarterlyProfit >= 0
                                      ? 'text-[#44B872]'
                                      : 'text-[#E8665A]'
                                  }
                                >
                                  {row.snap.quarterlyProfit >= 0 ? '+' : ''}
                                  {formatCurrency(row.snap.quarterlyProfit)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.cashLabel}:{' '}
                                </span>
                                <span className="text-[#CBD5E1]">
                                  {formatCurrency(row.snap.cash)}
                                </span>
                              </div>
                              <div>
                                <span className="font-sans text-[#8D9CAD]">
                                  {dict.companiesView.debtPrefix}{' '}
                                </span>
                                <span className="text-[#CBD5E1]">
                                  {formatCurrency(row.snap.debt)}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => openCompanyDossier(row.company.id)}
                              className="retro-button w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 bg-[#1F2833] px-3 py-1.5 text-xs font-semibold text-[#F3F6FA] hover:bg-[#2A3645] cursor-pointer"
                            >
                              <Building2 className="h-3.5 w-3.5 text-[#E59A24]" />
                              <span>{dict.companiesView.openDossierButton}</span>
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Cross-Company Table */}
                      <div className="hidden md:block overflow-x-auto border border-[#2D3846] bg-[#13181F]">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                            <tr>
                              <th className="px-4 py-3 font-semibold">#</th>
                              <th className="px-4 py-3 font-semibold">
                                {dict.companiesView.colCompany}
                              </th>
                              <th className="px-4 py-3 font-semibold text-right">
                                {isAnnualPeriod
                                  ? dict.companiesView.colAnnualOrQ4Output
                                  : dict.companiesView.quarterlyProduction}
                              </th>
                              <th className="px-4 py-3 font-semibold text-right">
                                {isAnnualPeriod
                                  ? dict.companiesView.colAnnualOrQ4Profit
                                  : dict.companiesView.quarterlyProfit}
                              </th>
                              <th className="px-4 py-3 font-semibold text-right">
                                {dict.companiesView.colClosingCashDebt}
                              </th>
                              <th className="px-4 py-3 font-semibold text-right">
                                {dict.companiesView.colClosingNetWorth}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#232B35]">
                            {periodRows.map((row, idx) => (
                              <tr
                                key={row.company.id}
                                onClick={() =>
                                  openCompanyDossier(row.company.id)
                                }
                                className={`cursor-pointer transition-colors ${
                                  row.company.isPlayer
                                    ? 'bg-[#E59A24]/10 hover:bg-[#E59A24]/15'
                                    : 'hover:bg-[#1C232D]'
                                }`}
                              >
                                <td className="px-4 py-3 font-mono tabular-nums text-[#8D9CAD]">
                                  {idx + 1}.
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 font-semibold text-[#F3F6FA]">
                                    <span
                                      className="h-3 w-3 shrink-0"
                                      style={{
                                        backgroundColor: row.company.colorHex,
                                      }}
                                    />
                                    <span>{row.company.name}</span>
                                  </div>
                                  <div className="pl-5 text-[11px] text-[#8D9CAD]">
                                    {getPersonalityLabel(
                                      row.company.personality
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono tabular-nums text-right text-[#E6ECF2]">
                                  <div>
                                    {formatBarrels(
                                      row.snap.quarterlyProductionBbl
                                    )}{' '}
                                    {dict.companiesView.barrels3Months}
                                  </div>
                                  {isAnnualPeriod &&
                                    row.snap.annualProductionBbl !==
                                      undefined && (
                                      <div className="text-[11px] text-[#E59A24]">
                                        {dict.companiesView.annualPrefix}{' '}
                                        {formatBarrels(
                                          row.snap.annualProductionBbl
                                        )}
                                      </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-mono tabular-nums text-right font-medium">
                                  <div
                                    className={
                                      row.snap.quarterlyProfit >= 0
                                        ? 'text-[#44B872]'
                                        : 'text-[#E8665A]'
                                    }
                                  >
                                    {row.snap.quarterlyProfit >= 0 ? '+' : ''}
                                    {formatCurrency(
                                      row.snap.quarterlyProfit
                                    )}{' '}
                                    {dict.companiesView.profit3Months}
                                  </div>
                                  {isAnnualPeriod &&
                                    row.snap.annualProfit !== undefined && (
                                      <div
                                        className={`text-[11px] ${
                                          row.snap.annualProfit >= 0
                                            ? 'text-[#44B872]'
                                            : 'text-[#E8665A]'
                                        }`}
                                      >
                                        {dict.companiesView.annualPrefix}{' '}
                                        {row.snap.annualProfit >= 0 ? '+' : ''}
                                        {formatCurrency(row.snap.annualProfit)}
                                      </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 font-mono tabular-nums text-right text-[#CBD5E1]">
                                  <div>{formatCurrency(row.snap.cash)}</div>
                                  <div className="text-[11px] text-[#8D9CAD]">
                                    {dict.companiesView.debtPrefix}{' '}
                                    {formatCurrency(row.snap.debt)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono tabular-nums text-right">
                                  <div className="font-bold text-[#E59A24]">
                                    {formatCurrency(row.snap.netWorth)}
                                  </div>
                                  {row.deltaWorth !== null && (
                                    <div
                                      className={`inline-flex items-center justify-end gap-1 text-[11px] ${
                                        row.deltaWorth >= 0
                                          ? 'text-[#44B872]'
                                          : 'text-[#E8665A]'
                                      }`}
                                    >
                                      {row.deltaWorth >= 0 ? (
                                        <TrendingUp className="h-3 w-3" />
                                      ) : (
                                        <TrendingDown className="h-3 w-3" />
                                      )}
                                      <span>
                                        {row.deltaWorth >= 0 ? '+' : ''}
                                        {formatCurrency(row.deltaWorth)}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
