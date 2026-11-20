/**
 * Difficulty-scaled configuration, navigable strait generator, and chemical core-sample
 * geological puzzle builder for Tanker Rescue and Core Sample Analysis operations.
 */

import { REGIONS_BY_ID } from '../data/regionsData';
import { extractEventTemplateId } from '../i18n';
import {
  CoreSampleLayerSpec,
  CoreSampleMinigameSession,
  DifficultyLevel,
  RegionId,
  TankerCurrentZoneSpec,
  TankerHazardSpec,
  TankerMinigameSession,
} from './gameTypes';

export const TANKER_ELIGIBLE_EVENT_PREFIXES = [
  'hurricane_halt',
  'storm_disruption',
  'tanker_oil_spill',
] as const;

export const STORM_BASE_RESCUE_STAKE = 65000;

export function isTankerRescueEligibleEventId(eventId: string): boolean {
  return TANKER_ELIGIBLE_EVENT_PREFIXES.some((prefix) =>
    eventId.startsWith(prefix)
  );
}

export interface TankerRescueDifficultyConfig {
  stakeBaseCost: number;
  baseEventRepairCost: number;
  failMultiplier: number;
  failExtraPenaltyCost: number;
  failTotalCrisisCost: number;
  recoveryRatio: number;
  externalFleetFee: number;
  externalRecoveryRatio: number;
  timeLimitSec: number;
  maxHullHp: number;
  reefCount: number;
  debrisCount: number;
  currentForce: number;
  corridorHalfWidth: number;
}

export function getTankerRescueConfig(
  difficulty: DifficultyLevel,
  baseEventRepairCost: number,
  isStormOnly: boolean
): TankerRescueDifficultyConfig {
  const stakeBaseCost =
    baseEventRepairCost > 0 ? baseEventRepairCost : STORM_BASE_RESCUE_STAKE;

  const failMultiplier =
    difficulty === 'EASY' ? 1.5 : difficulty === 'HARD' ? 2.5 : 2.0;

  // For events where baseEventRepairCost was already billed (e.g. hurricane/oil spill),
  // failing charges (failMultiplier - 1) extra so total paid = failMultiplier * stakeBase.
  // For storm_disruption ($0 billed initially), failing charges the full failMultiplier * stakeBase.
  const failTotalCrisisCost = Math.round(stakeBaseCost * failMultiplier);
  const failExtraPenaltyCost = isStormOnly
    ? failTotalCrisisCost
    : Math.max(0, failTotalCrisisCost - baseEventRepairCost);

  const recoveryRatio =
    difficulty === 'EASY' ? 0.6 : difficulty === 'HARD' ? 0.4 : 0.5;

  // Elevated fee for external marine rescue fleet scaled by difficulty so manual rescue stays rewarding
  const externalFleetFee =
    difficulty === 'EASY' ? 85000 : difficulty === 'HARD' ? 240000 : 135000;
  const externalRecoveryRatio =
    difficulty === 'EASY' ? 0.5 : difficulty === 'HARD' ? 0.3 : 0.4;

  const timeLimitSec =
    difficulty === 'EASY' ? 40 : difficulty === 'HARD' ? 30 : 35;
  const maxHullHp = difficulty === 'EASY' ? 4 : difficulty === 'HARD' ? 2 : 3;
  const reefCount = difficulty === 'EASY' ? 7 : difficulty === 'HARD' ? 13 : 10;
  const debrisCount = difficulty === 'EASY' ? 1 : difficulty === 'HARD' ? 3 : 2;
  const currentForce =
    difficulty === 'EASY' ? 22 : difficulty === 'HARD' ? 46 : 34;
  const corridorHalfWidth =
    difficulty === 'EASY' ? 66 : difficulty === 'HARD' ? 49 : 56;

  return {
    stakeBaseCost,
    baseEventRepairCost,
    failMultiplier,
    failExtraPenaltyCost,
    failTotalCrisisCost,
    recoveryRatio,
    externalFleetFee,
    externalRecoveryRatio,
    timeLimitSec,
    maxHullHp,
    reefCount,
    debrisCount,
    currentForce,
    corridorHalfWidth,
  };
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distToSafeChannel(
  px: number,
  py: number,
  waypoints: Array<{ x: number; y: number }>
): number {
  let minD = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = pointToSegmentDist(
      px,
      py,
      waypoints[i].x,
      waypoints[i].y,
      waypoints[i + 1].x,
      waypoints[i + 1].y
    );
    if (d < minD) minD = d;
  }
  return minD;
}

