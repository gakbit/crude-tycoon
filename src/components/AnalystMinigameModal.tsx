/**
 * Document-matching memory minigame modal for internal market analyst auditing.
 * Players pair accounting slips, tank ledgers, and shipping manifests within the mistake budget
 * to unlock a difficulty-scaled 6/5/4-month live intelligence window.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  Landmark,
  Layers,
  Pickaxe,
  Receipt,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AnalystDocIconType,
  AnalystMinigameSession,
} from '../engine/gameTypes';
import {
  formatCurrencyI18n,
  getLocalizedAnalystCard,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface AnalystMinigameModalProps {
  session: AnalystMinigameSession;
  onFinishMinigame: (success: boolean, mistakesCount: number) => void;
}

function renderDocIcon(
  iconType: AnalystDocIconType,
  accentHex: string
): React.ReactNode {
  const props = { className: 'h-5 w-5 sm:h-6 sm:w-6 shrink-0', style: { color: accentHex } };
  switch (iconType) {
    case 'TANK':
      return <Database {...props} />;
    case 'INVOICE':
      return <Receipt {...props} />;
    case 'DRILL':
      return <Pickaxe {...props} />;
    case 'BANK':
      return <Landmark {...props} />;
    case 'SHIP':
      return <Anchor {...props} />;
    case 'STOCK':
      return <TrendingUp {...props} />;
    case 'GEOLOGY':
      return <Layers {...props} />;
    case 'TAX':
      return <FileCheck2 {...props} />;
  }
}

export const AnalystMinigameModal: React.FC<AnalystMinigameModalProps> = ({
  session,
  onFinishMinigame,
}) => {
  const { lang, dict } = useI18n();
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairKeys, setMatchedPairKeys] = useState<string[]>([]);
  const [mismatchIndices, setMismatchIndices] = useState<number[]>([]);
  const [mistakesCount, setMistakesCount] = useState<number>(0);
  const [attemptsCount, setAttemptsCount] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<'PLAYING' | 'SUCCESS' | 'FAILED'>(
    'PLAYING'
  );

  const mismatchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (mismatchTimerRef.current !== null) {
        window.clearTimeout(mismatchTimerRef.current);
      }
    };
  }, []);

  const handleCardClick = (index: number) => {
    if (outcome !== 'PLAYING' || isLocked) return;
    const card = session.cards[index];
    if (!card) return;
    if (matchedPairKeys.includes(card.pairKey)) return;
    if (flippedIndices.includes(index)) return;

    soundFx.click();

    if (flippedIndices.length === 0) {
      setFlippedIndices([index]);
      return;
    }

    const firstIdx = flippedIndices[0];
    const firstCard = session.cards[firstIdx];
    const nextFlipped = [firstIdx, index];
    setFlippedIndices(nextFlipped);
    setAttemptsCount((c) => c + 1);

    if (firstCard.pairKey === card.pairKey) {
      const nextMatched = [...matchedPairKeys, card.pairKey];
      setMatchedPairKeys(nextMatched);
      setFlippedIndices([]);

      if (nextMatched.length >= session.pairsCount) {
        soundFx.layerBreakthrough();
        setOutcome('SUCCESS');
      } else {
        soundFx.barLock(95);
      }
      return;
    }

    // Mismatch
    soundFx.drillFailure();
    const nextMistakes = mistakesCount + 1;
    setMistakesCount(nextMistakes);
    setMismatchIndices(nextFlipped);
    setIsLocked(true);

    mismatchTimerRef.current = window.setTimeout(() => {
      setFlippedIndices([]);
      setMismatchIndices([]);
      setIsLocked(false);
      if (nextMistakes > session.maxMistakes) {
        setOutcome('FAILED');
      }
    }, 650);
  };

  const remainingMistakes = Math.max(0, session.maxMistakes - mistakesCount);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyst-minigame-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-3 sm:p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[780px] overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#354150] bg-[#161C24] px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-3.5 w-3.5 shrink-0"
                style={{ backgroundColor: session.targetCompanyColorHex }}
              />
              <h2
                id="analyst-minigame-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(dict.analystModal.title, {
                  name: session.targetCompanyName,
                })}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[#9FB0C2]">
              {interpolate(dict.analystModal.headerMeta, {
                difficulty: dict.difficulties[session.difficulty].label,
              })}
              <span className="font-mono tabular-nums text-[#E59A24]">
                {formatCurrencyI18n(session.cost, lang)}
              </span>
              {dict.analystModal.rewardAccessPrefix}
              <span className="font-mono font-semibold tabular-nums text-[#44B872]">
                {session.rewardMonths} {dict.units.monthsFull}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => onFinishMinigame(false, mistakesCount)}
            className="retro-button flex items-center gap-1.5 bg-[#2A1D20] px-3 py-1.5 text-xs font-semibold text-[#E8665A] hover:bg-[#3A2529] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>{dict.analystModal.abortButton}</span>
          </button>
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26303D] bg-[#12161B] px-4 sm:px-6 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>
              <span className="text-[#8D9CAD]">
                {dict.analystModal.pairsLabel}{' '}
              </span>
              <span className="font-mono font-bold tabular-nums text-[#44B872]">
                {matchedPairKeys.length} / {session.pairsCount}
              </span>
            </span>

            <span>
              <span className="text-[#8D9CAD]">
                {dict.analystModal.mistakesLeft}{' '}
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  remainingMistakes <= 2 ? 'text-[#E8665A]' : 'text-[#E59A24]'
                }`}
              >
                {remainingMistakes} / {session.maxMistakes}
              </span>
            </span>

            <span>
              <span className="text-[#8D9CAD]">
                {dict.analystModal.stepsLabel}{' '}
              </span>
              <span className="font-mono tabular-nums text-[#CBD5E1]">
                {attemptsCount}
              </span>
            </span>
          </div>

          <span className="text-[11px] text-[#8D9CAD]">
            {dict.analystModal.matchHint}
          </span>
        </div>

        {/* Memory Card Grid */}
        <div className="p-4 sm:p-6 space-y-5 bg-[#1B222B]">
          <div
            className={`grid gap-2 sm:gap-3 ${
              session.pairsCount === 6
                ? 'grid-cols-3 sm:grid-cols-4'
                : 'grid-cols-4'
            }`}
          >
            {session.cards.map((card, idx) => {
              const isMatched = matchedPairKeys.includes(card.pairKey);
              const isMismatched = mismatchIndices.includes(idx);
              const isFlipped = flippedIndices.includes(idx);
              const isFaceUp = isMatched || isFlipped || isMismatched;
              const locCard = getLocalizedAnalystCard(
                card.pairIndex,
                card.code,
                card.title,
                card.subtitle,
                lang
              );

              return (
                <button
                  key={card.cardId}
                  type="button"
                  disabled={outcome !== 'PLAYING' || isMatched || isLocked}
                  onClick={() => handleCardClick(idx)}
                  aria-label={
                    isFaceUp
                      ? `${locCard.title} (${locCard.docCode})`
                      : interpolate(dict.analystModal.sealedFileAria, {
                          index: idx + 1,
                        })
                  }
                  className={`min-h-[82px] sm:min-h-[104px] flex flex-col items-center justify-center p-2 text-center transition-colors select-none ${
                    isMatched
                      ? 'border-2 border-[#2E9E5B] bg-[#16291E] text-[#E6ECF2]'
                      : isMismatched
                        ? 'border-2 border-[#D94436] bg-[#2D1819] text-[#F4A59D]'
                        : isFlipped
                          ? 'border-2 border-[#E59A24] bg-[#242E3B] text-[#F8FAFC]'
                          : 'retro-button border border-[#344152] bg-[#141A22] text-[#8D9CAD] hover:bg-[#1D2632] hover:border-[#4B5D73] cursor-pointer'
                  }`}
                >
                  {isFaceUp ? (
                    <div className="flex flex-col items-center justify-center gap-1 min-w-0 w-full">
                      {renderDocIcon(card.iconType, card.accentHex)}
                      <span className="font-mono text-[10px] font-semibold tracking-wider text-[#9FB0C2]">
                        {locCard.docCode}
                      </span>
                      <span className="text-[11px] sm:text-xs font-bold leading-tight text-[#F8FAFC] line-clamp-2">
                        {locCard.title}
                      </span>
                      <span className="hidden sm:block text-[10px] text-[#8D9CAD] truncate max-w-full">
                        {locCard.subtitle}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <FileText className="h-5 w-5 text-[#5D6E82]" />
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-[#7C8EA3]">
                        {dict.analystModal.cardBackLabel}-
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Outcome / Action Footer */}
          {outcome === 'SUCCESS' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#2E9E5B] bg-[#16291E] p-4">
              <div className="flex items-start sm:items-center gap-2.5 text-[#A2E4BC]">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0 text-[#44B872]" />
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-sm text-[#F8FAFC]">
                    {dict.analystModal.successTitle}
                  </div>
                  <p>
                    {interpolate(dict.analystModal.successDesc, {
                      months: session.rewardMonths,
                    })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onFinishMinigame(true, mistakesCount)}
                className="retro-button min-h-[42px] bg-[#2E9E5B] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#36B56A] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.analystModal.activateAccessButton}
              </button>
            </div>
          )}

          {outcome === 'FAILED' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#D94436] bg-[#2D1819] p-4">
              <div className="flex items-start sm:items-center gap-2.5 text-[#F4A59D]">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0 text-[#E8665A]" />
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-sm text-[#F8FAFC]">
                    {dict.analystModal.failedTitle}
                  </div>
                  <p>{dict.analystModal.failedDesc}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onFinishMinigame(false, mistakesCount)}
                className="retro-button min-h-[42px] bg-[#D94436] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#E45749] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.analystModal.closeButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
