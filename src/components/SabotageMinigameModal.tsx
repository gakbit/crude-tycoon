/**
 * Interactive 2D side-scrolling stealth corridor infiltration minigame modal.
 * Players hold mouse/touch (or Space/Right Arrow) to walk right down the corridor,
 * release away from doors to flatten against the wall in shadow cover alcoves,
 * and release in front of server room doors (3-5 rooms by difficulty) to slip inside
 * and hack each terminal while avoiding sweeping left/right security cameras.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import { REGIONS_BY_ID } from '../data/regionsData';
import { SabotageMinigameSession } from '../engine/gameTypes';
import {
  detectBurglarSpotted,
  evaluateCameraSweep,
  findUnhackedDoorAtX,
  isPositionInWallCover,
} from '../engine/sabotageEngine';
import {
  formatCurrencyI18n,
  getLocalizedRegion,
  getLocalizedSabotageRoomLabel,
  interpolate,
  useI18n,
} from '../i18n';
import { soundFx } from '../utils/soundFx';

interface SabotageMinigameModalProps {
  session: SabotageMinigameSession;
  onFinishMinigame: (outcome: 'SUCCESS' | 'CAUGHT' | 'ABORTED') => void;
}

type BurglarPosture =
  | 'WALKING'
  | 'WALL_HUG'
  | 'HACKING_ROOM'
  | 'ROOM_READY_TO_EXIT';

type GameOutcome = 'PLAYING' | 'SUCCESS' | 'CAUGHT';

const VIEWPORT_W = 740;
const VIEWPORT_H = 264;
const CORRIDOR_FLOOR_Y = 204;

const HACK_LOG_LINES = [
  'SSH_AUTH // ROOT_BYPASS_OK',
  'MOUNT /GOV/OIL_QUOTA_DB',
  'OVERRIDE TELEMETRY_CHECKSUM',
  'PATCH REGISTRY -> COMMIT',
];

export const SabotageMinigameModal: React.FC<SabotageMinigameModalProps> = ({
  session,
  onFinishMinigame,
}) => {
  const { dict, lang } = useI18n();
  const regionStatic = REGIONS_BY_ID[session.regionId];
  const regionTrans = getLocalizedRegion(session.regionId, lang);

  // Mutable simulation refs for crisp 60fps loop
  const burglarXRef = useRef<number>(72);
  const facingDirRef = useRef<1 | -1>(1);
  const holdRightRef = useRef<boolean>(false);
  const holdLeftRef = useRef<boolean>(false);
  const postureRef = useRef<BurglarPosture>('WALL_HUG');
  const hackedRoomsRef = useRef<number[]>([]);
  const activeRoomIndexRef = useRef<number | null>(null);
  const hackProgressMsRef = useRef<number>(0);
  const elapsedSecRef = useRef<number>(0);
  const outcomeRef = useRef<GameOutcome>('PLAYING');
  const spottedCamIdRef = useRef<string | null>(null);
  const lastStepSoundAtRef = useRef<number>(0);
  const lastHackTickSoundAtRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // React render snapshot synced at 60fps
  const [renderTick, setRenderTick] = useState<{
    burglarX: number;
    facingDir: 1 | -1;
    posture: BurglarPosture;
    hackedRooms: number[];
    activeRoomIndex: number | null;
    hackProgressPct: number;
    elapsedSec: number;
    outcome: GameOutcome;
    spottedCamId: string | null;
  }>({
    burglarX: 72,
    facingDir: 1,
    posture: 'WALL_HUG',
    hackedRooms: [],
    activeRoomIndex: null,
    hackProgressPct: 0,
    elapsedSec: 0,
    outcome: 'PLAYING',
    spottedCamId: null,
  });

  const handleReleaseControls = useCallback(() => {
    const wasHolding = holdRightRef.current || holdLeftRef.current;
    holdRightRef.current = false;
    holdLeftRef.current = false;

    if (!wasHolding || outcomeRef.current !== 'PLAYING') return;
    if (
      postureRef.current === 'HACKING_ROOM' ||
      postureRef.current === 'ROOM_READY_TO_EXIT'
    ) {
      return;
    }

    // Core rule: Releasing in front of an unhacked door slips INSIDE instead of wall-hugging
    const doorMatch = findUnhackedDoorAtX(
      session.rooms,
      hackedRoomsRef.current,
      burglarXRef.current
    );
    if (doorMatch) {
      burglarXRef.current = doorMatch.doorX;
      postureRef.current = 'HACKING_ROOM';
      activeRoomIndexRef.current = doorMatch.roomIndex;
      hackProgressMsRef.current = 0;
      soundFx.click();
    } else {
      postureRef.current = 'WALL_HUG';
    }
  }, [session.rooms]);

  const startHoldMove = useCallback((dir: 1 | -1) => {
    if (outcomeRef.current !== 'PLAYING') return;
    if (postureRef.current === 'HACKING_ROOM') return;

    facingDirRef.current = dir;
    if (dir === 1) {
      holdRightRef.current = true;
      holdLeftRef.current = false;
    } else {
      holdLeftRef.current = true;
      holdRightRef.current = false;
    }

    // If burglar was safely waiting inside a completed room, holding steps out
    if (postureRef.current === 'ROOM_READY_TO_EXIT') {
      activeRoomIndexRef.current = null;
      postureRef.current = 'WALKING';
      soundFx.click();
    } else {
      postureRef.current = 'WALKING';
    }
  }, []);

  // Global release safety (mouse released outside viewport, tab blur) + Keyboard support
  useEffect(() => {
    const onWindowPointerUp = () => handleReleaseControls();
    const onWindowBlur = () => handleReleaseControls();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        startHoldMove(1);
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        startHoldMove(-1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' ||
        e.code === 'ArrowRight' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowLeft' ||
        e.code === 'KeyA'
      ) {
        e.preventDefault();
        handleReleaseControls();
      }
    };

    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleReleaseControls, startHoldMove]);

  // Main 60fps simulation loop
  useEffect(() => {
    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const dtSec = Math.min(0.05, (timestamp - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timestamp;

      if (outcomeRef.current === 'PLAYING') {
        elapsedSecRef.current += dtSec;

        // 1. Update hacking room timer
        if (
          postureRef.current === 'HACKING_ROOM' &&
          activeRoomIndexRef.current !== null
        ) {
          hackProgressMsRef.current += dtSec * 1000;
          if (timestamp - lastHackTickSoundAtRef.current > 240) {
            lastHackTickSoundAtRef.current = timestamp;
            soundFx.hackPulse();
          }

          if (hackProgressMsRef.current >= session.hackDurationMs) {
            const completedIdx = activeRoomIndexRef.current;
            if (!hackedRoomsRef.current.includes(completedIdx)) {
              hackedRoomsRef.current = [...hackedRoomsRef.current, completedIdx];
            }
            if (hackedRoomsRef.current.length >= session.roomsCount) {
              outcomeRef.current = 'SUCCESS';
              postureRef.current = 'ROOM_READY_TO_EXIT';
              soundFx.layerBreakthrough();
            } else {
              postureRef.current = 'ROOM_READY_TO_EXIT';
              soundFx.barLock(96);
            }
          }
        } else {
          // 2. Movement when holding right or left
          const isHolding = holdRightRef.current || holdLeftRef.current;
          if (isHolding && postureRef.current === 'WALKING') {
            const dir = holdLeftRef.current ? -1 : 1;
            const nextX = burglarXRef.current + dir * session.walkSpeedPxPerSec * dtSec;
            burglarXRef.current = Math.max(
              44,
              Math.min(session.corridorLengthPx - 56, nextX)
            );
            if (timestamp - lastStepSoundAtRef.current > 270) {
              lastStepSoundAtRef.current = timestamp;
              soundFx.footstep();
            }
          }

          // 3. Camera detection check
          const spottedCam = detectBurglarSpotted({
            x: burglarXRef.current,
            posture: postureRef.current,
            cameras: session.cameras,
            covers: session.covers,
            elapsedSec: elapsedSecRef.current,
          });

          if (spottedCam) {
            outcomeRef.current = 'CAUGHT';
            spottedCamIdRef.current = spottedCam.id;
            holdRightRef.current = false;
            holdLeftRef.current = false;
            soundFx.alarmTriggered();
          }
        }
      }

      setRenderTick({
        burglarX: burglarXRef.current,
        facingDir: facingDirRef.current,
        posture: postureRef.current,
        hackedRooms: [...hackedRoomsRef.current],
        activeRoomIndex: activeRoomIndexRef.current,
        hackProgressPct: Math.min(
          100,
          Math.round((hackProgressMsRef.current / session.hackDurationMs) * 100)
        ),
        elapsedSec: elapsedSecRef.current,
        outcome: outcomeRef.current,
        spottedCamId: spottedCamIdRef.current,
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [session]);

  const {
    burglarX,
    facingDir,
    posture,
    hackedRooms,
    activeRoomIndex,
    hackProgressPct,
    elapsedSec,
    outcome,
    spottedCamId,
  } = renderTick;

  // Smooth lead-ahead scrolling camera
  const maxScrollX = Math.max(0, session.corridorLengthPx - VIEWPORT_W);
  const cameraScrollX = Math.max(0, Math.min(maxScrollX, burglarX - 210));

  const doorNearBurglar = findUnhackedDoorAtX(
    session.rooms,
    hackedRooms,
    burglarX
  );
  const inCoverNow = isPositionInWallCover(
    session.covers,
    session.cameras,
    burglarX
  );
  const activeRoomSpec =
    activeRoomIndex !== null
      ? session.rooms.find((r) => r.roomIndex === activeRoomIndex) ?? null
      : null;

  const pctDelta = Math.round((session.effectConfig.outputMultiplier - 1) * 100);
  const hasMissedRoomBehind = session.rooms.some(
    (r) =>
      !hackedRooms.includes(r.roomIndex) &&
      burglarX > r.doorX + r.doorHalfWidth + 16
  );

  // Walking stride animation phase
  const strideWave =
    posture === 'WALKING' ? Math.sin(elapsedSec * 14) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sabotage-minigame-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-2.5 sm:p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[920px] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#354150] bg-[#161C24] px-4 sm:px-6 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 shrink-0 text-[#E59A24]" />
              <h2
                id="sabotage-minigame-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(dict.sabotageModal.titlePrefix, {
                  name: regionTrans.name,
                  code: regionStatic.shortCode,
                })}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[#9FB0C2]">
              {dict.difficulties[session.difficulty].shortLabel}{' '}
              {dict.sabotageModal.securityLevelSuffix} ·{' '}
              {dict.sabotageModal.feePrefix}{' '}
              <span className="font-mono tabular-nums text-[#E59A24]">
                {formatCurrencyI18n(session.upfrontCost, lang)}
              </span>{' '}
              · {dict.sabotageModal.targetEffectPrefix}{' '}
              <span
                className={`font-semibold ${
                  session.direction === 'BOOST'
                    ? 'text-[#44B872]'
                    : 'text-[#E8665A]'
                }`}
              >
                {session.direction === 'BOOST'
                  ? interpolate(dict.sabotageModal.boostEffectDesc, {
                      pct: pctDelta,
                      months: session.effectConfig.durationMonths,
                    })
                  : interpolate(dict.sabotageModal.sabotageEffectDesc, {
                      pct: pctDelta,
                      fine: formatCurrencyI18n(
                        session.effectConfig.ownerFine,
                        lang
                      ),
                    })}
              </span>
            </p>
          </div>

          {outcome === 'PLAYING' && (
            <button
              type="button"
              onClick={() => onFinishMinigame('ABORTED')}
              className="retro-button flex items-center gap-1.5 bg-[#2A1D20] px-3 py-1.5 text-xs font-semibold text-[#E8665A] hover:bg-[#3A2529] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>{dict.sabotageModal.retreatButton}</span>
            </button>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26303D] bg-[#12161B] px-4 sm:px-6 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>
              <span className="text-[#8D9CAD]">
                {dict.sabotageModal.hackedRoomsLabel}{' '}
              </span>
              <span className="font-mono font-bold tabular-nums text-[#44B872]">
                {hackedRooms.length} / {session.roomsCount}
              </span>
            </span>

            <span>
              <span className="text-[#8D9CAD]">
                {dict.sabotageModal.statusPrefix}{' '}
              </span>
              {outcome === 'CAUGHT' ? (
                <span className="font-semibold text-[#E8665A]">
                  {dict.sabotageModal.statusCaught}
                </span>
              ) : outcome === 'SUCCESS' ? (
                <span className="font-semibold text-[#44B872]">
                  {dict.sabotageModal.statusSuccess}
                </span>
              ) : posture === 'HACKING_ROOM' ? (
                <span className="font-semibold text-[#44B872]">
                  {interpolate(dict.sabotageModal.statusHacking, {
                    pct: hackProgressPct,
                  })}
                </span>
              ) : posture === 'ROOM_READY_TO_EXIT' ? (
                <span className="font-semibold text-[#38BDF8]">
                  {dict.sabotageModal.statusReadyExit}
                </span>
              ) : posture === 'WALKING' ? (
                <span className="font-semibold text-[#E59A24]">
                  {dict.sabotageModal.statusWalking}
                </span>
              ) : inCoverNow ? (
                <span className="font-semibold text-[#44B872]">
                  {dict.sabotageModal.statusWallCover}
                </span>
              ) : (
                <span className="font-semibold text-[#CBD5E1]">
                  {dict.sabotageModal.statusWallExposed}
                </span>
              )}
            </span>
          </div>

          <span className="font-mono text-[11px] text-[#E8665A]">
            {interpolate(dict.sabotageModal.caughtPenaltyLabel, {
              fine: formatCurrencyI18n(session.caughtFineCost, lang),
              months: session.lockdownMonths,
            })}
          </span>
        </div>

        {/* Main Playable 2D Scrolling Corridor Viewport */}
        <div className="p-3 sm:p-5 space-y-4 bg-[#1B222B]">
          {/* Progress Room Strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-[11px]">
            {session.rooms.map((r) => {
              const isDone = hackedRooms.includes(r.roomIndex);
              const isActive =
                posture === 'HACKING_ROOM' && activeRoomIndex === r.roomIndex;
              return (
                <div
                  key={r.code}
                  className={`flex items-center justify-between gap-1.5 border px-2.5 py-1.5 font-mono tabular-nums ${
                    isDone
                      ? 'border-[#2E9E5B] bg-[#16291E] text-[#A2E4BC]'
                      : isActive
                        ? 'border-[#E59A24] bg-[#272015] text-[#F9D697]'
                        : 'border-[#2D3846] bg-[#13181F] text-[#8D9CAD]'
                  }`}
                >
                  <span className="font-bold truncate">{r.code}</span>
                  <span>
                    {isDone
                      ? dict.sabotageModal.roomStatusOk
                      : isActive
                        ? `${hackProgressPct}%`
                        : dict.sabotageModal.roomStatusLocked}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Interactive Hold-to-Walk Corridor Canvas */}
          <div
            onPointerDown={(e) => {
              if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') {
                return;
              }
              e.preventDefault();
              startHoldMove(1);
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="relative w-full border-2 border-[#354150] bg-[#0D1117] overflow-hidden select-none touch-none cursor-pointer"
          >
            <svg
              viewBox={`0 0 ${VIEWPORT_W} ${VIEWPORT_H}`}
              className="block w-full h-auto"
              role="img"
              aria-label={dict.sabotageModal.svgAriaLabel}
            >
              <defs>
                <linearGradient id="corridorWallGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#121820" />
                  <stop offset="70%" stopColor="#1A222D" />
                  <stop offset="100%" stopColor="#141A22" />
                </linearGradient>
                <linearGradient id="beamDangerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.48" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0.16" />
                </linearGradient>
                <linearGradient id="beamWarnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E59A24" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#E59A24" stopOpacity="0.06" />
                </linearGradient>
              </defs>

              {/* Static Ceiling / Background */}
              <rect x={0} y={0} width={VIEWPORT_W} height={VIEWPORT_H} fill="#0D1117" />

              {/* Scrolling World Group */}
              <g transform={`translate(${-cameraScrollX}, 0)`}>
                {/* Corridor Back Wall & Floor */}
                <rect
                  x={0}
                  y={24}
                  width={session.corridorLengthPx}
                  height={CORRIDOR_FLOOR_Y - 24}
                  fill="url(#corridorWallGrad)"
                />
                <rect
                  x={0}
                  y={CORRIDOR_FLOOR_Y}
                  width={session.corridorLengthPx}
                  height={VIEWPORT_H - CORRIDOR_FLOOR_Y}
                  fill="#0B0F14"
                />
                <line
                  x1={0}
                  y1={CORRIDOR_FLOOR_Y}
                  x2={session.corridorLengthPx}
                  y2={CORRIDOR_FLOOR_Y}
                  stroke="#364354"
                  strokeWidth={2}
                />

                {/* Architectural Wall Panel Seam Lines */}
                {Array.from(
                  { length: Math.ceil(session.corridorLengthPx / 90) },
                  (_, idx) => (
                    <g key={`seam_${idx}`}>
                      <line
                        x1={idx * 90}
                        y1={28}
                        x2={idx * 90}
                        y2={CORRIDOR_FLOOR_Y}
                        stroke="#212B37"
                        strokeWidth={1}
                      />
                      <line
                        x1={idx * 90}
                        y1={CORRIDOR_FLOOR_Y}
                        x2={idx * 90 - 24}
                        y2={VIEWPORT_H}
                        stroke="#19212B"
                        strokeWidth={1}
                      />
                    </g>
                  )
                )}

                {/* Entry Lobby Label */}
                <g transform="translate(24, 52)">
                  <rect
                    x={0}
                    y={0}
                    width={120}
                    height={22}
                    fill="#16291E"
                    stroke="#2E9E5B"
                    strokeWidth={1}
                  />
                  <text
                    x={60}
                    y={14}
                    textAnchor="middle"
                    fill="#A2E4BC"
                    fontSize={8.5}
                    fontWeight={700}
                  >
                    {dict.sabotageModal.entryZoneTag}
                  </text>
                </g>

                {/* Shadow Cover Pillars / Alcoves */}
                {session.covers.map((cov) => {
                  const left = cov.centerX - cov.halfWidth;
                  const width = cov.halfWidth * 2;
                  const activeCover =
                    posture === 'WALL_HUG' &&
                    Math.abs(burglarX - cov.centerX) <= cov.halfWidth;

                  return (
                    <g key={cov.id}>
                      <rect
                        x={left}
                        y={38}
                        width={width}
                        height={CORRIDOR_FLOOR_Y - 38}
                        fill="#0A0E13"
                        stroke={activeCover ? '#44B872' : '#2A3544'}
                        strokeWidth={activeCover ? 2 : 1}
                      />
                      <rect
                        x={left + 4}
                        y={42}
                        width={width - 8}
                        height={6}
                        fill={activeCover ? '#2E9E5B' : '#1E2733'}
                      />
                      <text
                        x={cov.centerX}
                        y={66}
                        textAnchor="middle"
                        fill={activeCover ? '#A2E4BC' : '#64758A'}
                        fontSize={7.5}
                        fontWeight={700}
                      >
                        {dict.sabotageModal.coverTag}
                      </text>
                      {/* Floor Safe Bracket */}
                      <line
                        x1={left}
                        y1={CORRIDOR_FLOOR_Y + 4}
                        x2={left + width}
                        y2={CORRIDOR_FLOOR_Y + 4}
                        stroke={activeCover ? '#44B872' : '#2E9E5B'}
                        strokeOpacity={0.65}
                        strokeWidth={3}
                      />
                    </g>
                  );
                })}

                {/* Server Room Doors */}
                {session.rooms.map((room) => {
                  const isHacked = hackedRooms.includes(room.roomIndex);
                  const isBeingHacked =
                    posture === 'HACKING_ROOM' &&
                    activeRoomIndex === room.roomIndex;
                  const isStandingReadyInside =
                    posture === 'ROOM_READY_TO_EXIT' &&
                    activeRoomIndex === room.roomIndex;
                  const isPlayerAtDoor =
                    !isHacked &&
                    Math.abs(burglarX - room.doorX) <= room.doorHalfWidth &&
                    posture === 'WALKING';

                  const doorLeft = room.doorX - 28;
                  const doorWidth = 56;
                  const doorTop = 74;
                  const doorHeight = CORRIDOR_FLOOR_Y - doorTop;

                  const frameStroke = isHacked
                    ? '#2E9E5B'
                    : isPlayerAtDoor || isBeingHacked
                      ? '#38BDF8'
                      : '#E59A24';

                  return (
                    <g key={room.code}>
                      {/* Floor Door Trigger Zone Indicator */}
                      {!isHacked && (
                        <rect
                          x={room.doorX - room.doorHalfWidth}
                          y={CORRIDOR_FLOOR_Y}
                          width={room.doorHalfWidth * 2}
                          height={8}
                          fill={isPlayerAtDoor ? '#38BDF8' : '#E59A24'}
                          fillOpacity={isPlayerAtDoor ? 0.55 : 0.2}
                        />
                      )}

                      {/* Door Frame */}
                      <rect
                        x={doorLeft - 4}
                        y={doorTop - 4}
                        width={doorWidth + 8}
                        height={doorHeight + 4}
                        fill="#11161D"
                        stroke={frameStroke}
                        strokeWidth={isPlayerAtDoor ? 2.5 : 1.5}
                      />

                      {/* Door Leaf (slid open when inside) */}
                      <rect
                        x={doorLeft}
                        y={doorTop}
                        width={
                          isBeingHacked || isStandingReadyInside
                            ? 14
                            : doorWidth
                        }
                        height={doorHeight}
                        fill={isHacked ? '#15241C' : '#1E2733'}
                        stroke="#324052"
                        strokeWidth={1}
                      />

                      {/* Glass Window / Status Panel on Door */}
                      {!(isBeingHacked || isStandingReadyInside) && (
                        <rect
                          x={doorLeft + 12}
                          y={doorTop + 16}
                          width={doorWidth - 24}
                          height={28}
                          fill={isHacked ? '#1B3A29' : '#0E141B'}
                          stroke={frameStroke}
                          strokeWidth={1}
                        />
                      )}

                      {/* Room Code Header Plate */}
                      <rect
                        x={room.doorX - 30}
                        y={doorTop - 26}
                        width={60}
                        height={18}
                        fill={isHacked ? '#16291E' : '#1B222B'}
                        stroke={frameStroke}
                        strokeWidth={1}
                      />
                      <text
                        x={room.doorX}
                        y={doorTop - 13}
                        textAnchor="middle"
                        fill={
                          isHacked
                            ? '#44B872'
                            : isPlayerAtDoor
                              ? '#38BDF8'
                              : '#E59A24'
                        }
                        fontSize={9.5}
                        fontWeight={700}
                      >
                        {isHacked ? `${room.code} ✓` : room.code}
                      </text>

                      {/* Door Handle */}
                      {!(isBeingHacked || isStandingReadyInside) && (
                        <rect
                          x={doorLeft + doorWidth - 11}
                          y={doorTop + 66}
                          width={6}
                          height={3}
                          fill="#CBD5E1"
                        />
                      )}

                      {/* Prompt when aligned at door */}
                      {isPlayerAtDoor && (
                        <g transform={`translate(${room.doorX}, ${doorTop - 36})`}>
                          <rect
                            x={-88}
                            y={-15}
                            width={176}
                            height={18}
                            fill="#0C2533"
                            stroke="#38BDF8"
                            strokeWidth={1.2}
                          />
                          <text
                            x={0}
                            y={-3}
                            textAnchor="middle"
                            fill="#BAE6FD"
                            fontSize={8}
                            fontWeight={700}
                          >
                            {dict.sabotageModal.doorReachedTag}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Burglar Sprite (hidden inside room while hacking, peeking in door when ready to exit) */}
                {posture !== 'HACKING_ROOM' && (
                  <g
                    transform={`translate(${burglarX}, ${CORRIDOR_FLOOR_Y}) scale(${facingDir}, 1)`}
                    opacity={
                      posture === 'WALL_HUG' && inCoverNow
                        ? 0.55
                        : posture === 'ROOM_READY_TO_EXIT'
                          ? 0.72
                          : 1
                    }
                  >
                    {/* Shadow on Floor */}
                    <ellipse
                      cx={0}
                      cy={2}
                      rx={posture === 'WALL_HUG' ? 11 : 14}
                      ry={3.5}
                      fill="#000000"
                      fillOpacity={0.55}
                    />

                    {/* Legs */}
                    <line
                      x1={-4}
                      y1={-22}
                      x2={-4 + strideWave * 8}
                      y2={0}
                      stroke="#94A3B8"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <line
                      x1={4}
                      y1={-22}
                      x2={4 - strideWave * 8}
                      y2={0}
                      stroke="#CBD5E1"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />

                    {/* Trench Coat / Stealth Torso */}
                    {posture === 'WALL_HUG' ? (
                      <rect
                        x={-8}
                        y={-52}
                        width={16}
                        height={32}
                        rx={2}
                        fill="#1E293B"
                        stroke={inCoverNow ? '#44B872' : '#E59A24'}
                        strokeWidth={1.5}
                      />
                    ) : (
                      <polygon
                        points="-10,-54 11,-54 14,-18 -13,-18"
                        fill="#1E293B"
                        stroke="#E59A24"
                        strokeWidth={1.5}
                      />
                    )}

                    {/* Hacking Tablet / Satchel */}
                    <rect
                      x={posture === 'WALL_HUG' ? -9 : 5}
                      y={-40}
                      width={7}
                      height={10}
                      fill="#0F172A"
                      stroke="#38BDF8"
                      strokeWidth={1}
                    />

                    {/* Head & Night-Vision Goggle Glow */}
                    <circle
                      cx={0}
                      cy={-62}
                      r={8}
                      fill="#334155"
                      stroke={inCoverNow && posture === 'WALL_HUG' ? '#44B872' : '#E2E8F0'}
                      strokeWidth={1.2}
                    />
                    <rect
                      x={posture === 'WALL_HUG' ? -4 : 1}
                      y={-64}
                      width={6}
                      height={3.5}
                      fill="#44B872"
                    />
                  </g>
                )}

                {/* Posture Tag Above Burglar */}
                {posture === 'WALL_HUG' && outcome === 'PLAYING' && !doorNearBurglar && (
                  <text
                    x={burglarX}
                    y={CORRIDOR_FLOOR_Y - 78}
                    textAnchor="middle"
                    fill={inCoverNow ? '#44B872' : '#E59A24'}
                    fontSize={8.5}
                    fontWeight={700}
                  >
                    {inCoverNow
                      ? dict.sabotageModal.burglarHiddenTag
                      : dict.sabotageModal.burglarExposedTag}
                  </text>
                )}

                {/* Sweeping Ceiling Cameras & Vision Cones (rendered over corridor) */}
                {session.cameras.map((cam) => {
                  const sweep = evaluateCameraSweep(cam, elapsedSec);
                  const isSpotter = spottedCamId === cam.id;
                  const coneOriginX = cam.mountX;
                  const coneOriginY = 34;

                  // Polygon points for active red cone or amber turn flash
                  let conePoints = '';
                  if (sweep.isBeamDangerous) {
                    conePoints = `${coneOriginX},${coneOriginY} ${sweep.beamMinX},${CORRIDOR_FLOOR_Y + 6} ${sweep.beamMaxX},${CORRIDOR_FLOOR_Y + 6}`;
                  } else {
                    const turnCenter = cam.mountX + sweep.visualAngleSign * 42;
                    conePoints = `${coneOriginX},${coneOriginY} ${turnCenter - 18},${CORRIDOR_FLOOR_Y + 2} ${turnCenter + 18},${CORRIDOR_FLOOR_Y + 2}`;
                  }

                  return (
                    <g key={cam.id}>
                      {/* Volumetric Vision Cone */}
                      <polygon
                        points={conePoints}
                        fill={
                          sweep.isBeamDangerous
                            ? 'url(#beamDangerGrad)'
                            : 'url(#beamWarnGrad)'
                        }
                        stroke={
                          isSpotter
                            ? '#FF4444'
                            : sweep.isBeamDangerous
                              ? '#D94436'
                              : '#E59A24'
                        }
                        strokeOpacity={isSpotter ? 1 : sweep.isBeamDangerous ? 0.55 : 0.35}
                        strokeWidth={isSpotter ? 2 : 1}
                      />

                      {/* Floor Danger Bar */}
                      {sweep.isBeamDangerous && (
                        <line
                          x1={sweep.beamMinX}
                          y1={CORRIDOR_FLOOR_Y + 2}
                          x2={sweep.beamMaxX}
                          y2={CORRIDOR_FLOOR_Y + 2}
                          stroke="#EF4444"
                          strokeWidth={3}
                        />
                      )}

                      {/* Ceiling Mount & Swiveling Camera Housing */}
                      <rect
                        x={cam.mountX - 10}
                        y={20}
                        width={20}
                        height={8}
                        fill="#2D3846"
                      />
                      <g
                        transform={`translate(${cam.mountX}, 31) rotate(${sweep.visualAngleSign * 34})`}
                      >
                        <rect
                          x={-7}
                          y={-4}
                          width={14}
                          height={9}
                          fill="#475569"
                          stroke="#CBD5E1"
                          strokeWidth={1}
                        />
                        <circle
                          cx={0}
                          cy={5}
                          r={3}
                          fill={
                            isSpotter
                              ? '#FF2E2E'
                              : sweep.isBeamDangerous
                                ? '#EF4444'
                                : '#E59A24'
                          }
                        />
                      </g>

                      {/* Direction Indicator Label */}
                      <text
                        x={cam.mountX}
                        y={16}
                        textAnchor="middle"
                        fill={sweep.isBeamDangerous ? '#F87171' : '#E59A24'}
                        fontSize={8}
                        fontWeight={700}
                      >
                        {sweep.direction === 'LEFT'
                          ? dict.sabotageModal.camLeftTag
                          : sweep.direction === 'RIGHT'
                            ? dict.sabotageModal.camRightTag
                            : dict.sabotageModal.camTurnTag}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* In-Room Terminal Hacking Animation Overlay */}
            {posture === 'HACKING_ROOM' && activeRoomSpec && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#090D12]/80 p-4">
                <div className="w-full max-w-[380px] border-2 border-[#2E9E5B] bg-[#0D1612] p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-mono font-bold text-[#44B872]">
                      <Terminal className="h-4 w-4" />
                      <span>
                        {activeRoomSpec.code} ·{' '}
                        {getLocalizedSabotageRoomLabel(
                          activeRoomSpec.roomIndex,
                          activeRoomSpec.label,
                          lang
                        )}
                      </span>
                    </span>
                    <span className="font-mono font-bold tabular-nums text-[#A2E4BC]">
                      {hackProgressPct}%
                    </span>
                  </div>

                  {/* Animated Terminal Packet Lines */}
                  <div className="border border-[#1E3A2B] bg-[#080F0C] p-2.5 font-mono text-[11px] space-y-1 text-[#44B872]">
                    {HACK_LOG_LINES.map((line, lineIdx) => {
                      const threshold = (lineIdx + 1) * 22;
                      const visible = hackProgressPct >= threshold - 18;
                      const done = hackProgressPct >= threshold;
                      return (
                        <div
                          key={line}
                          className={`flex items-center justify-between transition-opacity ${
                            visible ? 'opacity-100' : 'opacity-25'
                          }`}
                        >
                          <span>&gt; {line}</span>
                          <span>{done ? '[OK]' : '...'}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hacking Progress Bar */}
                  <div className="h-2.5 w-full bg-[#09120E] border border-[#2E9E5B]/60 overflow-hidden">
                    <div
                      className="h-full bg-[#44B872] transition-[width] duration-75"
                      style={{ width: `${hackProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Hold Controls Row (Touch & Mouse Friendly) */}
          {outcome === 'PLAYING' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                disabled={posture === 'HACKING_ROOM'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startHoldMove(-1);
                }}
                onPointerUp={handleReleaseControls}
                onPointerLeave={handleReleaseControls}
                onPointerCancel={handleReleaseControls}
                className={`retro-button min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap shrink-0 select-none touch-none cursor-pointer ${
                  hasMissedRoomBehind
                    ? 'bg-[#2E2516] border-[#E59A24] text-[#F9D697] hover:bg-[#3B301B]'
                    : 'bg-[#232B35] text-[#CBD5E1] hover:bg-[#2F3A48]'
                } disabled:opacity-40`}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>
                  {hasMissedRoomBehind
                    ? dict.sabotageModal.stepBackMissedButton
                    : dict.sabotageModal.stepBackButton}
                </span>
              </button>

              <button
                type="button"
                disabled={posture === 'HACKING_ROOM'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startHoldMove(1);
                }}
                onPointerUp={handleReleaseControls}
                onPointerLeave={handleReleaseControls}
                onPointerCancel={handleReleaseControls}
                className="retro-button flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 bg-[#E59A24] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 whitespace-nowrap select-none touch-none cursor-pointer"
              >
                <span>{dict.sabotageModal.holdForwardButton}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          )}

          {/* Concise Instructions Note */}
          {outcome === 'PLAYING' && (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-[#2D3846] bg-[#13181F] px-3.5 py-2 text-[11px] text-[#9FB0C2]">
              <span>{dict.sabotageModal.controlsHint}</span>
              <span className="font-mono tabular-nums text-[#E59A24]">
                {dict.sabotageModal.deadzoneHint}
              </span>
            </div>
          )}

          {/* Outcome Panels */}
          {outcome === 'SUCCESS' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#2E9E5B] bg-[#16291E] p-4">
              <div className="flex items-start sm:items-center gap-2.5 text-[#A2E4BC]">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0 text-[#44B872]" />
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-sm text-[#F8FAFC]">
                    {interpolate(dict.sabotageModal.successTitle, {
                      rooms: session.roomsCount,
                    })}
                  </div>
                  <p>
                    {session.direction === 'BOOST'
                      ? interpolate(dict.sabotageModal.successBoostDesc, {
                          region: regionTrans.name,
                          pct: pctDelta,
                          months: session.effectConfig.durationMonths,
                        })
                      : interpolate(dict.sabotageModal.successSabotageDesc, {
                          region: regionTrans.name,
                          pct: pctDelta,
                          months: session.effectConfig.durationMonths,
                          fine: formatCurrencyI18n(
                            session.effectConfig.ownerFine,
                            lang
                          ),
                        })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onFinishMinigame('SUCCESS')}
                className="retro-button min-h-[42px] bg-[#2E9E5B] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#36B56A] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.sabotageModal.applyButton}
              </button>
            </div>
          )}

          {outcome === 'CAUGHT' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#D94436] bg-[#2D1819] p-4">
              <div className="flex items-start sm:items-center gap-2.5 text-[#F4A59D]">
                <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0 text-[#E8665A]" />
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-sm text-[#F8FAFC]">
                    {dict.sabotageModal.caughtTitle}
                  </div>
                  <p>
                    {interpolate(dict.sabotageModal.caughtDesc, {
                      cost: formatCurrencyI18n(session.upfrontCost, lang),
                      fine: formatCurrencyI18n(session.caughtFineCost, lang),
                      code: regionStatic.shortCode,
                      months: session.lockdownMonths,
                    })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onFinishMinigame('CAUGHT')}
                className="retro-button min-h-[42px] bg-[#D94436] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#E45749] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.sabotageModal.ackFineButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
