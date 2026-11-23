/**
 * Multi-floor stealth infiltration minigame. The whole building is shown as a cross-section
 * that fits a portrait phone screen. Input is tap/click only: tap a spot to walk there, a door
 * to breach it, a hiding place to hide, the stairs or the lift to change floors.
 * Server rooms are spread across the floors and guarded by swinging, blinking and sliding
 * cameras plus patrolling guards.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldAlert, Terminal, X } from 'lucide-react';
import { REGIONS_BY_ID } from '../data/regionsData';
import {
  SabotageMinigameSession,
  StealthHideKind,
  StealthHideSpotSpec,
  StealthRoomSpec,
} from '../engine/gameTypes';
import {
  RouteMode,
  RouteStep,
  STEALTH_EXPOSURE_GRACE_SEC,
  STEALTH_KEYCARD_PICKUP_RADIUS,
  STEALTH_LIFT_SEC_PER_FLOOR,
  STEALTH_LIFT_WAIT_SEC,
  STEALTH_STAIRS_CLIMB_SEC,
  STEALTH_START_X,
  STEALTH_WALK_MAX_X,
  STEALTH_WALK_MIN_X,
  detectPlayerSpotted,
  evaluateCamera,
  evaluateGuard,
  planRoute,
} from '../engine/sabotageEngine';
import {
  formatCurrencyI18n,
  getLocalizedRegion,
  getLocalizedSabotageRoomLabel,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface SabotageMinigameModalProps {
  session: SabotageMinigameSession;
  onFinishMinigame: (outcome: 'SUCCESS' | 'CAUGHT' | 'ABORTED') => void;
}

type Posture =
  | 'IDLE'
  | 'WALKING'
  | 'CLIMBING'
  | 'LIFT_WAIT'
  | 'LIFT_RIDE'
  | 'HIDDEN'
  | 'HACKING';

type GameOutcome = 'PLAYING' | 'SUCCESS' | 'CAUGHT';

type Action =
  | RouteStep
  | { type: 'HACK'; roomIndex: number }
  | { type: 'HIDE'; spotId: string };

interface Sim {
  floor: number;
  x: number;
  facing: 1 | -1;
  posture: Posture;
  route: Action[];
  actionStarted: boolean;
  actionT: number;
  climbFrom: number;
  cabinFloor: number;
  hasKeycard: boolean;
  hackedRooms: number[];
  activeRoomIndex: number | null;
  hackMs: number;
  elapsed: number;
  exposure: number;
  keyFlashUntil: number;
  hideSpotId: string | null;
  outcome: GameOutcome;
  spottedId: string | null;
}

const VW = 360;
const FLOOR_H = 92;
const TOP = 16;
const FLOOR_PAD = 12;
const TAP_SLOP = 26;

const HACK_LOG_LINES = [
  'SSH_AUTH // ROOT_BYPASS_OK',
  'MOUNT /GOV/OIL_QUOTA_DB',
  'OVERRIDE TELEMETRY_CHECKSUM',
  'PATCH REGISTRY -> COMMIT',
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function createSim(): Sim {
  return {
    floor: 0,
    x: STEALTH_START_X,
    facing: 1,
    posture: 'IDLE',
    route: [],
    actionStarted: false,
    actionT: 0,
    climbFrom: 0,
    cabinFloor: 0,
    hasKeycard: false,
    hackedRooms: [],
    activeRoomIndex: null,
    hackMs: 0,
    elapsed: 0,
    exposure: 0,
    keyFlashUntil: -1,
    hideSpotId: null,
    outcome: 'PLAYING',
    spottedId: null,
  };
}

interface RenderSnap {
  floorF: number;
  x: number;
  facing: 1 | -1;
  posture: Posture;
  hackedRooms: number[];
  activeRoomIndex: number | null;
  hackProgressPct: number;
  elapsedSec: number;
  exposure: number;
  keyFlash: boolean;
  hideSpotId: string | null;
  hasKeycard: boolean;
  cabinFloor: number;
  outcome: GameOutcome;
  spottedId: string | null;
}

function snapshot(s: Sim, hackDuration: number): RenderSnap {
  let floorF = s.floor;
  if (s.posture === 'CLIMBING') {
    const target = s.route[0];
    if (target && target.type === 'STAIRS') {
      const p = clamp(s.actionT / STEALTH_STAIRS_CLIMB_SEC, 0, 1);
      floorF = s.climbFrom + (target.toFloor - s.climbFrom) * p;
    }
  }
  return {
    floorF,
    x: s.x,
    facing: s.facing,
    posture: s.posture,
    hackedRooms: [...s.hackedRooms],
    activeRoomIndex: s.activeRoomIndex,
    hackProgressPct: hackDuration
      ? Math.min(100, Math.round((s.hackMs / hackDuration) * 100))
      : 0,
    elapsedSec: s.elapsed,
    exposure: s.exposure,
    keyFlash: s.elapsed < s.keyFlashUntil,
    hideSpotId: s.hideSpotId,
    hasKeycard: s.hasKeycard,
    cabinFloor: s.cabinFloor,
    outcome: s.outcome,
    spottedId: s.spottedId,
  };
}

export const SabotageMinigameModal: React.FC<SabotageMinigameModalProps> = ({
  session,
  onFinishMinigame,
}) => {
  const { dict, lang } = useI18n();
  const regionStatic = REGIONS_BY_ID[session.regionId];
  const regionTrans = getLocalizedRegion(session.regionId, lang);
  const { building } = session;
  const floorsCount = building.floorsCount;
  const VH = TOP + floorsCount * FLOOR_H + 8;

  const floorTop = useCallback(
    (f: number) => TOP + (floorsCount - 1 - f) * FLOOR_H,
    [floorsCount]
  );
  const floorY = useCallback(
    (f: number) => floorTop(f) + FLOOR_H - FLOOR_PAD,
    [floorTop]
  );

  const simRef = useRef<Sim>(createSim());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const lastStepSoundRef = useRef(0);
  const lastHackSoundRef = useRef(0);
  const [snap, setSnap] = useState<RenderSnap>(() => snapshot(createSim(), 0));

  const activeRoom = useCallback(
    (idx: number | null): StealthRoomSpec | null =>
      idx === null ? null : (session.rooms.find((r) => r.roomIndex === idx) ?? null),
    [session.rooms]
  );

  // Main simulation loop
  useEffect(() => {
    simRef.current = createSim();
    lastFrameRef.current = null;
    let raf = 0;

    const finishAction = (s: Sim) => {
      s.route.shift();
      s.actionStarted = false;
      s.actionT = 0;
    };

    const tick = (timestamp: number) => {
      const s = simRef.current;
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const dt = Math.min(0.05, (timestamp - lastFrameRef.current) / 1000);
      lastFrameRef.current = timestamp;

      if (s.outcome === 'PLAYING') {
        s.elapsed += dt;
        const action = s.route[0];

        if (!action) {
          if (s.posture !== 'HIDDEN') s.posture = 'IDLE';
        } else if (action.type === 'WALK') {
          s.posture = 'WALKING';
          const delta = action.x - s.x;
          const step = session.walkSpeedPxPerSec * dt;
          if (Math.abs(delta) <= step) {
            s.x = action.x;
            finishAction(s);
          } else {
            s.x += Math.sign(delta) * step;
            s.facing = delta > 0 ? 1 : -1;
            if (timestamp - lastStepSoundRef.current > 270) {
              lastStepSoundRef.current = timestamp;
              soundFx.footstep();
            }
          }
        } else if (action.type === 'STAIRS') {
          if (!s.actionStarted) {
            s.actionStarted = true;
            s.climbFrom = s.floor;
            s.actionT = 0;
          }
          s.posture = 'CLIMBING';
          s.actionT += dt;
          if (timestamp - lastStepSoundRef.current > 220) {
            lastStepSoundRef.current = timestamp;
            soundFx.footstep();
          }
          if (s.actionT >= STEALTH_STAIRS_CLIMB_SEC) {
            s.floor = action.toFloor;
            finishAction(s);
          }
        } else if (action.type === 'LIFT') {
          if (!s.actionStarted) {
            s.actionStarted = true;
            s.climbFrom = s.floor;
            s.actionT = 0;
            s.x = building.liftX;
            s.cabinFloor = s.floor;
            soundFx.click();
          }
          s.actionT += dt;
          const rideSec =
            Math.abs(action.toFloor - s.climbFrom) * STEALTH_LIFT_SEC_PER_FLOOR;
          if (s.actionT < STEALTH_LIFT_WAIT_SEC) {
            s.posture = 'LIFT_WAIT';
          } else if (s.actionT < STEALTH_LIFT_WAIT_SEC + rideSec) {
            s.posture = 'LIFT_RIDE';
            const p = (s.actionT - STEALTH_LIFT_WAIT_SEC) / rideSec;
            s.cabinFloor = s.climbFrom + (action.toFloor - s.climbFrom) * p;
          } else {
            s.floor = action.toFloor;
            s.cabinFloor = action.toFloor;
            soundFx.click();
            finishAction(s);
          }
        } else if (action.type === 'HIDE') {
          const spot = session.hideSpots.find((h) => h.id === action.spotId);
          if (spot) {
            s.x = spot.x;
            s.hideSpotId = spot.id;
            s.posture = 'HIDDEN';
            soundFx.click();
          }
          finishAction(s);
        } else if (action.type === 'HACK') {
          const room = session.rooms.find((r) => r.roomIndex === action.roomIndex);
          if (!room || s.hackedRooms.includes(room.roomIndex)) {
            finishAction(s);
          } else if (!s.actionStarted) {
            if (room.doorType === 'KEYCARD' && !s.hasKeycard) {
              s.keyFlashUntil = s.elapsed + 2.5;
              s.route = [];
              s.posture = 'IDLE';
            } else {
              s.actionStarted = true;
              s.x = room.doorX;
              s.activeRoomIndex = room.roomIndex;
              s.hackMs = 0;
              s.posture = 'HACKING';
              soundFx.click();
            }
          } else {
            s.hackMs += dt * 1000;
            if (timestamp - lastHackSoundRef.current > 240) {
              lastHackSoundRef.current = timestamp;
              soundFx.hackPulse();
            }
            if (s.hackMs >= room.hackDurationMs) {
              s.hackedRooms = [...s.hackedRooms, room.roomIndex];
              s.activeRoomIndex = null;
              s.hackMs = 0;
              s.posture = 'IDLE';
              finishAction(s);
              if (s.hackedRooms.length >= session.roomsCount) {
                s.outcome = 'SUCCESS';
                s.route = [];
                soundFx.layerBreakthrough();
              } else {
                soundFx.barLock(96);
              }
            }
          }
        }

        if (s.outcome === 'PLAYING') {
          const current = s.route[0];
          const detectFloor =
            s.posture === 'CLIMBING' && current && current.type === 'STAIRS'
              ? s.actionT / STEALTH_STAIRS_CLIMB_SEC < 0.5
                ? s.climbFrom
                : current.toFloor
              : s.floor;

          if (
            building.keycard &&
            !s.hasKeycard &&
            s.posture !== 'HACKING' &&
            s.posture !== 'LIFT_RIDE' &&
            detectFloor === building.keycard.floor &&
            Math.abs(s.x - building.keycard.x) <= STEALTH_KEYCARD_PICKUP_RADIUS
          ) {
            s.hasKeycard = true;
            soundFx.barLock(100);
          }

          const hideSpot: StealthHideSpotSpec | null =
            s.posture === 'HIDDEN'
              ? (session.hideSpots.find((h) => h.id === s.hideSpotId) ?? null)
              : null;
          const spotted = detectPlayerSpotted({
            session,
            player: {
              floor: detectFloor,
              x: s.x,
              hideSpot,
              isConcealed: s.posture === 'HACKING' || s.posture === 'LIFT_RIDE',
            },
            elapsedSec: s.elapsed,
          });

          if (spotted) {
            s.exposure += dt;
            if (s.exposure >= STEALTH_EXPOSURE_GRACE_SEC) {
              s.outcome = 'CAUGHT';
              s.spottedId = spotted;
              s.route = [];
              soundFx.alarmTriggered();
            }
          } else {
            s.exposure = Math.max(0, s.exposure - dt * 1.5);
          }
        }
      }

      const room = s.activeRoomIndex === null
        ? null
        : session.rooms.find((r) => r.roomIndex === s.activeRoomIndex);
      setSnap(snapshot(s, room ? room.hackDurationMs : 0));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session, building]);

  const handleTap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = simRef.current;
    const svg = svgRef.current;
    if (!svg || s.outcome !== 'PLAYING') return;
    if (
      s.posture === 'HACKING' ||
      s.posture === 'CLIMBING' ||
      s.posture === 'LIFT_WAIT' ||
      s.posture === 'LIFT_RIDE'
    ) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VW;
    const py = ((e.clientY - rect.top) / rect.height) * VH;
    const tapFloor = clamp(
      floorsCount - 1 - Math.floor((py - TOP) / FLOOR_H),
      0,
      floorsCount - 1
    );

    let targetFloor = tapFloor;
    let targetX = clamp(px, STEALTH_WALK_MIN_X, STEALTH_WALK_MAX_X);
    let mode: RouteMode = 'AUTO';
    let finalAction: Action | null = null;

    const room = session.rooms.find(
      (r) =>
        r.floor === tapFloor &&
        !s.hackedRooms.includes(r.roomIndex) &&
        Math.abs(px - r.doorX) <= TAP_SLOP
    );
    const hideSpot = session.hideSpots.find(
      (h) => h.floor === tapFloor && Math.abs(px - h.x) <= h.halfWidth + 10
    );

    if (room) {
      targetX = room.doorX;
      finalAction = { type: 'HACK', roomIndex: room.roomIndex };
    } else if (hideSpot) {
      if (s.posture === 'HIDDEN' && s.hideSpotId === hideSpot.id) return;
      targetX = hideSpot.x;
      finalAction = { type: 'HIDE', spotId: hideSpot.id };
    } else if (Math.abs(px - building.liftX) <= TAP_SLOP - 4) {
      targetX = building.liftX;
      mode = 'LIFT';
    } else if (
      tapFloor < floorsCount - 1 &&
      Math.abs(px - building.stairsX[tapFloor]) <= TAP_SLOP - 4
    ) {
      targetFloor = tapFloor + 1;
      targetX = building.stairsX[tapFloor];
      mode = 'STAIRS';
    } else if (
      tapFloor > 0 &&
      Math.abs(px - building.stairsX[tapFloor - 1]) <= TAP_SLOP - 4
    ) {
      targetFloor = tapFloor - 1;
      targetX = building.stairsX[tapFloor - 1];
      mode = 'STAIRS';
    }

    const steps = planRoute(
      building,
      { floor: s.floor, x: s.x },
      { floor: targetFloor, x: targetX },
      mode
    );
    s.route = finalAction ? [...steps, finalAction] : steps;
    s.actionStarted = false;
    s.actionT = 0;
    if (s.posture === 'HIDDEN' && s.route.length > 0) {
      s.hideSpotId = null;
      s.posture = 'IDLE';
    }
    if (s.route.length > 0) soundFx.click();
  };

  const {
    floorF,
    x: burglarX,
    facing,
    posture,
    hackedRooms,
    activeRoomIndex,
    hackProgressPct,
    elapsedSec,
    exposure,
    keyFlash,
    hideSpotId,
    hasKeycard,
    cabinFloor,
    outcome,
    spottedId,
  } = snap;

  const activeRoomSpec = activeRoom(activeRoomIndex);
  const pctDelta = Math.round((session.effectConfig.outputMultiplier - 1) * 100);
  const strideWave = posture === 'WALKING' ? Math.sin(elapsedSec * 14) : 0;
  const exposureAlpha = clamp(exposure / STEALTH_EXPOSURE_GRACE_SEC, 0, 1);
  const hiddenKind: StealthHideKind | null = hideSpotId
    ? (session.hideSpots.find((h) => h.id === hideSpotId)?.kind ?? null)
    : null;

  const statusNode = (() => {
    if (outcome === 'CAUGHT') {
      return (
        <span className="font-semibold text-[#E8665A]">
          {dict.sabotageModal.statusCaught}
        </span>
      );
    }
    if (outcome === 'SUCCESS') {
      return (
        <span className="font-semibold text-[#44B872]">
          {dict.sabotageModal.statusSuccess}
        </span>
      );
    }
    if (keyFlash) {
      return (
        <span className="font-semibold text-[#E59A24]">
          {dict.sabotageModal.statusNeedKey}
        </span>
      );
    }
    switch (posture) {
      case 'HACKING':
        return (
          <span className="font-semibold text-[#44B872]">
            {interpolate(dict.sabotageModal.statusHacking, {
              pct: hackProgressPct,
            })}
          </span>
        );
      case 'HIDDEN':
        return (
          <span className="font-semibold text-[#44B872]">
            {dict.sabotageModal.statusHidden}
          </span>
        );
      case 'CLIMBING':
        return (
          <span className="font-semibold text-[#38BDF8]">
            {dict.sabotageModal.statusClimbing}
          </span>
        );
      case 'LIFT_WAIT':
      case 'LIFT_RIDE':
        return (
          <span className="font-semibold text-[#38BDF8]">
            {dict.sabotageModal.statusLift}
          </span>
        );
      case 'WALKING':
        return (
          <span className="font-semibold text-[#E59A24]">
            {dict.sabotageModal.statusWalking}
          </span>
        );
      default:
        return (
          <span className="font-semibold text-[#CBD5E1]">
            {dict.sabotageModal.statusExposed}
          </span>
        );
    }
  })();

  const renderHideSpot = (spot: StealthHideSpotSpec) => {
    const y = floorY(spot.floor);
    const active = hideSpotId === spot.id;
    const stroke = active ? '#44B872' : '#3A4757';
    const x = spot.x;
    return (
      <g key={spot.id}>
        {spot.kind === 'LOCKER' && (
          <g>
            <rect x={x - 11} y={y - 42} width={22} height={42} fill="#27313D" stroke={stroke} strokeWidth={active ? 2 : 1} />
            <line x1={x} y1={y - 42} x2={x} y2={y} stroke="#18202A" strokeWidth={1} />
            <line x1={x - 8} y1={y - 34} x2={x - 3} y2={y - 34} stroke="#0E141B" strokeWidth={1.5} />
            <line x1={x - 8} y1={y - 30} x2={x - 3} y2={y - 30} stroke="#0E141B" strokeWidth={1.5} />
            <line x1={x + 3} y1={y - 34} x2={x + 8} y2={y - 34} stroke="#0E141B" strokeWidth={1.5} />
            <line x1={x + 3} y1={y - 30} x2={x + 8} y2={y - 30} stroke="#0E141B" strokeWidth={1.5} />
          </g>
        )}
        {spot.kind === 'SHADOW' && (
          <rect x={x - 14} y={y - 44} width={28} height={44} fill="#06090D" stroke={stroke} strokeWidth={active ? 2 : 1} strokeDasharray="3 2" />
        )}
        {spot.kind === 'DESK' && (
          <g>
            <rect x={x - 15} y={y - 22} width={30} height={5} fill="#5B4630" stroke={stroke} strokeWidth={active ? 2 : 1} />
            <rect x={x - 14} y={y - 17} width={4} height={17} fill="#3A2E20" />
            <rect x={x + 10} y={y - 17} width={4} height={17} fill="#3A2E20" />
            <rect x={x - 6} y={y - 30} width={12} height={8} fill="#1E2733" stroke="#38BDF8" strokeWidth={0.8} />
          </g>
        )}
        {spot.kind === 'PLANT' && (
          <g>
            <rect x={x - 7} y={y - 12} width={14} height={12} fill="#6B4A32" stroke={stroke} strokeWidth={active ? 2 : 1} />
            <circle cx={x - 6} cy={y - 24} r={9} fill="#1F5A38" />
            <circle cx={x + 6} cy={y - 26} r={9} fill="#2A7A4B" />
            <circle cx={x} cy={y - 34} r={9} fill="#236B42" />
          </g>
        )}
      </g>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sabotage-minigame-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-1.5 sm:p-4"
    >
      <div className="retro-panel w-full max-w-[560px] max-h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#354150] bg-[#161C24] px-3 sm:px-5 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 shrink-0 text-[#E59A24]" />
              <h2
                id="sabotage-minigame-title"
                className="font-display text-sm sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(dict.sabotageModal.titlePrefix, {
                  name: regionTrans.name,
                  code: regionStatic.shortCode,
                })}
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-[#9FB0C2]">
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
              className="retro-button flex items-center gap-1.5 bg-[#2A1D20] px-3 py-2 text-xs font-semibold text-[#E8665A] hover:bg-[#3A2529] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>{dict.sabotageModal.retreatButton}</span>
            </button>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#26303D] bg-[#12161B] px-3 sm:px-5 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="text-[#8D9CAD]">
                {dict.sabotageModal.hackedRoomsLabel}{' '}
              </span>
              <span className="font-mono font-bold tabular-nums text-[#44B872]">
                {hackedRooms.length} / {session.roomsCount}
              </span>
            </span>
            {building.keycard && (
              <span
                title={dict.sabotageModal.keycardLabel}
                aria-label={dict.sabotageModal.keycardLabel}
                className={`inline-flex items-center gap-1 ${
                  hasKeycard ? 'text-[#38BDF8]' : 'text-[#5C6B7D]'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span className="font-semibold">
                  {dict.sabotageModal.keycardLabel}
                </span>
              </span>
            )}
            <span>
              <span className="text-[#8D9CAD]">
                {dict.sabotageModal.statusPrefix}{' '}
              </span>
              {statusNode}
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#E8665A]">
            {interpolate(dict.sabotageModal.caughtPenaltyLabel, {
              fine: formatCurrencyI18n(session.caughtFineCost, lang),
              months: session.lockdownMonths,
            })}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#1B222B] p-2 sm:p-4 space-y-2.5">
          {/* Room progress strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[10px] sm:text-[11px]">
            {session.rooms.map((r) => {
              const isDone = hackedRooms.includes(r.roomIndex);
              const isActive =
                posture === 'HACKING' && activeRoomIndex === r.roomIndex;
              return (
                <div
                  key={r.code}
                  className={`flex items-center justify-between gap-1 border px-2 py-1 font-mono tabular-nums ${
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

          {/* Building cross-section (tap / click only) */}
          <div
            className="relative mx-auto max-w-full border-2 border-[#354150] bg-[#0D1117] select-none"
            style={{ width: `min(100%, calc(56dvh * ${VW} / ${VH}))` }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="block h-auto w-full touch-manipulation cursor-pointer"
              role="img"
              aria-label={dict.sabotageModal.svgAriaLabel}
              onPointerDown={(e) => {
                e.preventDefault();
                handleTap(e);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <defs>
                <linearGradient id="bldWallGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#121820" />
                  <stop offset="100%" stopColor="#1A222D" />
                </linearGradient>
                <linearGradient id="beamDangerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0.16" />
                </linearGradient>
                <linearGradient id="beamWarnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E59A24" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#E59A24" stopOpacity="0.06" />
                </linearGradient>
              </defs>

              <rect x={0} y={0} width={VW} height={VH} fill="#0D1117" />
              <rect x={0} y={TOP - 6} width={VW} height={6} fill="#2A3544" />

              {/* Floors */}
              {Array.from({ length: floorsCount }, (_, f) => {
                const top = floorTop(f);
                const fy = floorY(f);
                return (
                  <g key={`floor_${f}`}>
                    <rect
                      x={0}
                      y={top}
                      width={VW}
                      height={FLOOR_H}
                      fill="url(#bldWallGrad)"
                      stroke="#2A3544"
                      strokeWidth={1}
                    />
                    <rect x={0} y={fy} width={VW} height={FLOOR_PAD} fill="#0B0F14" />
                    <line x1={0} y1={fy} x2={VW} y2={fy} stroke="#364354" strokeWidth={2} />
                    <text
                      x={VW - 8}
                      y={top + 12}
                      textAnchor="end"
                      fill="#5C6B7D"
                      fontSize={9}
                      fontWeight={700}
                    >
                      {f === 0 ? 'G' : f}
                    </text>
                  </g>
                );
              })}

              {/* Lift shaft with cabin */}
              <rect
                x={building.liftX - 14}
                y={TOP}
                width={28}
                height={floorsCount * FLOOR_H}
                fill="#0A0E13"
                stroke="#2A3544"
                strokeWidth={1}
              />
              {Array.from({ length: floorsCount }, (_, f) => (
                <g key={`lift_${f}`}>
                  <rect
                    x={building.liftX - 11}
                    y={floorY(f) - 40}
                    width={22}
                    height={40}
                    fill="#1B2430"
                    stroke="#38BDF8"
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <line
                    x1={building.liftX}
                    y1={floorY(f) - 40}
                    x2={building.liftX}
                    y2={floorY(f)}
                    stroke="#0E141B"
                    strokeWidth={1}
                  />
                  <text
                    x={building.liftX}
                    y={floorY(f) - 44}
                    textAnchor="middle"
                    fill="#38BDF8"
                    fontSize={8}
                    fontWeight={700}
                  >
                    ▲▼
                  </text>
                </g>
              ))}
              <rect
                x={building.liftX - 9}
                y={floorY(cabinFloor) - 38}
                width={18}
                height={36}
                fill="#2D3846"
                stroke="#E2E8F0"
                strokeWidth={1}
                opacity={0.9}
              />

              {/* Stairs */}
              {building.stairsX.map((sx, f) => {
                const yLow = floorY(f);
                const yHigh = floorY(f + 1);
                const half = 14;
                const stepCount = 6;
                return (
                  <g key={`stairs_${f}`}>
                    <polygon
                      points={`${sx - half},${yLow} ${sx + half},${yHigh} ${sx + half},${yHigh + 5} ${sx - half},${yLow + 5}`}
                      fill="#2A3544"
                      opacity={0.7}
                    />
                    {Array.from({ length: stepCount }, (_, i) => {
                      const t = i / (stepCount - 1);
                      const px = sx - half + t * 2 * half;
                      const py = yLow + t * (yHigh - yLow);
                      return (
                        <line
                          key={i}
                          x1={px}
                          y1={py}
                          x2={px + 4}
                          y2={py}
                          stroke="#5C6B7D"
                          strokeWidth={2}
                        />
                      );
                    })}
                    <text
                      x={sx}
                      y={yLow - 6}
                      textAnchor="middle"
                      fill="#9FB0C2"
                      fontSize={9}
                      fontWeight={700}
                    >
                      ▲
                    </text>
                    <text
                      x={sx}
                      y={yHigh + 16}
                      textAnchor="middle"
                      fill="#9FB0C2"
                      fontSize={9}
                      fontWeight={700}
                    >
                      ▼
                    </text>
                  </g>
                );
              })}

              {/* Keycard pickup */}
              {building.keycard && !hasKeycard && (
                <g
                  transform={`translate(${building.keycard.x}, ${floorY(building.keycard.floor) - 12})`}
                >
                  <circle r={11} fill="#0C2533" stroke="#38BDF8" strokeWidth={1.2} />
                  <rect x={-6} y={-4} width={12} height={8} fill="#38BDF8" />
                  <rect x={-6} y={-1} width={12} height={2} fill="#0C2533" />
                </g>
              )}

              {/* Hide spots */}
              {session.hideSpots.map(renderHideSpot)}

              {/* Server room doors */}
              {session.rooms.map((room) => {
                const isHacked = hackedRooms.includes(room.roomIndex);
                const isBeingHacked =
                  posture === 'HACKING' && activeRoomIndex === room.roomIndex;
                const fy = floorY(room.floor);
                const doorTop = fy - 46;
                const needsKey =
                  room.doorType === 'KEYCARD' && !hasKeycard && !isHacked;
                const frame = isHacked
                  ? '#2E9E5B'
                  : isBeingHacked
                    ? '#38BDF8'
                    : room.doorType === 'LOCKED'
                      ? '#D94436'
                      : room.doorType === 'KEYCARD'
                        ? '#38BDF8'
                        : '#E59A24';
                return (
                  <g key={room.code}>
                    <rect
                      x={room.doorX - 18}
                      y={doorTop}
                      width={36}
                      height={46}
                      fill="#11161D"
                      stroke={frame}
                      strokeWidth={1.6}
                    />
                    <rect
                      x={room.doorX - 14}
                      y={doorTop + 4}
                      width={isBeingHacked ? 8 : 28}
                      height={42}
                      fill={isHacked ? '#15241C' : '#1E2733'}
                      stroke="#324052"
                      strokeWidth={1}
                    />
                    {room.doorType === 'LOCKED' && !isHacked && (
                      <g>
                        <rect x={room.doorX - 5} y={doorTop + 22} width={10} height={8} fill="#D94436" />
                        <path
                          d={`M ${room.doorX - 3} ${doorTop + 22} v -4 a 3 3 0 0 1 6 0 v 4`}
                          fill="none"
                          stroke="#D94436"
                          strokeWidth={1.5}
                        />
                      </g>
                    )}
                    {room.doorType === 'KEYCARD' && !isHacked && (
                      <g opacity={needsKey ? 1 : 0.55}>
                        <rect x={room.doorX - 6} y={doorTop + 20} width={12} height={9} fill="#0C2533" stroke="#38BDF8" strokeWidth={1} />
                        <rect x={room.doorX - 6} y={doorTop + 23} width={12} height={2} fill="#38BDF8" />
                      </g>
                    )}
                    {room.doorType === 'OPEN' && !isHacked && (
                      <rect x={room.doorX - 8} y={doorTop + 18} width={16} height={12} fill="#0E141B" stroke={frame} strokeWidth={1} />
                    )}
                    <text
                      x={room.doorX}
                      y={doorTop - 4}
                      textAnchor="middle"
                      fill={isHacked ? '#44B872' : frame}
                      fontSize={8.5}
                      fontWeight={700}
                    >
                      {isHacked ? `${room.code} ✓` : room.code}
                    </text>
                  </g>
                );
              })}

              {/* Cameras and beams */}
              {session.cameras.map((cam) => {
                const state = evaluateCamera(cam, elapsedSec);
                const top = floorTop(cam.floor);
                const fy = floorY(cam.floor);
                const mountY = top + 8;
                const isSpotter = spottedId === cam.id;
                const dangerous = state.isBeamDangerous;
                const showBeam = dangerous || state.isWarning;
                let beam: string | null = null;
                if (showBeam) {
                  if (cam.kind === 'SWEEP' && state.isWarning) {
                    const c = cam.mountX + state.visualAngleSign * 36;
                    beam = `${cam.mountX},${mountY + 8} ${c - 14},${fy} ${c + 14},${fy}`;
                  } else if (cam.kind === 'SPOT') {
                    const c = (state.beamMinX + state.beamMaxX) / 2;
                    beam = `${c},${mountY + 6} ${state.beamMinX},${fy} ${state.beamMaxX},${fy}`;
                  } else {
                    beam = `${cam.mountX},${mountY + 8} ${state.beamMinX},${fy} ${state.beamMaxX},${fy}`;
                  }
                }
                const lampX =
                  cam.kind === 'SPOT'
                    ? (state.beamMinX + state.beamMaxX) / 2
                    : cam.mountX;
                return (
                  <g key={cam.id} pointerEvents="none">
                    {cam.kind === 'FIXED' && !showBeam && (
                      <polygon
                        points={`${cam.mountX},${mountY + 8} ${cam.mountX + cam.facing * cam.blindSpotHalfPx},${fy} ${cam.mountX + cam.facing * cam.rangePx},${fy}`}
                        fill="none"
                        stroke="#E59A24"
                        strokeOpacity={0.18}
                        strokeDasharray="3 3"
                      />
                    )}
                    {beam && (
                      <polygon
                        points={beam}
                        fill={dangerous ? 'url(#beamDangerGrad)' : 'url(#beamWarnGrad)'}
                        stroke={
                          isSpotter ? '#FF4444' : dangerous ? '#D94436' : '#E59A24'
                        }
                        strokeOpacity={isSpotter ? 1 : dangerous ? 0.6 : 0.4}
                        strokeWidth={isSpotter ? 2 : 1}
                      />
                    )}
                    {cam.kind === 'SPOT' && (
                      <line
                        x1={cam.mountX - cam.rangePx}
                        y1={mountY}
                        x2={cam.mountX + cam.rangePx}
                        y2={mountY}
                        stroke="#475569"
                        strokeWidth={2}
                      />
                    )}
                    {cam.kind !== 'SPOT' && (
                      <rect x={cam.mountX - 8} y={top + 1} width={16} height={6} fill="#2D3846" />
                    )}
                    <g
                      transform={`translate(${lampX}, ${mountY + 2}) rotate(${
                        cam.kind === 'SPOT' ? 0 : state.visualAngleSign * 34
                      })`}
                    >
                      <rect
                        x={-6}
                        y={-3}
                        width={12}
                        height={8}
                        fill={cam.kind === 'SPOT' ? '#6B5B2A' : '#475569'}
                        stroke="#CBD5E1"
                        strokeWidth={1}
                      />
                      <circle
                        cx={0}
                        cy={5}
                        r={2.6}
                        fill={
                          isSpotter
                            ? '#FF2E2E'
                            : dangerous
                              ? '#EF4444'
                              : state.isWarning
                                ? '#E59A24'
                                : '#475569'
                        }
                      />
                    </g>
                  </g>
                );
              })}

              {/* Guards */}
              {session.guards.map((guard) => {
                const g = evaluateGuard(guard, elapsedSec);
                const fy = floorY(guard.floor);
                const isSpotter = spottedId === guard.id;
                const sway = g.isPaused ? 0 : Math.sin(elapsedSec * 10);
                const coneEnd = g.x + g.facing * guard.visionPx;
                return (
                  <g key={guard.id} pointerEvents="none">
                    <polygon
                      points={`${g.x},${fy - 30} ${coneEnd},${fy} ${coneEnd},${fy - 44}`}
                      fill="#E59A24"
                      fillOpacity={isSpotter ? 0.4 : 0.2}
                      stroke="#E59A24"
                      strokeOpacity={0.5}
                      strokeWidth={0.8}
                    />
                    <g transform={`translate(${g.x}, ${fy}) scale(${g.facing}, 1)`}>
                      <line x1={-3} y1={-14} x2={-3 + sway * 4} y2={0} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                      <line x1={3} y1={-14} x2={3 - sway * 4} y2={0} stroke="#64748B" strokeWidth={3} strokeLinecap="round" />
                      <rect x={-6} y={-32} width={12} height={19} rx={2} fill="#7F1D1D" stroke="#F87171" strokeWidth={1} />
                      <circle cx={0} cy={-38} r={5.5} fill="#CBD5E1" />
                      <rect x={-6} y={-45} width={12} height={4} fill="#1E293B" />
                      <rect x={5} y={-27} width={8} height={2.5} fill="#0F172A" />
                    </g>
                  </g>
                );
              })}

              {/* Burglar */}
              {posture !== 'HACKING' && (
                (() => {
                  const inLift = posture === 'LIFT_RIDE';
                  const py = inLift ? floorY(cabinFloor) : floorY(floorF);
                  const hiddenInLocker = hiddenKind === 'LOCKER';
                  const opacity = hiddenInLocker
                    ? 0
                    : posture === 'HIDDEN'
                      ? 0.4
                      : inLift
                        ? 0.8
                        : 1;
                  return (
                    <g
                      pointerEvents="none"
                      transform={`translate(${burglarX}, ${py}) scale(${facing}, 1)`}
                      opacity={opacity}
                    >
                      <ellipse cx={0} cy={2} rx={11} ry={3} fill="#000" fillOpacity={0.55} />
                      <line x1={-3} y1={-13} x2={-3 + strideWave * 5} y2={0} stroke="#94A3B8" strokeWidth={3.5} strokeLinecap="round" />
                      <line x1={3} y1={-13} x2={3 - strideWave * 5} y2={0} stroke="#CBD5E1" strokeWidth={3.5} strokeLinecap="round" />
                      <polygon
                        points="-7,-34 8,-34 10,-12 -9,-12"
                        fill="#1E293B"
                        stroke={exposureAlpha > 0 ? '#EF4444' : '#E59A24'}
                        strokeWidth={1.4}
                      />
                      <rect x={4} y={-26} width={5} height={7} fill="#0F172A" stroke="#38BDF8" strokeWidth={0.8} />
                      <circle cx={0} cy={-40} r={6} fill="#334155" stroke="#E2E8F0" strokeWidth={1} />
                      <rect x={1} y={-42} width={5} height={3} fill="#44B872" />
                      {exposureAlpha > 0 && (
                        <circle
                          cx={0}
                          cy={-22}
                          r={20}
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth={2}
                          strokeOpacity={exposureAlpha}
                        />
                      )}
                    </g>
                  );
                })()
              )}
            </svg>

            {/* In-room terminal hacking overlay */}
            {posture === 'HACKING' && activeRoomSpec && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#090D12]/80 p-3">
                <div className="w-full max-w-[300px] border-2 border-[#2E9E5B] bg-[#0D1612] p-3 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-mono font-bold text-[#44B872] min-w-0">
                      <Terminal className="h-4 w-4 shrink-0" />
                      <span className="truncate">
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
                  <div className="border border-[#1E3A2B] bg-[#080F0C] p-2 font-mono text-[10px] space-y-1 text-[#44B872]">
                    {HACK_LOG_LINES.map((line, lineIdx) => {
                      const threshold = (lineIdx + 1) * 22;
                      return (
                        <div
                          key={line}
                          className={`flex items-center justify-between gap-2 ${
                            hackProgressPct >= threshold - 18
                              ? 'opacity-100'
                              : 'opacity-25'
                          }`}
                        >
                          <span className="truncate">&gt; {line}</span>
                          <span>{hackProgressPct >= threshold ? '[OK]' : '...'}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-2 w-full bg-[#09120E] border border-[#2E9E5B]/60 overflow-hidden">
                    <div
                      className="h-full bg-[#44B872]"
                      style={{ width: `${hackProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Instructions & legend */}
          {outcome === 'PLAYING' && (
            <details className="border border-[#2D3846] bg-[#13181F] px-3 py-2 text-[11px] text-[#9FB0C2]">
              <summary className="cursor-pointer select-none">
                {dict.sabotageModal.controlsHint}
              </summary>
              <ul className="mt-2 space-y-1">
                <li>{dict.sabotageModal.legendHide}</li>
                <li>{dict.sabotageModal.legendCameras}</li>
                <li>{dict.sabotageModal.legendDoors}</li>
              </ul>
            </details>
          )}

          {/* Outcome panels */}
          {outcome === 'SUCCESS' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#2E9E5B] bg-[#16291E] p-3">
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
                className="retro-button min-h-[44px] bg-[#2E9E5B] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#36B56A] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.sabotageModal.applyButton}
              </button>
            </div>
          )}

          {outcome === 'CAUGHT' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#D94436] bg-[#2D1819] p-3">
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
                className="retro-button min-h-[44px] bg-[#D94436] px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#E45749] whitespace-nowrap shrink-0 cursor-pointer"
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