export function buildTankerNavigationSession(params: {
  regionId: RegionId;
  eventId: string;
  eventTitle: string;
  baseEventRepairCost: number;
  difficulty: DifficultyLevel;
}): TankerMinigameSession {
  const { regionId, eventId, eventTitle, baseEventRepairCost, difficulty } =
    params;
  const isStormOnly =
    eventId.startsWith('storm_disruption') && baseEventRepairCost <= 0;
  const cfg = getTankerRescueConfig(difficulty, baseEventRepairCost, isStormOnly);

  const worldWidth = 840;
  const worldHeight = 440;
  const startX = 68;
  const startY = 220;
  const harborX = 768;
  const harborRadius = 42;

  const upperBias = Math.random() < 0.5;
  const mid1Y = upperBias
    ? 110 + Math.random() * 55
    : 275 + Math.random() * 55;
  const mid2Y = upperBias
    ? 275 + Math.random() * 55
    : 110 + Math.random() * 55;
  const harborY = Math.round(
    (upperBias ? 130 : 230) + Math.random() * 85
  );

  const waypoints = [
    { x: startX, y: startY },
    { x: 290, y: mid1Y },
    { x: 540, y: mid2Y },
    { x: harborX, y: harborY },
  ];

  const hazards: TankerHazardSpec[] = [];
  let attempts = 0;
  while (hazards.length < cfg.reefCount && attempts < 500) {
    attempts += 1;
    const radius = 20 + Math.round(Math.random() * 14);
    const x = 165 + Math.random() * 535;
    const y = 44 + Math.random() * (worldHeight - 88);

    const distStart = Math.hypot(x - startX, y - startY);
    const distHarbor = Math.hypot(x - harborX, y - harborY);
    if (distStart < 105 || distHarbor < 105) continue;

    const channelDist = distToSafeChannel(x, y, waypoints);
    if (channelDist < cfg.corridorHalfWidth + radius) continue;

    const overlapsExisting = hazards.some(
      (h) => Math.hypot(h.x - x, h.y - y) < h.radius + radius + 16
    );
    if (overlapsExisting) continue;

    hazards.push({
      id: `reef_${hazards.length + 1}`,
      kind: 'REEF',
      x: Math.round(x),
      y: Math.round(y),
      radius,
      vx: 0,
      vy: 0,
    });
  }

  // Add drifting storm debris hazards with predictable vertical oscillation
  const debrisXAnchors = [335, 505, 645];
  for (let i = 0; i < cfg.debrisCount; i++) {
    const anchorX = debrisXAnchors[i % debrisXAnchors.length];
    const dir = i % 2 === 0 ? 1 : -1;
    const speed =
      (difficulty === 'EASY' ? 38 : difficulty === 'HARD' ? 62 : 48) + i * 6;
    hazards.push({
      id: `debris_${i + 1}`,
      kind: 'DEBRIS',
      x: anchorX,
      y: i % 2 === 0 ? 130 : 310,
      radius: 13,
      vx: 0,
      vy: dir * speed,
      minY: 66,
      maxY: worldHeight - 66,
    });
  }

  const currents: TankerCurrentZoneSpec[] = [
    {
      id: 'curr_west',
      xStart: 200,
      xEnd: 350,
      forceY: upperBias ? cfg.currentForce : -cfg.currentForce,
      label: upperBias ? 'Déli áramlat' : 'Északi áramlat',
      directionKey: upperBias ? 'SOUTH_CURRENT' : 'NORTH_CURRENT',
    },
    {
      id: 'curr_east',
      xStart: 470,
      xEnd: 630,
      forceY: upperBias ? -cfg.currentForce : cfg.currentForce,
      label: upperBias ? 'Északi széllökés' : 'Déli széllökés',
      directionKey: upperBias ? 'NORTH_GUST' : 'SOUTH_GUST',
    },
  ];

  return {
    regionId,
    eventId,
    templateId: extractEventTemplateId(eventId) ?? undefined,
    eventTitle,
    difficulty,
    stakeBaseCost: cfg.stakeBaseCost,
    baseEventRepairCost: cfg.baseEventRepairCost,
    failMultiplier: cfg.failMultiplier,
    failExtraPenaltyCost: cfg.failExtraPenaltyCost,
    recoveryRatio: cfg.recoveryRatio,
    timeLimitSec: cfg.timeLimitSec,
    maxHullHp: cfg.maxHullHp,
    worldWidth,
    worldHeight,
    startX,
    startY,
    harborX,
    harborY,
    harborRadius,
    hazards,
    currents,
  };
}

