/**
 * One-handed Seismic Strata Scanner modal for onshore geological core analysis.
 * Players hold a single sonar button (touch, mouse, or Spacebar) to sweep a seismic
 * pulse downward across each borehole layer and release inside the narrowing green
 * resonance window from shallow surface down to the deep hydrocarbon reservoir.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Layers,
  Radio,
  ShieldAlert,
} from 'lucide-react';
import { REGIONS_BY_ID } from '../data/regionsData';
import { CoreSampleMinigameSession } from '../engine/gameTypes';
import {
  evaluateSeismicPulse,
  rollNextResonanceCenter,
} from '../engine/operationsEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  getLocalizedChemicalStratum,
  getLocalizedCoreProfile,
  getLocalizedRegion,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface CoreSampleMinigameModalProps {
  session: CoreSampleMinigameSession;
  onFinishOperation: (outcome: 'SUCCESS' | 'FAILED' | 'ABORTED') => void;
}

type ScanFeedback =
  | { kind: 'READY' }
  | {
      kind: 'HIT';
      isDone: boolean;
      layerNum: number;
      seqIdx?: number;
      rockName: string;
      pressureBar: number;
      nextNum?: number;
    }
  | {
      kind: 'TOO_EARLY' | 'OVERFLOW';
      pct: number;
      attemptsRemaining: number;
      showRecalibrated: boolean;
    };

export const CoreSampleMinigameModal: React.FC<
  CoreSampleMinigameModalProps
> = ({ session, onFinishOperation }) => {
  const { lang, dict } = useI18n();
  const locRegionName = getLocalizedRegion(session.regionId, lang).name;
  const layers = session.orderedTargetLayers;

  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [phase, setPhase] = useState<'SCANNING' | 'SUCCESS' | 'FAILED'>(
    'SCANNING'
  );
  const [isHolding, setIsHolding] = useState(false);
  const [cursorPct, setCursorPct] = useState(0);
  const [layerCenters, setLayerCenters] = useState<number[]>(() =>
    layers.map((l) => l.targetCenterPct)
  );
  const [feedback, setFeedback] = useState<ScanFeedback>({ kind: 'READY' });

  // Authoritative refs for 60 FPS animation loop & global pointer/keyboard release
  const phaseRef = useRef(phase);
  const activeIndexRef = useRef(activeLayerIndex);
  const attemptsUsedRef = useRef(attemptsUsed);
  const layerCentersRef = useRef(layerCenters);
  const isHoldingRef = useRef(false);
  const cursorRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  phaseRef.current = phase;
  activeIndexRef.current = activeLayerIndex;
  attemptsUsedRef.current = attemptsUsed;
  layerCentersRef.current = layerCenters;

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }, []);

  const evaluatePulseAt = useCallback(
    (releasedPct: number) => {
      if (phaseRef.current !== 'SCANNING') return;
      const idx = activeIndexRef.current;
      const layer = layers[idx];
      if (!layer) return;

      const targetCenter = layerCentersRef.current[idx] ?? layer.targetCenterPct;
      const res = evaluateSeismicPulse(
        targetCenter,
        layer.targetHalfWidthPct,
        releasedPct
      );

      if (res.hit) {
        const isLastLayer = idx + 1 >= layers.length;
        if (isLastLayer) {
          soundFx.labVerifySuccess();
          setPhase('SUCCESS');
          phaseRef.current = 'SUCCESS';
          setActiveLayerIndex(layers.length);
          activeIndexRef.current = layers.length;
          setFeedback({
            kind: 'HIT',
            isDone: true,
            layerNum: idx + 1,
            seqIdx: layer.seqIdx,
            rockName: layer.rockName,
            pressureBar: layer.pressureBar,
          });
        } else {
          soundFx.layerBreakthrough();
          const nextIdx = idx + 1;
          setActiveLayerIndex(nextIdx);
          activeIndexRef.current = nextIdx;
          cursorRef.current = 0;
          setCursorPct(0);
          setFeedback({
            kind: 'HIT',
            isDone: false,
            layerNum: idx + 1,
            seqIdx: layer.seqIdx,
            rockName: layer.rockName,
            pressureBar: layer.pressureBar,
            nextNum: nextIdx + 1,
          });
        }
        return;
      }

      const nextAttempts = attemptsUsedRef.current + 1;
      setAttemptsUsed(nextAttempts);
      attemptsUsedRef.current = nextAttempts;

      const pctRounded = Math.round(releasedPct);
      const rem = Math.max(0, session.maxAttempts - nextAttempts);

      const missKind: 'TOO_EARLY' | 'OVERFLOW' =
        res.reason === 'TOO_EARLY' ? 'TOO_EARLY' : 'OVERFLOW';

      if (nextAttempts >= session.maxAttempts) {
        soundFx.alarmTriggered();
        setPhase('FAILED');
        phaseRef.current = 'FAILED';
        setFeedback({
          kind: missKind,
          pct: pctRounded,
          attemptsRemaining: rem,
          showRecalibrated: false,
        });
      } else {
        soundFx.labVerifyError();
        const nextCenter = rollNextResonanceCenter(
          targetCenter,
          layer.targetHalfWidthPct
        );
        setLayerCenters((prev) => {
          const copy = [...prev];
          copy[idx] = nextCenter;
          layerCentersRef.current = copy;
          return copy;
        });
        cursorRef.current = 0;
        setCursorPct(0);
        setFeedback({
          kind: missKind,
          pct: pctRounded,
          attemptsRemaining: rem,
          showRecalibrated: true,
        });
      }
    },
    [layers, session.maxAttempts]
  );

  const startHoldScan = useCallback(() => {
    if (phaseRef.current !== 'SCANNING' || isHoldingRef.current) return;
    const idx = activeIndexRef.current;
    const layer = layers[idx];
    if (!layer) return;

    soundFx.click();
    stopAnimation();
    cursorRef.current = 0;
    setCursorPct(0);
    isHoldingRef.current = true;
    setIsHolding(true);

    const speed = layer.sweepSpeedPctPerSec;

    const tick = (timestamp: number) => {
      if (!isHoldingRef.current || phaseRef.current !== 'SCANNING') {
        stopAnimation();
        return;
      }
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const dt = Math.min(0.05, (timestamp - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timestamp;

      const nextPct = Math.min(100, cursorRef.current + speed * dt);
      cursorRef.current = nextPct;
      setCursorPct(nextPct);

      if (nextPct >= 100) {
        isHoldingRef.current = false;
        setIsHolding(false);
        stopAnimation();
        evaluatePulseAt(100);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [evaluatePulseAt, layers, stopAnimation]);

  const releaseHoldScan = useCallback(() => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    setIsHolding(false);
    stopAnimation();
    evaluatePulseAt(cursorRef.current);
  }, [evaluatePulseAt, stopAnimation]);

  // Global release listeners so dragging a thumb off the button never sticks
  useEffect(() => {
    const handlePointerEnd = () => {
      if (isHoldingRef.current) {
        releaseHoldScan();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && phaseRef.current === 'SCANNING') {
        e.preventDefault();
        startHoldScan();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isHoldingRef.current) {
        e.preventDefault();
        releaseHoldScan();
      }
    };

    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('blur', handlePointerEnd);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      stopAnimation();
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('blur', handlePointerEnd);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [releaseHoldScan, startHoldScan, stopAnimation]);

  const attemptsRemaining = Math.max(0, session.maxAttempts - attemptsUsed);
  const currentLayer =
    layers[Math.min(activeLayerIndex, layers.length - 1)] ?? layers[0];
  const currentCenter =
    layerCenters[Math.min(activeLayerIndex, layers.length - 1)] ??
    currentLayer.targetCenterPct;
  const windowStartPct = Math.max(
    0,
    currentCenter - currentLayer.targetHalfWidthPct
  );
  const windowEndPct = Math.min(
    100,
    currentCenter + currentLayer.targetHalfWidthPct
  );
  const windowWidthPct = Math.max(2, windowEndPct - windowStartPct);
  const inZoneNow =
    isHolding && cursorPct >= windowStartPct && cursorPct <= windowEndPct;

  const greenBonusPct = Math.round((session.greenZoneMultiplier - 1) * 100);
  const revealedCount = Math.min(activeLayerIndex, layers.length);
  const currentDepthMeters = Math.round(
    ((Math.min(activeLayerIndex, layers.length - 1) + 1) / layers.length) * 2950
  );

  const currentLocChem = getLocalizedChemicalStratum(
    currentLayer.seqIdx,
    currentLayer.rockName,
    currentLayer.chemicalClue,
    currentLayer.pHLabel,
    lang
  );

  const feedbackMessage = (() => {
    if (feedback.kind === 'READY') {
      return dict.coreSampleModal.feedbackReady;
    }
    if (feedback.kind === 'HIT') {
      const locRock = getLocalizedChemicalStratum(
        feedback.seqIdx,
        feedback.rockName,
        '',
        '',
        lang
      ).rockName;
      return feedback.isDone
        ? interpolate(dict.coreSampleModal.feedbackHitDone, {
            index: feedback.layerNum,
            name: locRock,
            pressure: feedback.pressureBar,
          })
        : interpolate(dict.coreSampleModal.feedbackHitNext, {
            index: feedback.layerNum,
            name: locRock,
            pressure: feedback.pressureBar,
            next: feedback.nextNum ?? feedback.layerNum + 1,
          });
    }
    const baseMsg = interpolate(
      feedback.kind === 'TOO_EARLY'
        ? dict.coreSampleModal.feedbackEarly
        : dict.coreSampleModal.feedbackOverrun,
      { pct: feedback.pct }
    );
    if (feedback.showRecalibrated) {
      return `${baseMsg} ${interpolate(dict.coreSampleModal.feedbackRecalibrated, { rem: feedback.attemptsRemaining })}`;
    }
    return baseMsg;
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="core-sample-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-3 sm:p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[920px] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#354150] bg-[#161C24] px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <FlaskConical className="h-5 w-5 shrink-0 text-[#E59A24]" />
            <div className="min-w-0">
              <h2
                id="core-sample-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(dict.coreSampleModal.headerTitle, {
                  name: locRegionName,
                })}
              </h2>
              <p className="text-xs text-[#9FB0C2]">
                {dict.coreSampleModal.headerSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={phase !== 'SCANNING'}
            onClick={() => onFinishOperation('ABORTED')}
            className="retro-button bg-[#232B35] px-3 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#2F3A48] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {dict.coreSampleModal.abortButton}
          </button>
        </div>

        {/* Lab Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[#2D3846] bg-[#13181F] px-4 sm:px-6 py-3 text-xs">
          <div>
            <div className="text-[#8D9CAD]">
              {dict.coreSampleModal.sensorAttemptsLabel}
            </div>
            <div
              className={`font-mono text-sm font-bold tabular-nums ${
                attemptsRemaining <= 1 ? 'text-[#E8665A]' : 'text-[#E59A24]'
              }`}
            >
              {interpolate(dict.coreSampleModal.sensorAttemptsVal, {
                rem: attemptsRemaining,
                max: session.maxAttempts,
              })}
            </div>
          </div>
          <div>
            <div className="text-[#8D9CAD]">
              {dict.coreSampleModal.scannedLayersLabel.replace(/:\s*$/, '')}
            </div>
            <div className="font-mono text-sm font-bold tabular-nums text-[#38BDF8]">
              {interpolate(dict.coreSampleModal.layersRevealedVal, {
                done: revealedCount,
                total: layers.length,
              })}
            </div>
          </div>
          <div>
            <div className="text-[#8D9CAD]">
              {dict.coreSampleModal.windowWidthLabel}
            </div>
            <div className="font-mono text-sm font-bold tabular-nums text-[#E6ECF2]">
              {interpolate(dict.coreSampleModal.windowWidthVal, {
                half: currentLayer.targetHalfWidthPct.toFixed(1),
                full: Math.round(currentLayer.targetHalfWidthPct * 2),
              })}
            </div>
          </div>
          <div>
            <div className="text-[#8D9CAD]">
              {dict.coreSampleModal.drillAdvantageHeader}
            </div>
            <div className="font-mono font-semibold tabular-nums text-[#44B872]">
              {interpolate(dict.coreSampleModal.drillAdvantageVal, {
                margin: greenBonusPct,
                bonus: session.efficiencyBonusPct,
              })}
              {session.failPenaltyCost > 0 && (
                <span className="block text-[11px] text-[#E8665A]">
                  {interpolate(dict.coreSampleModal.failSurchargeNote, {
                    cost: formatCurrencyI18n(session.failPenaltyCost, lang),
                  })}
                  {session.failGreenZoneMultiplier < 1
                    ? interpolate(dict.coreSampleModal.failZoneNote, {
                        malus: 5,
                      })
                    : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Workspace */}
        <div className="p-4 sm:p-6 max-h-[78vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left / Top: Borehole Depth Profile (reveals layer-by-layer) */}
            <div className="lg:col-span-5 border border-[#2D3846] bg-[#13181F] p-4 space-y-3 flex flex-col">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#E6ECF2]">
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#E59A24]" />
                  <span>{dict.coreSampleModal.boreholeProfileTitle}</span>
                </span>
                <span className="font-mono text-[11px] font-normal text-[#8D9CAD]">
                  {dict.coreSampleModal.surfaceToDepth}
                </span>
              </div>

              <div className="space-y-2 flex-1">
                {layers.map((layer, idx) => {
                  const isLocked = idx < activeLayerIndex;
                  const isActive =
                    phase === 'SCANNING' && idx === activeLayerIndex;
                  const depthMeters = Math.round(
                    ((idx + 1) / layers.length) * 2950
                  );
                  const locLayerChem = getLocalizedChemicalStratum(
                    layer.seqIdx,
                    layer.rockName,
                    layer.chemicalClue,
                    layer.pHLabel,
                    lang
                  );

                  return (
                    <div
                      key={layer.layerId}
                      className={`border px-3 py-2.5 text-xs flex items-center justify-between gap-2 ${
                        isLocked
                          ? 'border-[#2E9E5B]/70 bg-[#15281D]'
                          : isActive
                            ? 'border-[#E59A24] bg-[#241E14]'
                            : 'border-[#26303D] bg-[#161C24] opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-6 w-2.5 shrink-0 border border-black/40"
                          style={{
                            backgroundColor: isLocked
                              ? layer.rockColor
                              : isActive
                                ? '#E59A24'
                                : '#354150',
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold tabular-nums text-[#E6ECF2]">
                            <span>
                              {interpolate(
                                dict.coreSampleModal.layerDepthLabel,
                                { index: idx + 1, depth: depthMeters }
                              )}
                            </span>
                            {isLocked && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#44B872] shrink-0" />
                            )}
                          </div>
                          <div className="text-[11px] text-[#B4C1CF] truncate">
                            {isLocked
                              ? `${locLayerChem.rockName} (${layer.chemicalFormula})`
                              : isActive
                                ? dict.coreSampleModal.activeSonarStatus
                                : dict.coreSampleModal.deeperLockedStatus}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono text-[11px] tabular-nums shrink-0">
                        {isLocked ? (
                          <>
                            <div className="text-[#44B872] font-semibold">
                              {layer.pressureBar} bar
                            </div>
                            <div className="text-[#8D9CAD]">
                              {layer.densityGcm3.toFixed(2)} g/cm³
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              className={
                                isActive ? 'text-[#E59A24]' : 'text-[#6F7E8F]'
                              }
                            >
                              ? bar
                            </div>
                            <div className="text-[#6F7E8F]">
                              ±{layer.targetHalfWidthPct.toFixed(1)}%
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right / Bottom: One-Handed Seismic Resonance Scanner & Thumb Hold Pad */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-4 border border-[#2D3846] bg-[#13181F] p-4 sm:p-5">
              {phase === 'SCANNING' && (
                <>
                  {/* Active Stratum Target Header */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#E59A24]">
                        <Radio className="h-4 w-4 shrink-0" />
                        <span>
                          {interpolate(dict.coreSampleModal.scanningTitle, {
                            current: activeLayerIndex + 1,
                            total: layers.length,
                            depth: currentDepthMeters,
                          })}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-[#9FB0C2]">
                        {interpolate(dict.coreSampleModal.speedWindowMeta, {
                          speed: currentLayer.sweepSpeedPctPerSec,
                          min: Math.round(windowStartPct),
                          max: Math.round(windowEndPct),
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-[#B4C1CF] leading-relaxed">
                      {interpolate(dict.coreSampleModal.clueInstruction, {
                        clue: currentLocChem.chemicalClue,
                      })}
                    </p>
                  </div>

                  {/* 60 FPS Seismic Resonance Gauge */}
                  <div className="space-y-2.5 border border-[#2D3846] bg-[#0E1318] p-4">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[#8D9CAD]">
                        {dict.coreSampleModal.surfaceZero}
                      </span>
                      <span
                        className={`font-bold ${
                          inZoneNow
                            ? 'text-[#44B872]'
                            : isHolding
                              ? 'text-[#38BDF8]'
                              : 'text-[#9FB0C2]'
                        }`}
                      >
                        {isHolding
                          ? inZoneNow
                            ? interpolate(dict.coreSampleModal.inZoneNow, {
                                pct: Math.round(cursorPct),
                              })
                            : interpolate(dict.coreSampleModal.scanningPulse, {
                                pct: Math.round(cursorPct),
                              })
                          : dict.coreSampleModal.standbyPrompt}
                      </span>
                      <span className="text-[#8D9CAD]">
                        {dict.coreSampleModal.overflowHundred}
                      </span>
                    </div>

                    {/* Visual Resonance Rail */}
                    <div className="relative h-14 w-full border border-[#354150] bg-[#151C24] overflow-hidden select-none">
                      {/* Early & Late Danger Backdrop Tint */}
                      <div
                        className="absolute inset-y-0 left-0 bg-[#1B222C]"
                        style={{ width: `${windowStartPct}%` }}
                      />
                      <div
                        className="absolute inset-y-0 right-0 bg-[#2A1618]"
                        style={{ width: `${Math.max(0, 100 - windowEndPct)}%` }}
                      />

                      {/* Narrowing Emerald Target Resonance Window */}
                      <div
                        className={`absolute inset-y-0 border-x-2 transition-colors ${
                          inZoneNow
                            ? 'border-[#6EE7B7] bg-[#2E9E5B]/55'
                            : 'border-[#44B872] bg-[#2E9E5B]/30'
                        }`}
                        style={{
                          left: `${windowStartPct}%`,
                          width: `${windowWidthPct}%`,
                        }}
                      >
                        <div className="h-full w-full flex items-center justify-center">
                          <div className="h-full w-px bg-[#44B872]/60" />
                        </div>
                      </div>

                      {/* Sweeping Sonar Wave Fill */}
                      <div
                        className={`absolute inset-y-0 left-0 pointer-events-none ${
                          inZoneNow ? 'bg-[#44B872]/35' : 'bg-[#38BDF8]/25'
                        }`}
                        style={{ width: `${cursorPct}%` }}
                      />

                      {/* High-Visibility Sonar Pulse Head */}
                      <div
                        className={`absolute inset-y-0 w-1.5 -translate-x-1/2 pointer-events-none ${
                          inZoneNow
                            ? 'bg-[#6EE7B7]'
                            : isHolding
                              ? 'bg-[#38BDF8]'
                              : 'bg-[#E59A24]'
                        }`}
                        style={{ left: `${cursorPct}%` }}
                      />
                    </div>

                    {/* Depth Step Progress Indicators */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {layers.map((l, idx) => (
                        <div
                          key={l.layerId}
                          className={`h-1.5 flex-1 ${
                            idx < activeLayerIndex
                              ? 'bg-[#44B872]'
                              : idx === activeLayerIndex
                                ? 'bg-[#E59A24]'
                                : 'bg-[#28323F]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Feedback Line */}
                  <div
                    className={`border px-3.5 py-2.5 text-xs ${
                      feedback.kind === 'HIT'
                        ? 'border-[#2E9E5B]/60 bg-[#15281D] text-[#A2E4BC]'
                        : feedback.kind === 'TOO_EARLY' ||
                            feedback.kind === 'OVERFLOW'
                          ? 'border-[#D94436]/60 bg-[#2B1719] text-[#F4A59D]'
                          : 'border-[#2B3543] bg-[#161C24] text-[#CBD5E1]'
                    }`}
                  >
                    {feedbackMessage}
                  </div>

                  {/* Single-Thumb Hold & Release Primary Control */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (e.button !== 0 && e.pointerType === 'mouse') return;
                      e.preventDefault();
                      startHoldScan();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`retro-button w-full min-h-[68px] px-5 py-3.5 flex flex-col items-center justify-center gap-0.5 text-center select-none touch-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E59A24] ${
                      inZoneNow
                        ? 'bg-[#2E9E5B] border-[#6EE7B7] text-white'
                        : isHolding
                          ? 'bg-[#1B3A4B] border-[#38BDF8] text-[#F8FAFC]'
                          : 'bg-[#E59A24] text-[#12161B] hover:bg-[#F0A938]'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-bold tracking-wide whitespace-nowrap truncate max-w-full">
                      {isHolding
                        ? inZoneNow
                          ? interpolate(dict.coreSampleModal.buttonInZone, {
                              pct: Math.round(cursorPct),
                            })
                          : interpolate(dict.coreSampleModal.buttonScanning, {
                              pct: Math.round(cursorPct),
                            })
                        : dict.coreSampleModal.buttonIdle}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        isHolding ? 'text-[#CBD5E1]' : 'text-[#241B0D]'
                      }`}
                    >
                      {dict.coreSampleModal.oneHandHint}
                    </span>
                  </button>
                </>
              )}

              {phase === 'SUCCESS' && (
                <div className="border border-[#2E9E5B] bg-[#15281D] p-5 space-y-4 text-xs my-auto">
                  <div className="flex items-center gap-2 font-bold text-[#44B872] text-sm">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span>{dict.coreSampleModal.successHeading}</span>
                  </div>
                  <p className="text-[#CBD5E1] leading-relaxed">
                    {interpolate(dict.coreSampleModal.successSummary, {
                      profile: getLocalizedCoreProfile(
                        session.profileKey,
                        session.pressureProfileLabel,
                        lang
                      ),
                    })}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-[#2E9E5B]/40 bg-[#112017] p-3 font-mono tabular-nums">
                    <div>
                      <div className="font-sans text-[#8D9CAD]">
                        {dict.coreSampleModal.estOutputLabel}
                      </div>
                      <div className="text-[#44B872] font-bold mt-0.5">
                        {formatBarrelsI18n(
                          session.estimatedWellOutputBbl,
                          lang
                        )}
                        {dict.units.perMonth}
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-[#8D9CAD]">
                        {dict.coreSampleModal.reservoirPressureLabel}
                      </div>
                      <div className="text-[#E59A24] font-bold mt-0.5">
                        {session.reservoirPressureBar} bar
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-[#8D9CAD]">
                        {dict.coreSampleModal.drillAdvantageActiveLabel}
                      </div>
                      <div className="text-[#F8FAFC] font-bold mt-0.5">
                        {interpolate(dict.coreSampleModal.drillAdvantageVal, {
                          margin: greenBonusPct,
                          bonus: session.efficiencyBonusPct,
                        })}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onFinishOperation('SUCCESS')}
                    className="retro-button w-full min-h-[48px] bg-[#2E9E5B] px-4 py-3 text-xs font-bold text-white hover:bg-[#36B56A] cursor-pointer"
                  >
                    {dict.coreSampleModal.saveReportButton}
                  </button>
                </div>
              )}

              {phase === 'FAILED' && (
                <div className="border border-[#D94436] bg-[#2C1819] p-5 space-y-4 text-xs my-auto">
                  <div className="flex items-center gap-2 font-bold text-[#F87171] text-sm">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    <span>{dict.coreSampleModal.failedHeading}</span>
                  </div>
                  <p className="text-[#E2B4B0] leading-relaxed">
                    {feedbackMessage} {dict.coreSampleModal.failedSummaryPrefix}
                    {session.failPenaltyCost > 0
                      ? interpolate(
                          dict.coreSampleModal.failedSurchargeSentence,
                          {
                            cost: formatCurrencyI18n(
                              session.failPenaltyCost,
                              lang
                            ),
                          }
                        )
                      : ''}
                    {session.failGreenZoneMultiplier < 1
                      ? interpolate(dict.coreSampleModal.failedBannerMalusNote, {
                          malus: 5,
                        })
                      : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => onFinishOperation('FAILED')}
                    className="retro-button w-full min-h-[48px] bg-[#D94436] px-4 py-3 text-xs font-bold text-white hover:bg-[#E8584B] cursor-pointer"
                  >
                    {dict.coreSampleModal.ackFailureButton}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
