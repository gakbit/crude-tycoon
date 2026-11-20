/**
 * End-of-game summary modal showing final corporate rankings, net worth,
 * and options to continue in endless mode or start a new game without page reload.
 */

import React from 'react';
import { Trophy, AlertOctagon, RotateCcw, FastForward } from 'lucide-react';
import { GameState } from '../engine/gameTypes';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  getLocalizedGameOverSummary,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface GameOverModalProps {
  state: GameState;
  onContinueEndless: () => void;
  onRestartNewGame: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  state,
  onContinueEndless,
  onRestartNewGame,
}) => {
  const { lang, dict } = useI18n();
  const summary = state.gameOverSummary;
  if (!summary) return null;

  const localizedSummary = getLocalizedGameOverSummary(summary, state, lang);
  const isBankruptcy = summary.reason === 'BANKRUPTCY';
  const isPlayerWinner = summary.winnerCompanyId === state.playerCompanyId;
  const ranked = [...state.companies].sort((a, b) => b.netWorth - a.netWorth);
  const g = dict.gameOver;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-4"
    >
      <div className="retro-panel w-full max-w-[680px] overflow-hidden">
        <div className="border-b border-[#354150] bg-[#161C24] px-6 py-5 flex items-center gap-3">
          {isBankruptcy ? (
            <AlertOctagon className="h-7 w-7 text-[#E8665A] shrink-0" />
          ) : (
            <Trophy
              className={`h-7 w-7 shrink-0 ${
                isPlayerWinner ? 'text-[#E59A24]' : 'text-[#8D9CAD]'
              }`}
            />
          )}
          <div>
            <h2
              id="gameover-title"
              className="font-display text-xl font-bold text-[#F8FAFC]"
            >
              {localizedSummary.headline}
            </h2>
            <p className="mt-0.5 text-sm text-[#B4C1CF]">
              {localizedSummary.detail}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-[#9FB0C2] mb-2">
              {g.standingsTitle} ({state.turn} {dict.units.monthsFull})
            </h3>
            <div className="overflow-x-auto border border-[#2D3846] bg-[#13181F]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#2D3846] bg-[#192029] text-[#9FB0C2]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">#</th>
                    <th className="px-4 py-2.5 font-semibold">
                      {dict.annualReport.colCompany}
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-right">
                      {g.closingCashLabel}
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-right">
                      {dict.companiesView.lifetimeExtracted}
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-right">
                      {g.finalNetWorthLabel}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232B35]">
                  {ranked.map((comp, idx) => (
                    <tr
                      key={comp.id}
                      className={comp.isPlayer ? 'bg-[#E59A24]/10' : ''}
                    >
                      <td className="px-4 py-2.5 font-mono tabular-nums text-[#8D9CAD]">
                        {idx + 1}.
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[#F3F6FA]">
                        <span
                          aria-hidden="true"
                          className="mr-2 inline-block h-2.5 w-2.5 align-middle"
                          style={{ backgroundColor: comp.colorHex }}
                        />
                        {comp.name}
                        {comp.isPlayer ? ` (${dict.annualReport.youBadge})` : ''}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                        {formatCurrencyI18n(comp.cash, lang)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#CBD5E1]">
                        {formatBarrelsI18n(comp.totalBarrelsSold, lang)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right font-bold text-[#E59A24]">
                        {formatCurrencyI18n(comp.netWorth, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#2D3846]">
            {!isBankruptcy && (
              <button
                type="button"
                onClick={onContinueEndless}
                className="retro-button flex items-center gap-2 bg-[#25303C] px-4 py-2.5 text-sm font-semibold text-[#E6ECF2] hover:bg-[#314050] whitespace-nowrap cursor-pointer"
              >
                <FastForward className="h-4 w-4 text-[#E59A24]" />
                <span>{g.continueEndlessButton}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRestartNewGame}
              className="retro-button flex items-center gap-2 bg-[#E59A24] px-5 py-2.5 text-sm font-bold text-[#12161B] hover:bg-[#F0A938] whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{g.newGameButton}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
