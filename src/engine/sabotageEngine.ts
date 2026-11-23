/**
 * Government-system hacking & sabotage engine, plus the deterministic multi-floor stealth
 * building generator, camera/guard kinematics, hide-spot protection rules and route planner
 * for the Crude Tycoon intrusion minigame.
 */

import {
  DifficultyLevel,
  RegionId,
  SabotageEffectDirection,
  SabotageEffectSpec,
  SabotageMinigameSession,
  StealthBuildingSpec,
  StealthCameraKind,
  StealthCameraSpec,
  StealthDoorType,
  StealthGuardSpec,
  StealthHideKind,
  StealthHideSpotSpec,
  StealthRoomSpec,
} from './gameTypes';

export const SABOTAGE_MINIGAME_COST = 75000;
export const SABOTAGE_CAUGHT_FINE = 120000;
export const SABOTAGE_CONTRACTOR_COST = 310000;
export const SABOTAGE_LOCKDOWN_MONTHS = 3;

export function getSabotageContractorCost(difficulty: DifficultyLevel): number {
  switch (difficulty) {
    case 'EASY':
      return 240000;
    case 'STANDARD':
      return 310000;
    case 'HARD':
      return 460000;
  }
}

const SERVER_ROOM_TITLES = [
  { code: 'SRV-A1', label: 'Kvóta-nyilvántartó terminál' },
  { code: 'SRV-B2', label: 'Vám- és ellenőrző csomópont' },
  { code: 'SRV-C3', label: 'Bányajáradék-adatbázis' },
  { code: 'SRV-D4', label: 'Környezeti napló-szerver' },
  { code: 'SRV-E5', label: 'Központi főkönyvi kapu' },
];

export function getStealthRoomCount(difficulty: DifficultyLevel): number {
  switch (difficulty) {
    case 'EASY':
      return 3;
    case 'STANDARD':
      return 4;
    case 'HARD':
      return 5;
  }
}

export function getStealthFloorCount(difficulty: DifficultyLevel): number {
  switch (difficulty) {
    case 'EASY':
      return 3;
    case 'STANDARD':
      return 4;
    case 'HARD':
      return 5;
  }
}

export function getSabotageEffectConfig(
  difficulty: DifficultyLevel,
  direction: SabotageEffectDirection
): SabotageEffectSpec {
  if (direction === 'BOOST') {
    switch (difficulty) {
      case 'EASY':
        return {
          outputMultiplier: 1.35,
          durationMonths: 5,
          ownerFine: 0,
          label: 'Kormányzati kvótalazítás (+35%)',
        };
      case 'STANDARD':
        return {
          outputMultiplier: 1.25,
          durationMonths: 4,
          ownerFine: 0,
          label: 'Kormányzati kvótalazítás (+25%)',
        };
      case 'HARD':
        return {
          outputMultiplier: 1.18,
          durationMonths: 3,
          ownerFine: 0,
          label: 'Kormányzati kvótalazítás (+18%)',
        };
    }
  }

  switch (difficulty) {
    case 'EASY':
      return {
        outputMultiplier: 0.6,
        durationMonths: 4,
        ownerFine: 180000,
        label: 'Hatósági lefojtás és bírság (-40%)',
      };
    case 'STANDARD':
      return {
        outputMultiplier: 0.65,
        durationMonths: 3,
        ownerFine: 140000,
        label: 'Hatósági lefojtás és bírság (-35%)',
      };
    case 'HARD':
      return {
        outputMultiplier: 0.72,
        durationMonths: 3,
        ownerFine: 110000,
        label: 'Hatósági lefojtás és bírság (-28%)',
      };
  }
}

/* ------------------------------------------------------------------ */
/* Building geometry                                                   */
/* ------------------------------------------------------------------ */

