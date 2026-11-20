/**
 * Clean-room two-bar reaction drilling minigame modal.
 * Players conquer 4-6 geological strata by stopping two sequential oscillating bars
 * (1: Drill Head Position, 2: Layer-specific Drilling Speed) via mouse click or touch tap.
 * Failed breakthroughs can be retried up to 3 total mistakes for an extra drill-head fee.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Layers, RotateCcw, X } from 'lucide-react';
import { REGIONS_BY_ID } from '../data/regionsData';
import { calculateDrillingSuccessChance } from '../engine/economyEngine';
import { DrillingSession } from '../engine/gameTypes';
import {
  formatCurrencyI18n,
  getLocalizedDrillingHardness,
  getLocalizedDrillingStratum,
  getLocalizedRegion,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface DrillingMinigameModalProps {
  session: DrillingSession;
  playerCash: number;
  onChargeRetry: (cost: number) => boolean;
  onFinishMinigame: (
    success: boolean,
    averageAccuracyPct: number,
    mistakesCount: number
  ) => void;
}

export const DrillingMinigameModal: React.FC<DrillingMinigameModalProps> = ({
  session: initialSession,
  playerCash,
  onChargeRetry,
  onFinishMinigame,
}) => {
  const { lang, dict } = useI18n();
  const [session, setSession] = useState<DrillingSession>(initialSession);
  const [cursorValue, setCursorValue] = useState<number>(50);
  const [rigImgFailed, setRigImgFailed] = useState(false);

  const cursorRef = useRef<number>(50);
  const directionRef = useRef<1 | -1>(1);
  const lastFrameTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const regionStatic = REGIONS_BY_ID[session.regionId];
  const locRegionName = getLocalizedRegion(session.regionId, lang).name;
  const currentLayer = session.layers[session.currentLayerIndex];
  const currentLocLayerName = getLocalizedDrillingStratum(
    currentLayer.poolIndex,
    currentLayer.layerName,
    lang
  );
  const currentLocHardness = getLocalizedDrillingHardness(
    currentLayer.poolIndex,
    currentLayer.hardnessLabel,
    lang
  );
  const currentSpeedTag =
    currentLocHardness.split('·')[1]?.trim() ?? currentLocHardness;

  // Animate active progress bar cursor at 60 FPS
  useEffect(() => {
    const isAnimating =
      session.step === 'POSITION_BAR' || session.step === 'SPEED_BAR';
    if (!isAnimating) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTimeRef.current = null;
      return;
    }

    // Start near a random edge for fair reaction timing
    cursorRef.current = Math.random() < 0.5 ? 12 : 88;
    directionRef.current = cursorRef.current < 50 ? 1 : -1;
    setCursorValue(cursorRef.current);

    const speedPerSec = currentLayer.barOscillationSpeed;

    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const dt = Math.min(0.05, (timestamp - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timestamp;

      let nextVal = cursorRef.current + directionRef.current * speedPerSec * dt;
      if (nextVal >= 100) {
        nextVal = 100 - (nextVal - 100);
        directionRef.current = -1;
      } else if (nextVal <= 0) {
        nextVal = -nextVal;
        directionRef.current = 1;
      }

      cursorRef.current = nextVal;
      setCursorValue(nextVal);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };
  }, [session.step, session.currentLayerIndex, currentLayer.barOscillationSpeed]);

  const handleAdvanceStep = useCallback(() => {
    if (session.step === 'POSITION_BAR') {
      const lockedPos = Number(cursorRef.current.toFixed(1));
      const posCheck = calculateDrillingSuccessChance(
        lockedPos,
        currentLayer.optimalSpeedCenter,
        currentLayer
      );
      soundFx.barLock(posCheck.positionAccuracyPct);
      setSession((prev) => ({
        ...prev,
        lockedPosition: lockedPos,
        step: 'SPEED_BAR',
      }));
      return;
    }

    if (session.step === 'SPEED_BAR') {
      const lockedSpd = Number(cursorRef.current.toFixed(1));
      const lockedPos = session.lockedPosition ?? 50;
      const evaluation = calculateDrillingSuccessChance(
        lockedPos,
        lockedSpd,
        currentLayer
      );
      soundFx.barLock(evaluation.speedAccuracyPct);

      const roll = Math.random() * 100;
      const isBreakthrough = roll <= evaluation.chancePct;

      if (isBreakthrough) {
        soundFx.layerBreakthrough();
        const isFinalLayer =
          session.currentLayerIndex + 1 >= session.layers.length;
        setSession((prev) => ({
          ...prev,
          lockedSpeed: lockedSpd,
          lastCalculatedChance: evaluation.chancePct,
          lastRollSuccess: true,
          accuracySamples: [...prev.accuracySamples, evaluation.chancePct],
          step: isFinalLayer ? 'COMPLETE_SUCCESS' : 'ROLL_RESULT',
        }));
      } else {
        soundFx.drillFailure();
        const nextMistakes = session.mistakesCount + 1;
        const outOfLives = nextMistakes > session.maxMistakes;
        setSession((prev) => ({
          ...prev,
          lockedSpeed: lockedSpd,
          lastCalculatedChance: evaluation.chancePct,
          lastRollSuccess: false,
          mistakesCount: nextMistakes,
          step: outOfLives ? 'COMPLETE_FAILED' : 'FAILED_RETRY_PROMPT',
        }));
      }
      return;
    }

    if (session.step === 'ROLL_RESULT' && session.lastRollSuccess) {
      setSession((prev) => ({
        ...prev,
        currentLayerIndex: prev.currentLayerIndex + 1,
        step: 'POSITION_BAR',
        lockedPosition: null,
        lockedSpeed: null,
        lastCalculatedChance: null,
        lastRollSuccess: null,
      }));
      return;
    }

    if (session.step === 'COMPLETE_SUCCESS') {
      const avg =
        session.accuracySamples.length > 0
          ? session.accuracySamples.reduce((a, b) => a + b, 0) /
            session.accuracySamples.length
          : 75;
      onFinishMinigame(true, avg, session.mistakesCount);
      return;
    }

    if (session.step === 'COMPLETE_FAILED') {
      onFinishMinigame(false, 0, session.mistakesCount);
    }
  }, [session, currentLayer, onFinishMinigame]);

  const handleRetryLayer = useCallback(() => {
    const paid = onChargeRetry(session.retryCostPerMistake);
    if (!paid) return;
    soundFx.click();
    setSession((prev) => ({
      ...prev,
      totalSpent: prev.totalSpent + prev.retryCostPerMistake,
      step: 'POSITION_BAR',
      lockedPosition: null,
      lockedSpeed: null,
      lastCalculatedChance: null,
      lastRollSuccess: null,
    }));
  }, [onChargeRetry, session.retryCostPerMistake]);

  // Build CSS linear-gradient string centered on target green sweet spot
  const buildTargetGradient = (
    centerPct: number,
    greenHalfWidth: number
  ): string => {
    const gStart = Math.max(0, centerPct - greenHalfWidth);
    const gEnd = Math.min(100, centerPct + greenHalfWidth);
    const aStart = Math.max(0, gStart - greenHalfWidth * 1.4);
    const aEnd = Math.min(100, gEnd + greenHalfWidth * 1.4);

    return `linear-gradient(90deg, #B9352B 0%, #D96B27 ${aStart}%, #2E9E5B ${gStart}%, #38B86A ${centerPct}%, #2E9E5B ${gEnd}%, #D96B27 ${aEnd}%, #B9352B 100%)`;
  };

  const canAffordRetry = playerCash >= session.retryCostPerMistake;
  const averageAcc =
    session.accuracySamples.length > 0
      ? Math.round(
          session.accuracySamples.reduce((a, b) => a + b, 0) /
            session.accuracySamples.length
        )
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drilling-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[980px] overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#354150] bg-[#161C24] px-6 py-4">
          <div>
              <h2
              id="drilling-modal-title"
              className="font-display text-lg font-bold text-[#F3F6FA]"
            >
              {interpolate(dict.drillingModal.title, {
                name: locRegionName,
                code: regionStatic.shortCode,
              })}
            </h2>
            <p className="mt-0.5 text-xs text-[#9FB0C2]">
              {dict.drillingModal.layersLabel} {session.currentLayerIndex + 1} /{' '}
              {session.layers.length} · {dict.drillingModal.mistakesLabel}{' '}
              {session.mistakesCount} / {session.maxMistakes} ·{' '}
              {dict.drillingModal.totalSpentLabel}{' '}
              <span className="font-mono tabular-nums text-[#E59A24]">
                {formatCurrencyI18n(session.totalSpent, lang)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => onFinishMinigame(false, 0, session.mistakesCount)}
            className="retro-button flex items-center gap-1.5 bg-[#2A1D20] px-3 py-1.5 text-xs font-semibold text-[#E8665A] hover:bg-[#3A2529] whitespace-nowrap cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>{dict.drillingModal.abortButton}</span>
          </button>
        </div>

        {/* Main 2-column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Geological Strata Stack & Illustration */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-[#354150] bg-[#141920] p-5 space-y-4">
            <div className="h-36 w-full overflow-hidden border border-[#2D3846] bg-[#11151B]">
              {!rigImgFailed ? (
                <img
                  src="/src/assets/images/drilling_rig_strata_1794943627705.jpg"
                  alt={dict.drillingModal.imgAlt}
                  referrerPolicy="no-referrer"
                  onError={() => setRigImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[#8D9CAD]">
                  {dict.drillingModal.imgFallback}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-[#C3CFD9]">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#E59A24]" />
                <span>{dict.drillingModal.strataStackTitle}</span>
              </span>
              <span className="font-mono tabular-nums text-[#8D9CAD]">
                {interpolate(dict.drillingModal.difficultyLabel, {
                  diff: regionStatic.drillingDifficulty,
                })}
              </span>
            </div>

            <div className="space-y-1.5">
              {session.layers.map((layer) => {
                const isDone =
                  layer.index < session.currentLayerIndex ||
                  session.step === 'COMPLETE_SUCCESS';
                const isActive =
                  layer.index === session.currentLayerIndex &&
                  session.step !== 'COMPLETE_SUCCESS';
                const locName = getLocalizedDrillingStratum(
                  layer.poolIndex,
                  layer.layerName,
                  lang
                );
                const locHardness = getLocalizedDrillingHardness(
                  layer.poolIndex,
                  layer.hardnessLabel,
                  lang
                );

                return (
                  <div
                    key={layer.index}
                    className={`flex items-center justify-between gap-3 border px-3 py-2 text-xs transition-colors ${
                      isActive
                        ? 'border-[#E59A24] bg-[#232B35] text-[#F3F6FA]'
                        : isDone
                          ? 'border-[#2E9E5B]/50 bg-[#18261E] text-[#9ED9B4]'
                          : 'border-[#28323F] bg-[#171D25] text-[#8D9CAD]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 border border-black/40"
                        style={{ backgroundColor: layer.rockColor }}
                      />
                      <div className="truncate">
                        <div className="font-semibold truncate">
                          {layer.index + 1}. {locName}
                        </div>
                        <div className="text-[11px] opacity-80 truncate">
                          {locHardness}
                        </div>
                      </div>
                    </div>

                    <span className="font-mono text-[11px] font-semibold shrink-0">
                      {isDone
                        ? dict.drillingModal.statusDone
                        : isActive
                          ? dict.drillingModal.statusActive
                          : dict.drillingModal.statusPending}
                    </span>
                  </div>
                );
              })}

              {/* Oil Reservoir Bottom Target */}
              <div
                className={`flex items-center justify-between border px-3 py-2 text-xs font-semibold ${
                  session.step === 'COMPLETE_SUCCESS'
                    ? 'border-[#2E9E5B] bg-[#1E3B2A] text-[#A9F0C3]'
                    : 'border-[#354150] bg-[#11151B] text-[#E59A24]'
                }`}
              >
                <span>{dict.drillingModal.targetReservoirLabel}</span>
                <span className="font-mono tabular-nums">
                  {session.step === 'COMPLETE_SUCCESS'
                    ? dict.drillingModal.targetReached
                    : dict.drillingModal.targetDeep}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Two-Bar Reaction Controls */}
          <div className="lg:col-span-7 flex flex-col justify-between p-6 space-y-6 bg-[#1B222B]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2D3846] pb-3">
                <div>
                  <div className="text-xs font-medium text-[#9FB0C2]">
                    {interpolate(dict.drillingModal.currentLayerHeader, {
                      current: currentLayer.index + 1,
                      total: session.layers.length,
                    })}
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#F8FAFC]">
                    {currentLocLayerName}
                  </h3>
                </div>
                <div className="text-right text-xs">
                  <div className="text-[#9FB0C2]">
                    {dict.drillingModal.recommendedSpeedLabel}
                  </div>
                  <div className="font-mono font-semibold tabular-nums text-[#44B872]">
                    {Math.round(
                      currentLayer.optimalSpeedCenter -
                        currentLayer.speedGreenHalfWidth
                    )}
                    % –{' '}
                    {Math.round(
                      currentLayer.optimalSpeedCenter +
                        currentLayer.speedGreenHalfWidth
                    )}
                    % ({currentSpeedTag})
                  </div>
                </div>
              </div>

              {/* BAR 1: Drill Head Position */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold ${
                      session.step === 'POSITION_BAR'
                        ? 'text-[#E59A24]'
                        : 'text-[#CBD5E1]'
                    }`}
                  >
                    {dict.drillingModal.bar1Label}
                  </span>
                  <span className="font-mono tabular-nums text-[#B4C1CF]">
                    {session.lockedPosition !== null
                      ? interpolate(dict.drillingModal.lockedPrefix, {
                          pct: session.lockedPosition.toFixed(1),
                        })
                      : session.step === 'POSITION_BAR'
                        ? interpolate(dict.drillingModal.activePrefix, {
                            pct: cursorValue.toFixed(0),
                          })
                        : dict.drillingModal.statusPending}
                  </span>
                </div>

                <div
                  onClick={() => {
                    if (session.step === 'POSITION_BAR') handleAdvanceStep();
                  }}
                  className={`relative h-11 w-full border ${
                    session.step === 'POSITION_BAR'
                      ? 'border-[#E59A24] cursor-pointer'
                      : 'border-[#354150]'
                  }`}
                  style={{
                    background: buildTargetGradient(
                      currentLayer.optimalPositionCenter,
                      currentLayer.positionGreenHalfWidth
                    ),
                  }}
                >
                  {/* Optimal Center Guideline */}
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-0.5 bg-white/40"
                    style={{ left: `${currentLayer.optimalPositionCenter}%` }}
                  />

                  {/* Moving or Locked Indicator Needle */}
                  {(session.step === 'POSITION_BAR' ||
                    session.lockedPosition !== null) && (
                    <div
                      className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-[#F8FAFC] border border-[#12161B] shadow-[0_0_8px_rgba(255,255,255,0.85)]"
                      style={{
                        left: `${
                          session.lockedPosition !== null
                            ? session.lockedPosition
                            : cursorValue
                        }%`,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* BAR 2: Layer-Specific Drilling Speed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold ${
                      session.step === 'SPEED_BAR'
                        ? 'text-[#E59A24]'
                        : 'text-[#CBD5E1]'
                    }`}
                  >
                    {dict.drillingModal.bar2Label}
                  </span>
                  <span className="font-mono tabular-nums text-[#B4C1CF]">
                    {session.lockedSpeed !== null
                      ? interpolate(dict.drillingModal.lockedPrefix, {
                          pct: session.lockedSpeed.toFixed(1),
                        })
                      : session.step === 'SPEED_BAR'
                        ? interpolate(dict.drillingModal.activePrefix, {
                            pct: cursorValue.toFixed(0),
                          })
                        : dict.drillingModal.waitingAfterStep1}
                  </span>
                </div>

                <div
                  onClick={() => {
                    if (session.step === 'SPEED_BAR') handleAdvanceStep();
                  }}
                  className={`relative h-11 w-full border ${
                    session.step === 'SPEED_BAR'
                      ? 'border-[#E59A24] cursor-pointer'
                      : 'border-[#354150] opacity-80'
                  }`}
                  style={{
                    background: buildTargetGradient(
                      currentLayer.optimalSpeedCenter,
                      currentLayer.speedGreenHalfWidth
                    ),
                  }}
                >
                  {/* Optimal Center Guideline */}
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-0.5 bg-white/45"
                    style={{ left: `${currentLayer.optimalSpeedCenter}%` }}
                  />

                  {/* Moving or Locked Indicator Needle */}
                  {(session.step === 'SPEED_BAR' ||
                    session.lockedSpeed !== null) && (
                    <div
                      className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-[#F8FAFC] border border-[#12161B] shadow-[0_0_8px_rgba(255,255,255,0.85)]"
                      style={{
                        left: `${
                          session.lockedSpeed !== null
                            ? session.lockedSpeed
                            : cursorValue
                        }%`,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Result / Feedback Box */}
              <div className="retro-inset p-4 text-sm">
                {session.step === 'POSITION_BAR' && (
                  <p className="text-[#CBD5E1]">
                    {dict.drillingModal.step1Prompt}
                  </p>
                )}

                {session.step === 'SPEED_BAR' && (
                  <p className="text-[#CBD5E1]">
                    {dict.drillingModal.step2Prompt}
                  </p>
                )}

                {session.step === 'ROLL_RESULT' && (
                  <div className="flex items-center justify-between gap-4 text-[#44B872]">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      <div>
                        <div className="font-bold">
                          {interpolate(dict.drillingModal.rollSuccessTitle, {
                            chance: session.lastCalculatedChance ?? 0,
                          })}
                        </div>
                        <div className="text-xs text-[#9ED9B4]">
                          {dict.drillingModal.rollSuccessDesc}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {session.step === 'FAILED_RETRY_PROMPT' && (
                  <div className="space-y-2 text-[#E8665A]">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      <span>
                        {interpolate(dict.drillingModal.rollFailedTitle, {
                          chance: session.lastCalculatedChance ?? 0,
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">
                      {interpolate(dict.drillingModal.rollFailedDesc, {
                        mistakes: session.mistakesCount,
                        max: session.maxMistakes,
                        cost: formatCurrencyI18n(
                          session.retryCostPerMistake,
                          lang
                        ),
                      })}
                    </p>
                  </div>
                )}

                {session.step === 'COMPLETE_SUCCESS' && (
                  <div className="space-y-1 text-[#44B872]">
                    <div className="flex items-center gap-2 font-bold text-base">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      <span>
                        {interpolate(dict.drillingModal.successTitle, {
                          code: regionStatic.shortCode,
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">
                      {interpolate(dict.drillingModal.completeSuccessSummary, {
                        acc: averageAcc,
                        mistakes: session.mistakesCount,
                        cost: formatCurrencyI18n(session.totalSpent, lang),
                      })}
                    </p>
                  </div>
                )}

                {session.step === 'COMPLETE_FAILED' && (
                  <div className="space-y-1 text-[#E8665A]">
                    <div className="flex items-center gap-2 font-bold text-base">
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      <span>{dict.drillingModal.maxMistakesTitle}</span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">
                      {dict.drillingModal.maxMistakesDesc}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action Footer */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#2D3846]">
              {session.step === 'FAILED_RETRY_PROMPT' ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onFinishMinigame(false, 0, session.mistakesCount)}
                    className="retro-button bg-[#2A1D20] px-4 py-2.5 text-xs font-semibold text-[#E8665A] hover:bg-[#3A2529] whitespace-nowrap cursor-pointer"
                  >
                    {dict.drillingModal.giveUpButton}
                  </button>
                  <button
                    type="button"
                    disabled={!canAffordRetry}
                    onClick={handleRetryLayer}
                    className="retro-button flex items-center gap-2 bg-[#E59A24] px-5 py-2.5 text-sm font-bold text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>
                      {canAffordRetry
                        ? interpolate(dict.drillingModal.buyNewBitButton, {
                            cost: formatCurrencyI18n(
                              session.retryCostPerMistake,
                              lang
                            ),
                          })
                        : dict.drillingModal.noRetryCash}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAdvanceStep}
                  className={`retro-button px-6 py-3 text-sm font-bold whitespace-nowrap cursor-pointer ${
                    session.step === 'COMPLETE_FAILED'
                      ? 'bg-[#D94436] text-white hover:bg-[#E45749]'
                      : session.step === 'COMPLETE_SUCCESS'
                        ? 'bg-[#2E9E5B] text-white hover:bg-[#36B56A]'
                        : 'bg-[#E59A24] text-[#12161B] hover:bg-[#F0A938]'
                  }`}
                >
                  {session.step === 'POSITION_BAR' &&
                    dict.drillingModal.positionStopButton}
                  {session.step === 'SPEED_BAR' &&
                    dict.drillingModal.speedLockButton}
                  {session.step === 'ROLL_RESULT' &&
                    dict.drillingModal.nextButton}
                  {session.step === 'COMPLETE_SUCCESS' &&
                    dict.drillingModal.activateWellButton}
                  {session.step === 'COMPLETE_FAILED' &&
                    dict.drillingModal.closeButton}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