export interface CoreSampleDifficultyConfig {
  ownTeamCost: number;
  externalTeamCost: number;
  maxAttempts: number;
  greenZoneMultiplier: number;
  efficiencyBonusPct: number;
  contractorEfficiencyBonusPct: number;
  externalGreenZoneMultiplier: number;
  externalEfficiencyBonusPct: number;
  externalContractorEfficiencyBonusPct: number;
  failPenaltyCost: number;
  failGreenZoneMultiplier: number;
}

export function getCoreSampleConfig(
  difficulty: DifficultyLevel
): CoreSampleDifficultyConfig {
  switch (difficulty) {
    case 'EASY':
      return {
        ownTeamCost: 22000,
        externalTeamCost: 70000,
        maxAttempts: 3,
        greenZoneMultiplier: 1.45,
        efficiencyBonusPct: 14,
        contractorEfficiencyBonusPct: 8,
        externalGreenZoneMultiplier: 1.3,
        externalEfficiencyBonusPct: 9,
        externalContractorEfficiencyBonusPct: 6,
        failPenaltyCost: 0,
        failGreenZoneMultiplier: 1.0,
      };
    case 'HARD':
      return {
        ownTeamCost: 42000,
        externalTeamCost: 220000,
        maxAttempts: 2,
        greenZoneMultiplier: 1.25,
        efficiencyBonusPct: 8,
        contractorEfficiencyBonusPct: 4,
        externalGreenZoneMultiplier: 1.15,
        externalEfficiencyBonusPct: 5,
        externalContractorEfficiencyBonusPct: 3,
        failPenaltyCost: 55000,
        failGreenZoneMultiplier: 0.95,
      };
    case 'STANDARD':
    default:
      return {
        ownTeamCost: 30000,
        externalTeamCost: 125000,
        maxAttempts: 3,
        greenZoneMultiplier: 1.35,
        efficiencyBonusPct: 10,
        contractorEfficiencyBonusPct: 6,
        externalGreenZoneMultiplier: 1.22,
        externalEfficiencyBonusPct: 7,
        externalContractorEfficiencyBonusPct: 4,
        failPenaltyCost: 25000,
        failGreenZoneMultiplier: 1.0,
      };
  }
}

interface ChemicalStratumBlueprint {
  rockName: string;
  chemicalFormula: string;
  chemicalClue: string;
  basePressureBar: number;
  densityGcm3: number;
  pHLabel: string;
  rockColor: string;
}

