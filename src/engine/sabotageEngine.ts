/**
 * Government-system hacking & sabotage engine, plus deterministic 2D stealth corridor
 * geometry, camera sweep kinematics, and cover/detection evaluators for Crude Tycoon.
 */

import {
  DifficultyLevel,
  RegionId,
  SabotageEffectDirection,
  SabotageEffectSpec,
  SabotageMinigameSession,
  StealthCameraSpec,
  StealthCoverSpec,
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

export function buildStealthCorridorSession(params: {
  regionId: RegionId;
  targetOwnerCompanyId: string;
  direction: SabotageEffectDirection;
  difficulty: DifficultyLevel;
}): SabotageMinigameSession {
  const { regionId, targetOwnerCompanyId, direction, difficulty } = params;
  const roomsCount = getStealthRoomCount(difficulty);
  const bayWidth = 580;
  const startOffset = 180;

  const walkSpeedPxPerSec =
    difficulty === 'EASY' ? 168 : difficulty === 'STANDARD' ? 180 : 192;
  const cameraRangePx =
    difficulty === 'EASY' ? 145 : difficulty === 'STANDARD' ? 160 : 172;
  const baseCycleSeconds =
    difficulty === 'EASY' ? 4.8 : difficulty === 'STANDARD' ? 4.2 : 3.6;

  const rooms: StealthRoomSpec[] = [];
  const cameras: StealthCameraSpec[] = [];
  const covers: StealthCoverSpec[] = [];

  for (let i = 0; i < roomsCount; i++) {
    const bayStart = startOffset + i * bayWidth;
    const roomMeta = SERVER_ROOM_TITLES[i % SERVER_ROOM_TITLES.length];
    const mountX = bayStart + 275;
    const blindSpotHalfPx = 30;

    // Approach cover alcove strictly clear of camera's left cone (max left reach: 275 - 172 = 103)
    covers.push({
      id: `cover_pre_${i}`,
      centerX: bayStart + 46,
      halfWidth: 32,
    });

    // Blind-spot wall pillar directly beneath the ceiling camera mount
    covers.push({
      id: `cover_cam_${i}`,
      centerX: mountX,
      halfWidth: blindSpotHalfPx,
    });

    // Server room door positioned inside the right sweep zone of the camera
    rooms.push({
      roomIndex: i,
      code: roomMeta.code,
      label: roomMeta.label,
      doorX: bayStart + 410,
      doorHalfWidth: 40,
    });

    cameras.push({
      id: `cam_${i}`,
      mountX,
      rangePx: cameraRangePx,
      blindSpotHalfPx,
      cycleSeconds: Number(
        (baseCycleSeconds - (i % 2 === 1 ? 0.15 : 0)).toFixed(2)
      ),
      initialPhaseOffset: Number(((i * 0.27) % 1).toFixed(2)),
    });
  }

  return {
    targetScope: 'CONCESSION',
    regionId,
    targetOwnerCompanyId,
    direction,
    difficulty,
    upfrontCost: SABOTAGE_MINIGAME_COST,
    caughtFineCost: SABOTAGE_CAUGHT_FINE,
    lockdownMonths: SABOTAGE_LOCKDOWN_MONTHS,
    corridorLengthPx: startOffset + roomsCount * bayWidth + 100,
    walkSpeedPxPerSec,
    roomsCount,
    hackDurationMs: 1450,
    rooms,
    cameras,
    covers,
    effectConfig: getSabotageEffectConfig(difficulty, direction),
  };
}

export type CameraLookDirection =
  | 'LEFT'
  | 'TURNING_RIGHT'
  | 'RIGHT'
  | 'TURNING_LEFT';

export interface CameraSweepEvaluation {
  direction: CameraLookDirection;
  isBeamDangerous: boolean;
  beamMinX: number;
  beamMaxX: number;
  /** -1 for left, +1 for right, interpolated during turns for smooth visual sweep */
  visualAngleSign: number;
}

/**
 * Evaluates a ceiling camera's current sweep phase at elapsedSec.
 * Phase breakdown per cycle:
 *   0.00..0.36 -> Active LEFT cone (dangerous)
 *   0.36..0.50 -> Turning LEFT->RIGHT (amber transition, safe)
 *   0.50..0.86 -> Active RIGHT cone (dangerous)
 *   0.86..1.00 -> Turning RIGHT->LEFT (amber transition, safe)
 */
export function evaluateCameraSweep(
  cam: StealthCameraSpec,
  elapsedSec: number
): CameraSweepEvaluation {
  const raw = (elapsedSec / cam.cycleSeconds + cam.initialPhaseOffset) % 1;
  const u = raw < 0 ? raw + 1 : raw;

  if (u < 0.36) {
    return {
      direction: 'LEFT',
      isBeamDangerous: true,
      beamMinX: cam.mountX - cam.rangePx,
      beamMaxX: cam.mountX - cam.blindSpotHalfPx,
      visualAngleSign: -1,
    };
  }
  if (u < 0.5) {
    const t = (u - 0.36) / 0.14;
    return {
      direction: 'TURNING_RIGHT',
      isBeamDangerous: false,
      beamMinX: cam.mountX - cam.blindSpotHalfPx,
      beamMaxX: cam.mountX + cam.blindSpotHalfPx,
      visualAngleSign: -1 + t * 2,
    };
  }
  if (u < 0.86) {
    return {
      direction: 'RIGHT',
      isBeamDangerous: true,
      beamMinX: cam.mountX + cam.blindSpotHalfPx,
      beamMaxX: cam.mountX + cam.rangePx,
      visualAngleSign: 1,
    };
  }
  const t = (u - 0.86) / 0.14;
  return {
    direction: 'TURNING_LEFT',
    isBeamDangerous: false,
    beamMinX: cam.mountX - cam.blindSpotHalfPx,
    beamMaxX: cam.mountX + cam.blindSpotHalfPx,
    visualAngleSign: 1 - t * 2,
  };
}

export function findUnhackedDoorAtX(
  rooms: StealthRoomSpec[],
  hackedRoomIndices: number[],
  x: number
): StealthRoomSpec | null {
  for (const room of rooms) {
    if (hackedRoomIndices.includes(room.roomIndex)) continue;
    if (Math.abs(x - room.doorX) <= room.doorHalfWidth) {
      return room;
    }
  }
  return null;
}

export function isPositionInWallCover(
  covers: StealthCoverSpec[],
  cameras: StealthCameraSpec[],
  x: number
): boolean {
  for (const cov of covers) {
    if (Math.abs(x - cov.centerX) <= cov.halfWidth) {
      return true;
    }
  }
  for (const cam of cameras) {
    if (Math.abs(x - cam.mountX) <= cam.blindSpotHalfPx) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether the burglar at horizontal position x is spotted by any camera.
 * Inside a room (HACKING_ROOM or ROOM_READY_TO_EXIT) is always invisible.
 * While hugging the wall (WALL_HUG) inside a shadow cover pillar or camera blind spot,
 * the burglar is hidden even if a beam sweeps nearby.
 * Walking upright (WALKING) or standing exposed outside cover in an active red cone triggers detection.
 */
export function detectBurglarSpotted(params: {
  x: number;
  posture: 'WALKING' | 'WALL_HUG' | 'HACKING_ROOM' | 'ROOM_READY_TO_EXIT';
  cameras: StealthCameraSpec[];
  covers: StealthCoverSpec[];
  elapsedSec: number;
  burglarHalfHitboxPx?: number;
}): StealthCameraSpec | null {
  const {
    x,
    posture,
    cameras,
    covers,
    elapsedSec,
    burglarHalfHitboxPx = 10,
  } = params;

  if (posture === 'HACKING_ROOM' || posture === 'ROOM_READY_TO_EXIT') {
    return null;
  }

  if (
    posture === 'WALL_HUG' &&
    isPositionInWallCover(covers, cameras, x)
  ) {
    return null;
  }

  for (const cam of cameras) {
    const evalState = evaluateCameraSweep(cam, elapsedSec);
    if (!evalState.isBeamDangerous) continue;
    if (
      x + burglarHalfHitboxPx >= evalState.beamMinX &&
      x - burglarHalfHitboxPx <= evalState.beamMaxX
    ) {
      return cam;
    }
  }

  return null;
}