export const STEALTH_BUILDING_WIDTH = 360;
export const STEALTH_WALK_MIN_X = 24;
export const STEALTH_WALK_MAX_X = 336;
export const STEALTH_START_X = 92;
export const STEALTH_LIFT_X = 46;
export const STEALTH_STAIRS_CLIMB_SEC = 1.5;
export const STEALTH_LIFT_WAIT_SEC = 1.2;
export const STEALTH_LIFT_SEC_PER_FLOOR = 0.6;
export const STEALTH_EXPOSURE_GRACE_SEC = 0.3;
export const STEALTH_KEYCARD_PICKUP_RADIUS = 16;

const DOOR_HALF_WIDTH = 22;
const HIDE_HALF_WIDTH = 15;
const HIDE_SLOTS = [76, 90, 104, 118, 132, 146, 160, 174, 188, 202, 216, 230, 244, 258, 272, 286];
const HIDE_CLEARANCE_DOOR = DOOR_HALF_WIDTH + 12;
const HIDE_CLEARANCE_CONNECTOR = 30;

export function getStairsXForFloorPair(lowerFloor: number): number {
  return lowerFloor % 2 === 0 ? 314 : 262;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getDoorTypes(difficulty: DifficultyLevel): StealthDoorType[] {
  switch (difficulty) {
    case 'EASY':
      return ['OPEN', 'LOCKED', 'OPEN'];
    case 'STANDARD':
      return ['OPEN', 'LOCKED', 'KEYCARD', 'OPEN'];
    case 'HARD':
      return ['LOCKED', 'KEYCARD', 'OPEN', 'LOCKED', 'KEYCARD'];
  }
}

export function getDoorHackDurationMs(type: StealthDoorType): number {
  switch (type) {
    case 'OPEN':
      return 1300;
    case 'LOCKED':
      return 2400;
    case 'KEYCARD':
      return 1000;
  }
}

export function buildStealthBuildingSession(params: {
  regionId: RegionId;
  targetOwnerCompanyId: string;
  direction: SabotageEffectDirection;
  difficulty: DifficultyLevel;
  seed?: number;
}): SabotageMinigameSession {
  const { regionId, targetOwnerCompanyId, direction, difficulty } = params;
  const rng = mulberry32(params.seed ?? Math.floor(Math.random() * 4294967296));
  const roomsCount = getStealthRoomCount(difficulty);
  const floorsCount = getStealthFloorCount(difficulty);
  const di = difficulty === 'EASY' ? 0 : difficulty === 'STANDARD' ? 1 : 2;

  const walkSpeedPxPerSec = [82, 90, 98][di];
  const sweepRange = [80, 90, 100][di];
  const sweepCycle = [4.8, 4.2, 3.6][di];
  const fixedRange = [100, 110, 120][di];
  const fixedCycle = [5.2, 4.6, 4.0][di];
  const spotRange = [70, 76, 82][di];
  const spotCycle = [7.5, 6.8, 6.0][di];

  const stairsX: number[] = [];
  for (let f = 0; f < floorsCount - 1; f++) stairsX.push(getStairsXForFloorPair(f));

  // Server rooms live on floors 1..N-1, spread round-robin so no floor holds more than two.
  const doorTypes = shuffle(getDoorTypes(difficulty), rng);
  const roomsPerFloor: number[] = new Array(floorsCount).fill(0);
  const rooms: StealthRoomSpec[] = [];
  for (let i = 0; i < roomsCount; i++) {
    const floor = 1 + (i % (floorsCount - 1));
    roomsPerFloor[floor] += 1;
    const meta = SERVER_ROOM_TITLES[i % SERVER_ROOM_TITLES.length];
    rooms.push({
      roomIndex: i,
      code: meta.code,
      label: meta.label,
      floor,
      doorX: 0,
      doorHalfWidth: DOOR_HALF_WIDTH,
      doorType: doorTypes[i],
      hackDurationMs: getDoorHackDurationMs(doorTypes[i]),
    });
  }
  for (let floor = 1; floor < floorsCount; floor++) {
    const onFloor = rooms.filter((r) => r.floor === floor);
    if (onFloor.length === 1) {
      onFloor[0].doorX = [128, 160, 192][Math.floor(rng() * 3)];
    } else if (onFloor.length >= 2) {
      const swap = rng() < 0.5;
      onFloor[0].doorX = swap ? 190 : 112;
      onFloor[1].doorX = swap ? 112 : 190;
    }
  }

  const needsKeycard = rooms.some((r) => r.doorType === 'KEYCARD');
  const keycard = needsKeycard
    ? { floor: rng() < 0.5 ? 0 : 1, x: 232 }
    : null;

  // Cameras
  const cameras: StealthCameraSpec[] = [];
  const kindOrder: StealthCameraKind[] = ['SWEEP', 'SPOT', 'FIXED'];
  const kindOffset = Math.floor(rng() * 3);
  const addCamera = (floor: number, kind: StealthCameraKind, mountX: number) => {
    const idx = cameras.length;
    cameras.push({
      id: `cam_${idx}`,
      kind,
      floor,
      mountX,
      rangePx:
        kind === 'SWEEP' ? sweepRange : kind === 'FIXED' ? fixedRange : spotRange,
      blindSpotHalfPx: kind === 'SWEEP' ? 24 : kind === 'FIXED' ? 14 : 0,
      cycleSeconds: Number(
        (kind === 'SWEEP'
          ? sweepCycle - (idx % 2 === 1 ? 0.15 : 0)
          : kind === 'FIXED'
            ? fixedCycle
            : spotCycle
        ).toFixed(2)
      ),
      initialPhaseOffset: Number(((idx * 0.27 + rng() * 0.2) % 1).toFixed(2)),
      facing: mountX < STEALTH_BUILDING_WIDTH / 2 ? 1 : -1,
    });
  };
  // The ground-floor camera only watches the right side so the start and lift stay safe.
  addCamera(0, 'FIXED', 170);
  cameras[0].facing = 1;
  const mountChoices = [140, 180, 220];
  for (let floor = 1; floor < floorsCount; floor++) {
    const first = mountChoices[Math.floor(rng() * mountChoices.length)];
    addCamera(floor, kindOrder[(floor + kindOffset) % 3], first);
    if (difficulty === 'HARD' && floor >= 2 && floor % 2 === 0) {
      addCamera(
        floor,
        kindOrder[(floor + kindOffset + 1) % 3],
        first <= 180 ? 250 : 120
      );
    }
  }

  // Guards patrol floors above the lobby.
  const guards: StealthGuardSpec[] = [];
  const guardFloors: number[] = [];
  if (difficulty !== 'EASY') {
    const candidates = shuffle(
      Array.from({ length: floorsCount - 1 }, (_, i) => i + 1),
      rng
    );
    guardFloors.push(...candidates.slice(0, difficulty === 'HARD' ? 2 : 1));
  }
  guardFloors.forEach((floor, i) => {
    guards.push({
      id: `guard_${i}`,
      floor,
      patrolMinX: 104,
      patrolMaxX: 250,
      speedPxPerSec: [0, 34, 38][di],
      pauseSeconds: 2.0,
      visionPx: 62,
      initialPhaseOffset: Number((rng()).toFixed(2)),
    });
  });

  // Hide spots: two per floor, different kinds, kept clear of doors and connectors.
  const hideSpots: StealthHideSpotSpec[] = [];
  const kindRotation = shuffle<StealthHideKind>(
    ['LOCKER', 'SHADOW', 'DESK', 'PLANT'],
    rng
  );
  let kindCursor = 0;
  const nextKind = (guardSafe: boolean): StealthHideKind => {
    for (let n = 0; n < kindRotation.length; n++) {
      const kind = kindRotation[kindCursor++ % kindRotation.length];
      if (!guardSafe || kind !== 'SHADOW') return kind;
    }
    return 'LOCKER';
  };
  for (let floor = 0; floor < floorsCount; floor++) {
    const blocked: Array<{ x: number; clearance: number }> = [
      { x: STEALTH_LIFT_X, clearance: HIDE_CLEARANCE_CONNECTOR },
    ];
    rooms
      .filter((r) => r.floor === floor)
      .forEach((r) => blocked.push({ x: r.doorX, clearance: HIDE_CLEARANCE_DOOR }));
    if (floor < floorsCount - 1) {
      blocked.push({ x: stairsX[floor], clearance: HIDE_CLEARANCE_CONNECTOR });
    }
    if (floor > 0) {
      blocked.push({ x: stairsX[floor - 1], clearance: HIDE_CLEARANCE_CONNECTOR });
    }
    if (keycard && keycard.floor === floor) {
      blocked.push({ x: keycard.x, clearance: HIDE_CLEARANCE_DOOR });
    }
    const free = shuffle(
      HIDE_SLOTS.filter((s) => blocked.every((b) => Math.abs(b.x - s) >= b.clearance)),
      rng
    );
    if (free.length === 0) continue;
    const first = free[0];
    const second = free.find((s) => Math.abs(s - first) >= 60);
    const guardSafe = guardFloors.includes(floor);
    const kinds: StealthHideKind[] = [nextKind(guardSafe)];
    const placed = second === undefined ? [first] : [first, second];
    let secondKind = nextKind(false);
    if (secondKind === kinds[0]) secondKind = nextKind(false);
    if (placed.length > 1) kinds.push(secondKind);
    placed.forEach((x, i) => {
      hideSpots.push({
        id: `hide_${floor}_${i}`,
        kind: kinds[i],
        floor,
        x,
        halfWidth: HIDE_HALF_WIDTH,
      });
    });
  }

  const building: StealthBuildingSpec = {
    floorsCount,
    width: STEALTH_BUILDING_WIDTH,
    liftX: STEALTH_LIFT_X,
    stairsX,
    keycard,
  };

  return {
    targetScope: 'CONCESSION',
    regionId,
    targetOwnerCompanyId,
    direction,
    difficulty,
    upfrontCost: SABOTAGE_MINIGAME_COST,
    caughtFineCost: SABOTAGE_CAUGHT_FINE,
    lockdownMonths: SABOTAGE_LOCKDOWN_MONTHS,
    walkSpeedPxPerSec,
    roomsCount,
    building,
    rooms,
    cameras,
    hideSpots,
    guards,
    effectConfig: getSabotageEffectConfig(difficulty, direction),
  };
}

/* ------------------------------------------------------------------ */
/* Cameras                                                             */
/* ------------------------------------------------------------------ */

export type CameraLookDirection =
  | 'LEFT'
  | 'TURNING_RIGHT'
  | 'RIGHT'
  | 'TURNING_LEFT';

export interface CameraEvaluation {
  isBeamDangerous: boolean;
  /** Beam about to switch on (FIXED) or camera turning (SWEEP). */
  isWarning: boolean;
  beamMinX: number;
  beamMaxX: number;
  /** -1 for left, +1 for right, interpolated during turns for smooth visual sweep */
  visualAngleSign: number;
}

const SPOT_HALF_WIDTH = 16;

function cyclePhase(cam: StealthCameraSpec, elapsedSec: number): number {
  const raw = (elapsedSec / cam.cycleSeconds + cam.initialPhaseOffset) % 1;
  return raw < 0 ? raw + 1 : raw;
}

/**
 * SWEEP phases per cycle:
 *   0.00..0.36 active LEFT cone, 0.36..0.50 turning (safe), 0.50..0.86 active RIGHT cone,
 *   0.86..1.00 turning (safe). The spot directly under the mount is always a blind spot.
 * FIXED phases: 0.00..0.50 beam on, 0.50..0.85 off, 0.85..1.00 warning flash.
 * SPOT: a lamp slides back and forth across the whole range and is always dangerous.
 */
export function evaluateCamera(
  cam: StealthCameraSpec,
  elapsedSec: number
): CameraEvaluation {
  const u = cyclePhase(cam, elapsedSec);

  if (cam.kind === 'FIXED') {
    const near = cam.mountX + cam.facing * cam.blindSpotHalfPx;
    const far = cam.mountX + cam.facing * cam.rangePx;
    const beamMinX = Math.min(near, far);
    const beamMaxX = Math.max(near, far);
    return {
      isBeamDangerous: u < 0.5,
      isWarning: u >= 0.85,
      beamMinX,
      beamMaxX,
      visualAngleSign: cam.facing,
    };
  }

  if (cam.kind === 'SPOT') {
    const p = u < 0.5 ? u * 2 : 2 - u * 2;
    const center = cam.mountX - cam.rangePx + p * 2 * cam.rangePx;
    return {
      isBeamDangerous: true,
      isWarning: false,
      beamMinX: center - SPOT_HALF_WIDTH,
      beamMaxX: center + SPOT_HALF_WIDTH,
      visualAngleSign: (center - cam.mountX) / cam.rangePx,
    };
  }

  if (u < 0.36) {
    return {
      isBeamDangerous: true,
      isWarning: false,
      beamMinX: cam.mountX - cam.rangePx,
      beamMaxX: cam.mountX - cam.blindSpotHalfPx,
      visualAngleSign: -1,
    };
  }
  if (u < 0.5) {
    return {
      isBeamDangerous: false,
      isWarning: true,
      beamMinX: cam.mountX - cam.blindSpotHalfPx,
      beamMaxX: cam.mountX + cam.blindSpotHalfPx,
      visualAngleSign: -1 + ((u - 0.36) / 0.14) * 2,
    };
  }
  if (u < 0.86) {
    return {
      isBeamDangerous: true,
      isWarning: false,
      beamMinX: cam.mountX + cam.blindSpotHalfPx,
      beamMaxX: cam.mountX + cam.rangePx,
      visualAngleSign: 1,
    };
  }
  return {
    isBeamDangerous: false,
    isWarning: true,
    beamMinX: cam.mountX - cam.blindSpotHalfPx,
    beamMaxX: cam.mountX + cam.blindSpotHalfPx,
    visualAngleSign: 1 - ((u - 0.86) / 0.14) * 2,
  };
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

export interface GuardState {
  x: number;
  facing: 1 | -1;
  isPaused: boolean;
}

export function evaluateGuard(guard: StealthGuardSpec, elapsedSec: number): GuardState {
  const len = guard.patrolMaxX - guard.patrolMinX;
  const moveT = len / guard.speedPxPerSec;
  const period = 2 * (moveT + guard.pauseSeconds);
  const raw = (elapsedSec + guard.initialPhaseOffset * period) % period;
  const t = raw < 0 ? raw + period : raw;

  if (t < moveT) {
    return { x: guard.patrolMinX + t * guard.speedPxPerSec, facing: 1, isPaused: false };
  }
  if (t < moveT + guard.pauseSeconds) {
    return { x: guard.patrolMaxX, facing: 1, isPaused: true };
  }
  if (t < 2 * moveT + guard.pauseSeconds) {
    const p = t - moveT - guard.pauseSeconds;
    return { x: guard.patrolMaxX - p * guard.speedPxPerSec, facing: -1, isPaused: false };
  }
  return { x: guard.patrolMinX, facing: -1, isPaused: true };
}

/* ------------------------------------------------------------------ */
/* Hiding & detection                                                  */
/* ------------------------------------------------------------------ */

export type StealthThreat = StealthCameraKind | 'GUARD';

/** What each hiding place conceals the intruder from. */
export function getHideProtections(kind: StealthHideKind): StealthThreat[] {
  switch (kind) {
    case 'LOCKER':
      return ['SWEEP', 'FIXED', 'SPOT', 'GUARD'];
    case 'SHADOW':
      return ['SWEEP', 'FIXED', 'SPOT'];
    case 'DESK':
      return ['FIXED', 'GUARD'];
    case 'PLANT':
      return ['SWEEP', 'GUARD'];
  }
}

export function findHideSpotAt(
  spots: StealthHideSpotSpec[],
  floor: number,
  x: number
): StealthHideSpotSpec | null {
  return (
    spots.find((s) => s.floor === floor && Math.abs(x - s.x) <= s.halfWidth) ?? null
  );
}

export interface PlayerSight {
  floor: number;
  x: number;
  hideSpot: StealthHideSpotSpec | null;
  /** Inside a room terminal or lift cabin: nobody can see the intruder. */
  isConcealed: boolean;
}

/** Returns the id of the camera or guard currently spotting the player, if any. */
export function detectPlayerSpotted(params: {
  session: SabotageMinigameSession;
  player: PlayerSight;
  elapsedSec: number;
  playerHalfHitboxPx?: number;
}): string | null {
  const { session, player, elapsedSec, playerHalfHitboxPx = 8 } = params;
  if (player.isConcealed) return null;
  const protections = player.hideSpot ? getHideProtections(player.hideSpot.kind) : [];

  for (const cam of session.cameras) {
    if (cam.floor !== player.floor) continue;
    if (protections.includes(cam.kind)) continue;
    const state = evaluateCamera(cam, elapsedSec);
    if (!state.isBeamDangerous) continue;
    if (
      player.x + playerHalfHitboxPx >= state.beamMinX &&
      player.x - playerHalfHitboxPx <= state.beamMaxX
    ) {
      return cam.id;
    }
  }

  if (!protections.includes('GUARD')) {
    for (const guard of session.guards) {
      if (guard.floor !== player.floor) continue;
      const g = evaluateGuard(guard, elapsedSec);
      const ahead = (player.x - g.x) * g.facing;
      if (ahead >= -playerHalfHitboxPx && ahead <= guard.visionPx) return guard.id;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Route planner (tap-to-move)                                         */
/* ------------------------------------------------------------------ */

export type RouteStep =
  | { type: 'WALK'; x: number }
  | { type: 'STAIRS'; toFloor: number }
  | { type: 'LIFT'; toFloor: number };

export type RouteMode = 'AUTO' | 'LIFT' | 'STAIRS';

/**
 * Builds the walk/climb steps from `from` to `target`. AUTO uses the lift for trips of two or
 * more floors and the stairs for single-floor hops.
 */
export function planRoute(
  building: StealthBuildingSpec,
  from: { floor: number; x: number },
  target: { floor: number; x: number },
  mode: RouteMode = 'AUTO'
): RouteStep[] {
  const steps: RouteStep[] = [];
  let floor = from.floor;
  let x = from.x;

  while (floor !== target.floor) {
    const dir = target.floor > floor ? 1 : -1;
    const remaining = Math.abs(target.floor - floor);
    const useLift = mode === 'LIFT' || (mode === 'AUTO' && remaining >= 2);

    if (useLift) {
      if (Math.abs(x - building.liftX) > 1) steps.push({ type: 'WALK', x: building.liftX });
      steps.push({ type: 'LIFT', toFloor: target.floor });
      floor = target.floor;
      x = building.liftX;
    } else {
      const stairsX = building.stairsX[dir > 0 ? floor : floor - 1];
      if (Math.abs(x - stairsX) > 1) steps.push({ type: 'WALK', x: stairsX });
      steps.push({ type: 'STAIRS', toFloor: floor + dir });
      floor += dir;
      x = stairsX;
    }
  }

  if (Math.abs(x - target.x) > 1) steps.push({ type: 'WALK', x: target.x });
  return steps;
}