const CHEMICAL_STRATA_SEQUENCE: ChemicalStratumBlueprint[] = [
  {
    rockName: 'Felszíni kvarchomok-takaró',
    chemicalFormula: 'SiO₂ + O₂',
    chemicalClue: 'Felszíni oxidált zóna · legkisebb rétegnyomás és sűrűség',
    basePressureBar: 24,
    densityGcm3: 2.15,
    pHLabel: 'pH 6,8 (Semleges)',
    rockColor: '#9C8253',
  },
  {
    rockName: 'Édesvízi agyagmárga',
    chemicalFormula: 'CaCO₃ + Al₂Si₂O₅',
    chemicalClue: 'Sekély vízzáró réteg · enyhén lúgos karbonátos átmenet',
    basePressureBar: 68,
    densityGcm3: 2.36,
    pHLabel: 'pH 7,6 (Enyhén lúgos)',
    rockColor: '#6E7D8B',
  },
  {
    rockName: 'Párolgási gipsz- és sókéreg',
    chemicalFormula: 'CaSO₄·2H₂O + NaCl',
    chemicalClue: 'Középmély szulfátos kéreg · növekvő sókoncentráció',
    basePressureBar: 124,
    densityGcm3: 2.51,
    pHLabel: 'pH 6,2 (Enyhén savas)',
    rockColor: '#8B98A5',
  },
  {
    rockName: 'Tömör agyagpala-zárópajzs',
    chemicalFormula: 'FeS₂ + SiO₂',
    chemicalClue: 'Közvetlen csapdazáró réteg · piritnyomok, magas tömörség',
    basePressureBar: 188,
    densityGcm3: 2.66,
    pHLabel: 'pH 5,4 (Savas záróréteg)',
    rockColor: '#566270',
  },
  {
    rockName: 'Dolomitos pórustároló',
    chemicalFormula: 'CaMg(CO₃)₂ + CH₄',
    chemicalClue: 'Felső tárolózóna · oldott metángáz és kénes karbonát',
    basePressureBar: 262,
    densityGcm3: 2.75,
    pHLabel: 'pH 5,9 (Kénes karbonát)',
    rockColor: '#B57442',
  },
  {
    rockName: 'Mélyrétegi szénhidrogén-csapda',
    chemicalFormula: 'CₙH₂ₙ₊₂ + H₂S',
    chemicalClue: 'Telített nyersolaj-rezervoár · legmagasabb formációs nyomás',
    basePressureBar: 356,
    densityGcm3: 2.84,
    pHLabel: 'pH 4,8 (Nagy H₂S nyomás)',
    rockColor: '#37414C',
  },
];

function pickResonanceCenterPct(
  halfWidthPct: number,
  avoidCenterPct?: number
): number {
  const minCenter = Math.max(44, 28 + halfWidthPct);
  const maxCenter = Math.min(87, 96 - halfWidthPct);
  let candidate =
    minCenter + Math.random() * Math.max(4, maxCenter - minCenter);

  if (avoidCenterPct !== undefined && maxCenter - minCenter >= 16) {
    for (let i = 0; i < 8; i++) {
      if (Math.abs(candidate - avoidCenterPct) >= 10) break;
      candidate =
        minCenter + Math.random() * Math.max(4, maxCenter - minCenter);
    }
  }

  return Number(candidate.toFixed(1));
}

export function rollNextResonanceCenter(
  previousCenterPct: number,
  halfWidthPct: number
): number {
  return pickResonanceCenterPct(halfWidthPct, previousCenterPct);
}

