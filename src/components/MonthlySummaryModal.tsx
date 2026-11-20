/**
 * End-of-turn monthly financial summary modal with a compact turn-closing costs opening card
 * and an expandable two-column detailed financial ledger.
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Landmark,
  Receipt,
  X,
} from 'lucide-react';
import { MonthlyTurnSummary } from '../engine/gameTypes';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface MonthlySummaryModalProps {
  summary: MonthlyTurnSummary;
  startYear?: number;
  startMonth?: number;
  hasPendingAnnualReport: boolean;
  onClose: () => void;
}

interface ClosingCostsBlockProps {
  summary: MonthlyTurnSummary;
}

const ClosingCostsBlock: React.FC<ClosingCostsBlockProps> = ({ summary }) => {
  const { lang, dict } = useI18n();
  const m = dict.monthlySummary;

  return (
    <div className="border border-[#E59A24]/45 bg-[#181D24]">
      <div className="flex items-center justify-between gap-3 border-b border-[#2D3846] bg-[#211E17] px-3.5 py-2.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-xs font-bold tracking-wide text-[#E59A24] whitespace-nowrap">
            {m.closingCostsTitle}
          </h3>
        </div>
        <span
          className={`font-mono text-xs sm:text-sm font-bold tabular-nums shrink-0 ${
            summary.closingCostsTotal > 0 ? 'text-[#E8665A]' : 'text-[#8D9CAD]'
          }`}
        >
          {summary.closingCostsTotal > 0 ? '-' : ''}
          {formatCurrencyI18n(summary.closingCostsTotal, lang)}
        </span>
      </div>

      <div className="divide-y divide-[#232B35] px-3.5 py-1 text-xs">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-[#CBD5E1]">{m.wellOpexLabel}</span>
          <span
            className={`font-mono font-semibold tabular-nums shrink-0 ${
              summary.wellOpexCost > 0 ? 'text-[#E8665A]' : 'text-[#6F7E8F]'
            }`}
          >
            {summary.wellOpexCost > 0 ? '-' : ''}
            {formatCurrencyI18n(summary.wellOpexCost, lang)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-[#CBD5E1]">{m.storageCostLabel}</span>
          <span
            className={`font-mono font-semibold tabular-nums shrink-0 ${
              summary.storageCost > 0 ? 'text-[#E8665A]' : 'text-[#6F7E8F]'
            }`}
          >
            {summary.storageCost > 0 ? '-' : ''}
            {formatCurrencyI18n(summary.storageCost, lang)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="space-y-0.5">
            <div className="font-semibold text-[#F3F6FA]">
              {m.debtInterestLabel}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
              {dict.marketView.currentDebt}:{' '}
              {formatCurrencyI18n(summary.endingDebt, lang)}
            </div>
          </div>
          <span
            className={`font-mono font-bold tabular-nums shrink-0 ${
              summary.debtInterestCost > 0 ? 'text-[#E8665A]' : 'text-[#6F7E8F]'
            }`}
          >
            {summary.debtInterestCost > 0 ? '-' : ''}
            {formatCurrencyI18n(summary.debtInterestCost, lang)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-[#CBD5E1]">{m.crisisRepairLabel}</span>
          <span
            className={`font-mono font-semibold tabular-nums shrink-0 ${
              summary.crisisRepairCost > 0 ? 'text-[#E8665A]' : 'text-[#6F7E8F]'
            }`}
          >
            {summary.crisisRepairCost > 0 ? '-' : ''}
            {formatCurrencyI18n(summary.crisisRepairCost, lang)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const MonthlySummaryModal: React.FC<MonthlySummaryModalProps> = ({
  summary,
  startYear,
  startMonth,
  hasPendingAnnualReport,
  onClose,
}) => {
  const { lang, dict } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setShowDetails(false);
  }, [summary.closedTurn]);

  const m = dict.monthlySummary;
  const closedDate =
    typeof startYear === 'number' && typeof startMonth === 'number'
      ? formatGameDateI18n(startYear, startMonth, summary.closedTurn, lang)
      : summary.closedDateLabel;

  const netCashPositive = summary.netCashChange >= 0;
  const operatingPositive = summary.operatingProfitLoss >= 0;
  const availableCredit = Math.max(0, summary.creditLimit - summary.endingDebt);
  const continueLabel = hasPendingAnnualReport
    ? m.continueToAnnual
    : m.continueToNextMonth;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-summary-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/85 p-3 sm:p-4 overflow-y-auto"
    >
      <div
        className={`retro-panel w-full overflow-hidden my-auto ${
          showDetails ? 'max-w-[920px]' : 'max-w-[540px]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#354150] bg-[#161C24] px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Receipt className="h-5 w-5 shrink-0 text-[#E59A24]" />
            <div className="min-w-0">
              <h2
                id="monthly-summary-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(
                  showDetails ? m.dialogTitleFull : m.dialogTitleCompact,
                  { date: closedDate }
                )}
              </h2>
              <p className="text-xs text-[#9FB0C2]">
                {interpolate(m.closedTurnSubtitle, { turn: summary.closedTurn })}{' '}
                · {m.spotAfterClose}{' '}
                <span className="font-mono tabular-nums text-[#E59A24]">
                  ${summary.spotPriceAfterClose.toFixed(2)} {dict.units.perBarrel}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={dict.saveLoadModal.closeAria}
            className="retro-button bg-[#232B35] p-2 text-[#CBD5E1] hover:bg-[#2F3A48] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E59A24] shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {!showDetails ? (
          /* Stage 1: Compact Turn-Closing Costs & Ending Cash View */
          <div className="p-4 sm:p-6 space-y-4">
            <ClosingCostsBlock summary={summary} />

            {/* Compact Two-Figure Balance Strip */}
            <div className="border border-[#2D3846] bg-[#13181F] px-4 py-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <div className="text-xs text-[#8D9CAD]">
                  {m.totalClosingCosts}
                </div>
                <div
                  className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                    summary.closingCostsTotal > 0
                      ? 'text-[#E8665A]'
                      : 'text-[#CBD5E1]'
                  }`}
                >
                  {summary.closingCostsTotal > 0 ? '-' : ''}
                  {formatCurrencyI18n(summary.closingCostsTotal, lang)}
                </div>
              </div>

              <div className="space-y-0.5 sm:text-right">
                <div className="text-xs text-[#8D9CAD]">{m.closingCashLabel}</div>
                <div
                  className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                    summary.endingCash < 0
                      ? 'text-[#E8665A]'
                      : 'text-[#E59A24]'
                  }`}
                >
                  {formatCurrencyI18n(summary.endingCash, lang)}
                </div>
              </div>
            </div>

            {/* Compact Two-Button Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  soundFx.click();
                  setShowDetails(true);
                }}
                className="retro-button inline-flex items-center gap-2 bg-[#232B35] px-4 py-2.5 text-xs font-semibold text-[#E6ECF2] hover:bg-[#2F3A48] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E59A24] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5 text-[#9FB0C2]" />
                {m.detailsButton}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="retro-button bg-[#E59A24] px-5 py-2.5 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {continueLabel}
              </button>
            </div>
          </div>
        ) : (
          /* Stage 2: Full Monthly Ledger Breakdown (no Back button) */
          <div className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Top 4-Card KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1">
                <div className="text-xs text-[#8D9CAD]">
                  {m.totalInflowsLabel}
                </div>
                <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#44B872]">
                  +{formatCurrencyI18n(summary.totalInflows, lang)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                  {formatBarrelsI18n(summary.barrelsSold, lang)}
                </div>
              </div>

              <div className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1">
                <div className="text-xs text-[#8D9CAD]">
                  {m.totalOutflowsLabel}
                </div>
                <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-[#E8665A]">
                  -{formatCurrencyI18n(summary.totalOutflows, lang)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                  {m.totalClosingCosts}:{' '}
                  -{formatCurrencyI18n(summary.closingCostsTotal, lang)}
                </div>
              </div>

              <div className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1">
                <div className="text-xs text-[#8D9CAD]">
                  {m.kpiNetCashChange}
                </div>
                <div
                  className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                    netCashPositive ? 'text-[#44B872]' : 'text-[#E8665A]'
                  }`}
                >
                  {netCashPositive ? '+' : ''}
                  {formatCurrencyI18n(summary.netCashChange, lang)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                  {m.kpiOperatingResult}:{' '}
                  <span
                    className={
                      operatingPositive ? 'text-[#44B872]' : 'text-[#E8665A]'
                    }
                  >
                    {operatingPositive ? '+' : ''}
                    {formatCurrencyI18n(summary.operatingProfitLoss, lang)}
                  </span>
                </div>
              </div>

              <div className="border border-[#2D3846] bg-[#13181F] p-3.5 space-y-1">
                <div className="text-xs text-[#8D9CAD]">
                  {m.closingCashLabel}
                </div>
                <div
                  className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                    summary.endingCash < 0
                      ? 'text-[#E8665A]'
                      : 'text-[#E59A24]'
                  }`}
                >
                  {formatCurrencyI18n(summary.endingCash, lang)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                  {dict.topBar.debt}:{' '}
                  {formatCurrencyI18n(summary.endingDebt, lang)}
                </div>
              </div>
            </div>

            {/* Two-Column Separated Revenue & Expenses Ledger */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT COLUMN: INFLOWS */}
              <div className="flex flex-col border border-[#2E9E5B]/40 bg-[#13181F]">
                <div className="flex items-center justify-between gap-2 border-b border-[#2E9E5B]/30 bg-[#16291E] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-[#44B872]" />
                    <h3 className="text-xs sm:text-sm font-bold tracking-wide text-[#A2E4BC]">
                      {m.inflowsTitle}
                    </h3>
                  </div>
                  <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-[#44B872]">
                    +{formatCurrencyI18n(summary.totalInflows, lang)}
                  </span>
                </div>

                <div className="flex-1 divide-y divide-[#232B35] px-4 py-1 text-xs">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#F3F6FA]">
                        {m.oilSalesLabel}
                      </div>
                      <div className="text-[11px] text-[#8D9CAD]">
                        {formatBarrelsI18n(summary.barrelsSold, lang)}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        summary.oilSalesRevenue > 0
                          ? 'text-[#44B872]'
                          : 'text-[#6F7E8F]'
                      }`}
                    >
                      {summary.oilSalesRevenue > 0 ? '+' : ''}
                      {formatCurrencyI18n(summary.oilSalesRevenue, lang)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#F3F6FA]">
                        {m.loanTakenLabel}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        summary.bankLoanTaken > 0
                          ? 'text-[#E59A24]'
                          : 'text-[#6F7E8F]'
                      }`}
                    >
                      {summary.bankLoanTaken > 0 ? '+' : ''}
                      {formatCurrencyI18n(summary.bankLoanTaken, lang)}
                    </span>
                  </div>

                  {summary.crisisRescueRefund > 0 && (
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[#F3F6FA]">
                          {m.rescueRefundLabel}
                        </div>
                      </div>
                      <span className="font-mono font-semibold tabular-nums shrink-0 text-[#44B872]">
                        +{formatCurrencyI18n(summary.crisisRescueRefund, lang)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="space-y-0.5">
                      <div className="font-medium text-[#CBD5E1]">
                        {m.kpiExtractedSold}
                      </div>
                    </div>
                    <span className="font-mono font-medium tabular-nums text-[#CBD5E1] shrink-0">
                      {formatBarrelsI18n(summary.barrelsExtracted, lang)} /{' '}
                      {formatBarrelsI18n(summary.barrelsSold, lang)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#2E9E5B]/30 bg-[#14201A] px-4 py-3 text-xs font-bold">
                  <span className="text-[#CBD5E1]">{m.totalInflowsLabel}</span>
                  <span className="font-mono tabular-nums text-[#44B872]">
                    +{formatCurrencyI18n(summary.totalInflows, lang)}
                  </span>
                </div>
              </div>

              {/* RIGHT COLUMN: OUTFLOWS */}
              <div className="flex flex-col border border-[#D94436]/40 bg-[#13181F]">
                <div className="flex items-center justify-between gap-2 border-b border-[#D94436]/30 bg-[#2D1819] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 text-[#E8665A]" />
                    <h3 className="text-xs sm:text-sm font-bold tracking-wide text-[#F4A59D]">
                      {m.outflowsTitle}
                    </h3>
                  </div>
                  <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-[#E8665A]">
                    -{formatCurrencyI18n(summary.totalOutflows, lang)}
                  </span>
                </div>

                <div className="flex-1 p-3 sm:p-4 space-y-3.5 text-xs">
                  <ClosingCostsBlock summary={summary} />

                  {/* Group 2: Mid-Turn Investments & Operations */}
                  <div className="border border-[#2D3846] bg-[#161C24]">
                    <div className="flex items-center justify-between gap-2 border-b border-[#2D3846] bg-[#1A212B] px-3 py-2">
                      <span className="text-[11px] font-bold tracking-wide text-[#9FB0C2]">
                        {m.midTurnItemsHeading}
                      </span>
                      <span className="font-mono text-xs font-bold tabular-nums text-[#E8665A]">
                        {summary.midTurnOutflowsTotal > 0 ? '-' : ''}
                        {formatCurrencyI18n(summary.midTurnOutflowsTotal, lang)}
                      </span>
                    </div>

                    <div className="divide-y divide-[#232B35] px-3 py-1">
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.concessionPurchasesLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.concessionPurchasesCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.concessionPurchasesCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(
                            summary.concessionPurchasesCost,
                            lang
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.tankBuildLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.tankBuildCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.tankBuildCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.tankBuildCost, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.drillingCostLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.drillingCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.drillingCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.drillingCost, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.analystFeesLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.analystFeesCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.analystFeesCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.analystFeesCost, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.sabotageCostLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.sabotageCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.sabotageCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.sabotageCost, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.sabotageFineLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.sabotageFineCost > 0
                              ? 'text-[#E8665A] font-semibold'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.sabotageFineCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.sabotageFineCost, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.coreSampleLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            (summary.coreSampleCost ?? 0) > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {(summary.coreSampleCost ?? 0) > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.coreSampleCost ?? 0, lang)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.crisisRescueLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            (summary.crisisRescueCost ?? 0) > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {(summary.crisisRescueCost ?? 0) > 0 ? '-' : ''}
                          {formatCurrencyI18n(
                            summary.crisisRescueCost ?? 0,
                            lang
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[#9FB0C2]">
                          {m.loanRepaymentLabel}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            summary.loanRepaymentCost > 0
                              ? 'text-[#E8665A]'
                              : 'text-[#6F7E8F]'
                          }`}
                        >
                          {summary.loanRepaymentCost > 0 ? '-' : ''}
                          {formatCurrencyI18n(summary.loanRepaymentCost, lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#D94436]/30 bg-[#231618] px-4 py-3 text-xs font-bold">
                  <span className="text-[#CBD5E1]">
                    {m.totalOutflowsLabel}
                  </span>
                  <span className="font-mono tabular-nums text-[#E8665A]">
                    -{formatCurrencyI18n(summary.totalOutflows, lang)}
                  </span>
                </div>
              </div>
            </div>

            {/* Cash Reconciliation & Loan Interest Status Strip */}
            <div className="border border-[#2D3846] bg-[#13181F] p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono tabular-nums">
                <span className="text-[#8D9CAD]">
                  {m.reconcileStartCash}{' '}
                  <strong className="text-[#E6ECF2]">
                    {formatCurrencyI18n(summary.startingCash, lang)}
                  </strong>
                </span>
                <span className="text-[#6F7E8F]">→</span>
                <span className="text-[#8D9CAD]">
                  {m.kpiNetCashChange}:{' '}
                  <strong
                    className={
                      netCashPositive ? 'text-[#44B872]' : 'text-[#E8665A]'
                    }
                  >
                    {netCashPositive ? '+' : ''}
                    {formatCurrencyI18n(summary.netCashChange, lang)}
                  </strong>
                </span>
                <span className="text-[#6F7E8F]">→</span>
                <span className="text-[#8D9CAD]">
                  {m.reconcileEndingCash}{' '}
                  <strong className="text-[#E59A24]">
                    {formatCurrencyI18n(summary.endingCash, lang)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono tabular-nums text-[#9FB0C2]">
                <Landmark className="h-3.5 w-3.5 shrink-0 text-[#E59A24]" />
                <span>
                  {m.kpiDebtCredit}:{' '}
                  <strong
                    className={
                      summary.endingDebt > 0
                        ? 'text-[#E8665A]'
                        : 'text-[#44B872]'
                    }
                  >
                    {formatCurrencyI18n(summary.endingDebt, lang)}
                  </strong>{' '}
                  / {formatCurrencyI18n(availableCredit, lang)}
                </span>
              </div>
            </div>

            {/* Footer Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-[#8D9CAD]">
                {hasPendingAnnualReport ? m.annualPendingNotice : closedDate}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="retro-button bg-[#E59A24] px-5 py-2.5 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {continueLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
