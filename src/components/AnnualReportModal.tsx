/**
 * Year-end automatic summary modal showing published annual and Q4 financial results
 * for all active corporations at every 12th turn close.
 */

import React from 'react';
import { FileSpreadsheet, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Company, GameState, QuarterlyReportSnapshot } from '../engine/gameTypes';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
  getReportPeriodMetaI18n,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface AnnualReportModalProps {
  state: GameState;
  reportTurn: number;
  onClose: () => void;
  onOpenReportsArchive: () => void;
}

function findSnapshotForTurn(
  company: Company,
  turn: number
): QuarterlyReportSnapshot {
  const exact = company.reportHistory.find((r) => r.reportedAtTurn === turn);
  if (exact) return exact;
  return company.lastPublishedReport;
}

function findPreviousYearSnapshot(
  company: Company,
  currentTurn: number
): QuarterlyReportSnapshot | null {
  const prevAnnualTurn = currentTurn - 12;
  if (prevAnnualTurn >= 12) {
    const found = company.reportHistory.find(
      (r) => r.reportedAtTurn === prevAnnualTurn
    );
    if (found) return found;
  }
  return null;
}

export const AnnualReportModal: React.FC<AnnualReportModalProps> = ({
  state,
  reportTurn,
  onClose,
  onOpenReportsArchive,
}) => {
  const { lang, dict } = useI18n();
  const a = dict.annualReport;
  const meta = getReportPeriodMetaI18n(
    state.startYear,
    state.startMonth,
    reportTurn,
    lang
  );
  const reportDateLabel = formatGameDateI18n(
    state.startYear,
    state.startMonth,
    reportTurn,
    lang
  );

  const rows = state.companies
    .map((company) => {
      const snapshot = findSnapshotForTurn(company, reportTurn);
      const prevYear = findPreviousYearSnapshot(company, reportTurn);
      const baselineNetWorth = prevYear
        ? prevYear.netWorth
        : company.isPlayer
          ? state.companies.find((c) => c.isPlayer)?.lastPublishedReport
              .netWorth ?? snapshot.netWorth
          : snapshot.netWorth;

      const annualDelta = prevYear
        ? snapshot.netWorth - prevYear.netWorth
        : null;

      return {
        company,
        snapshot,
        annualDelta,
        baselineNetWorth,
      };
    })
    .sort((aRow, bRow) => bRow.snapshot.netWorth - aRow.snapshot.netWorth);

  const leader = rows[0];
  const playerRowIndex = rows.findIndex((r) => r.company.isPlayer);
  const playerRow = rows[playerRowIndex];
  const playerAnnualProfit =
    playerRow?.snapshot.annualProfit ?? playerRow?.snapshot.quarterlyProfit ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="annual-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/85 p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[960px] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#354150] bg-[#161C24] px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#E59A24]" />
            <div className="min-w-0">
              <h2
                id="annual-report-title"
                className="font-display text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(a.title, { year: meta.year })}
              </h2>
              <p className="text-xs text-[#9FB0C2]">
                {reportDateLabel} ·{' '}
                {interpolate(a.subtitle, { turn: reportTurn })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={dict.saveLoadModal.closeAria}
            className="retro-button bg-[#232B35] p-1.5 text-[#CBD5E1] hover:bg-[#2F3A48] shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Year-End Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-[#2D3846] bg-[#13181F] p-4 space-y-1">
              <div className="text-xs text-[#8D9CAD]">
                {interpolate(a.yearWinnerTitle, { year: meta.year })}
              </div>
              <div className="font-semibold text-sm text-[#F3F6FA] truncate">
                {leader?.company.name}
              </div>
              <div className="font-mono text-sm font-bold tabular-nums text-[#E59A24]">
                {leader ? formatCurrencyI18n(leader.snapshot.netWorth, lang) : '$0'}
              </div>
            </div>

            <div className="border border-[#2D3846] bg-[#13181F] p-4 space-y-1">
              <div className="text-xs text-[#8D9CAD]">{dict.topBar.spotPrice}</div>
              <div className="font-mono text-base font-bold tabular-nums text-[#E59A24]">
                ${state.market.spotPricePerBarrel.toFixed(2)} {dict.units.perBarrel}
              </div>
              <div className="text-xs text-[#9FB0C2]">
                {dict.marketCycles[state.market.cyclePhase].label}
              </div>
            </div>

            <div className="border border-[#2D3846] bg-[#13181F] p-4 space-y-1">
              <div className="text-xs text-[#8D9CAD]">{a.colYearlyResult}</div>
              <div className="font-mono text-sm font-bold tabular-nums text-[#F3F6FA]">
                #{playerRowIndex + 1} ·{' '}
                <span
                  className={
                    playerAnnualProfit >= 0
                      ? 'text-[#44B872]'
                      : 'text-[#E8665A]'
                  }
                >
                  {playerAnnualProfit >= 0 ? '+' : ''}
                  {formatCurrencyI18n(playerAnnualProfit, lang)}
                </span>
              </div>
              <div className="text-xs font-mono tabular-nums text-[#9FB0C2]">
                {a.colNetWorth}:{' '}
                {playerRow
                  ? formatCurrencyI18n(playerRow.snapshot.netWorth, lang)
                  : '$0'}
              </div>
            </div>
          </div>

          {/* All Active Companies Annual Table */}
          <div className="overflow-x-auto border border-[#2D3846] bg-[#13181F]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#2D3846] bg-[#181F28] text-[#9FB0C2]">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">{a.colCompany}</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {a.colYearlyOutput}
                  </th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {a.colYearlyResult}
                  </th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {a.colClosingCash}
                  </th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {a.colNetWorth}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B35]">
                {rows.map((row, idx) => {
                  const annualProd =
                    row.snapshot.annualProductionBbl ??
                    row.snapshot.quarterlyProductionBbl;
                  const annualProf =
                    row.snapshot.annualProfit ?? row.snapshot.quarterlyProfit;

                  return (
                    <tr
                      key={row.company.id}
                      className={row.company.isPlayer ? 'bg-[#E59A24]/10' : ''}
                    >
                      <td className="px-4 py-3 font-mono tabular-nums text-[#8D9CAD]">
                        {idx + 1}.
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-semibold text-[#F3F6FA]">
                          <span
                            className="h-3 w-3 shrink-0"
                            style={{ backgroundColor: row.company.colorHex }}
                          />
                          <span>{row.company.name}</span>
                        </div>
                        <div className="pl-5 text-[11px] text-[#8D9CAD]">
                          {row.company.isPlayer
                            ? dict.companiesView.playerTag
                            : dict.companiesView.rivalTag}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right">
                        <div className="text-[#E6ECF2] font-semibold">
                          {formatBarrelsI18n(annualProd, lang)}
                        </div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          Q4:{' '}
                          {formatBarrelsI18n(
                            row.snapshot.quarterlyProductionBbl,
                            lang
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right">
                        <div
                          className={`font-semibold ${
                            annualProf >= 0
                              ? 'text-[#44B872]'
                              : 'text-[#E8665A]'
                          }`}
                        >
                          {annualProf >= 0 ? '+' : ''}
                          {formatCurrencyI18n(annualProf, lang)}
                        </div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          Q4: {row.snapshot.quarterlyProfit >= 0 ? '+' : ''}
                          {formatCurrencyI18n(row.snapshot.quarterlyProfit, lang)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right">
                        <div className="text-[#CBD5E1]">
                          {formatCurrencyI18n(row.snapshot.cash, lang)}
                        </div>
                        <div className="text-[11px] text-[#8D9CAD]">
                          {dict.topBar.debt}:{' '}
                          {formatCurrencyI18n(row.snapshot.debt, lang)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-right">
                        <div className="font-bold text-[#E59A24]">
                          {formatCurrencyI18n(row.snapshot.netWorth, lang)}
                        </div>
                        {row.annualDelta !== null && (
                          <div
                            className={`inline-flex items-center justify-end gap-1 text-[11px] ${
                              row.annualDelta >= 0
                                ? 'text-[#44B872]'
                                : 'text-[#E8665A]'
                            }`}
                          >
                            {row.annualDelta >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span>
                              {row.annualDelta >= 0 ? '+' : ''}
                              {formatCurrencyI18n(row.annualDelta, lang)} YoY
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-[#8D9CAD]">
              {dict.companiesView.tabReportsLong}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenReportsArchive}
                className="retro-button bg-[#232B35] px-4 py-2 text-xs font-semibold text-[#E6ECF2] hover:bg-[#2F3A48] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.companiesView.tabReportsShort}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="retro-button bg-[#E59A24] px-5 py-2 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {a.closeButton}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