export function buildCoreSampleSession(
  regionId: RegionId,
  difficulty: DifficultyLevel
): CoreSampleMinigameSession {
  const regionStatic = REGIONS_BY_ID[regionId];
  const cfg = getCoreSampleConfig(difficulty);
  const count = regionStatic.strataCount;

  // Always select a clean ordered subset from shallow surface to deep trap
  const selectedIndices: number[] = [];
  if (count === 4) {
    selectedIndices.push(0, 1, 3, 5);
  } else if (count === 5) {
    selectedIndices.push(0, 1, 2, 3, 5);
  } else {
    selectedIndices.push(0, 1, 2, 3, 4, 5);
  }

  const orderedTargetLayers: CoreSampleLayerSpec[] = selectedIndices.map(
    (seqIdx, orderIdx) => {
      const bp = CHEMICAL_STRATA_SEQUENCE[seqIdx];
      const jitter = Math.round((Math.random() - 0.5) * 10);
      const regionDepthBoost = (regionStatic.drillingDifficulty - 1) * 14;
      const depthRatio = count > 1 ? orderIdx / (count - 1) : 1;

      // Narrowing resonance target window and rising pulse sweep speed per depth
      let targetHalfWidthPct: number;
      let sweepSpeedPctPerSec: number;
      if (difficulty === 'EASY') {
        targetHalfWidthPct = Number((14.0 - depthRatio * 7.0).toFixed(1));
        sweepSpeedPctPerSec = Math.round(48 + depthRatio * 20);
      } else if (difficulty === 'HARD') {
        targetHalfWidthPct = Number((9.5 - depthRatio * 5.3).toFixed(1));
        sweepSpeedPctPerSec = Math.round(64 + depthRatio * 32);
      } else {
        targetHalfWidthPct = Number((11.5 - depthRatio * 6.3).toFixed(1));
        sweepSpeedPctPerSec = Math.round(56 + depthRatio * 26);
      }

      const targetCenterPct = pickResonanceCenterPct(targetHalfWidthPct);

      return {
        layerId: `layer_${regionId}_${orderIdx}`,
        seqIdx,
        depthOrder: orderIdx,
        rockName: bp.rockName,
        chemicalFormula: bp.chemicalFormula,
        chemicalClue: bp.chemicalClue,
        pressureBar: Math.max(
          15,
          bp.basePressureBar + regionDepthBoost + jitter
        ),
        densityGcm3: bp.densityGcm3,
        pHLabel: bp.pHLabel,
        rockColor: bp.rockColor,
        targetCenterPct,
        targetHalfWidthPct,
        sweepSpeedPctPerSec,
      };
    }
  );

  const reservoirLayer = orderedTargetLayers[orderedTargetLayers.length - 1];
  const estimatedWellOutputBbl = Math.round(
    regionStatic.baseWellOutputBbl * (1 + cfg.efficiencyBonusPct / 100)
  );
  const profileKey: 'HIGH' | 'BALANCED' | 'MODERATE' =
    reservoirLayer.pressureBar >= 360
      ? 'HIGH'
      : reservoirLayer.pressureBar >= 300
        ? 'BALANCED'
        : 'MODERATE';
  const pressureProfileLabel =
    profileKey === 'HIGH'
      ? 'Magas csapdanyomás (Stabil kihozatal)'
      : profileKey === 'BALANCED'
        ? 'Kiegyensúlyozott közép-mély nyomás'
        : 'Mérsékelt rezervoárnyomás';

  return {
    regionId,
    difficulty,
    costPaid: cfg.ownTeamCost,
    maxAttempts: cfg.maxAttempts,
    failPenaltyCost: cfg.failPenaltyCost,
    failGreenZoneMultiplier: cfg.failGreenZoneMultiplier,
    greenZoneMultiplier: cfg.greenZoneMultiplier,
    efficiencyBonusPct: cfg.efficiencyBonusPct,
    contractorEfficiencyBonusPct: cfg.contractorEfficiencyBonusPct,
    estimatedWellOutputBbl,
    reservoirPressureBar: reservoirLayer.pressureBar,
    pressureProfileLabel,
    profileKey,
    orderedTargetLayers,
  };
}

export function evaluateSeismicPulse(
  targetCenterPct: number,
  targetHalfWidthPct: number,
  cursorPct: number
): {
  hit: boolean;
  reason: 'HIT' | 'TOO_EARLY' | 'OVERFLOW';
} {
  if (Math.abs(cursorPct - targetCenterPct) <= targetHalfWidthPct) {
    return { hit: true, reason: 'HIT' };
  }
  if (cursorPct < targetCenterPct - targetHalfWidthPct) {
    return { hit: false, reason: 'TOO_EARLY' };
  }
  return { hit: false, reason: 'OVERFLOW' };
}
