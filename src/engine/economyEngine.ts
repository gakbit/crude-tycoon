/**
 * Market cycle engine, oil price simulator, geopolitical event evaluator,
 * and economic utility calculations for Crude Tycoon.
 */

import {
  COLD_CLIMATE_REGION_IDS,
  GEOPOLITICAL_EVENT_TEMPLATES,
  REGIONS_BY_ID,
  REGIONS_DATA,
} from '../data/regionsData';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatGameDateI18n,
  getActiveLanguage,
  getDict,
} from '../i18n';
import {
  Company,
  DifficultyLevel,
  DrillingLayerSpec,
  GeopoliticalEvent,
  MarketCyclePhase,
  MarketState,
  OilWell,
  RegionId,
  RegionRuntimeState,
} from './gameTypes';

export function formatCurrency(amount: number): string {
  return formatCurrencyI18n(amount, getActiveLanguage());
}

export function formatBarrels(barrels: number): string {
  return formatBarrelsI18n(barrels, getActiveLanguage());
}

export function formatGameDate(
  startYear: number,
  startMonth: number,
  turn: number
): string {
  return formatGameDateI18n(startYear, startMonth, turn, getActiveLanguage());
}

export function getCyclePhaseLabel(phase: MarketCyclePhase): string {
  return getDict(getActiveLanguage()).marketCycles[phase].label;
}

export function calculateWellMonthlyOutput(
  well: OilWell,
  regionRuntime: RegionRuntimeState
): number {
  if (well.status !== 'ACTIVE' || regionRuntime.remainingReservesBbl <= 0) {
    return 0;
  }
  const quotaRatio = Math.max(0, Math.min(100, well.productionQuotaPct)) / 100;
  const bonusMultiplier = 1 + well.efficiencyBonusPct / 100;
  const crisisMultiplier = regionRuntime.crisisOutputMultiplier;
  const hackMultiplier =
    regionRuntime.activeHack && regionRuntime.activeHack.turnsRemaining > 0
      ? regionRuntime.activeHack.outputMultiplier
      : 1.0;
  const rawOutput =
    well.maxMonthlyOutputBbl *
    quotaRatio *
    bonusMultiplier *
    crisisMultiplier *
    hackMultiplier;
  return Math.min(Math.round(rawOutput), regionRuntime.remainingReservesBbl);
}

export function calculateSaleProceeds(
  barrels: number,
  spotPrice: number,
  regionId: RegionId,
  regionalPriceMultiplier = 1.0
): number {
  const regionStatic = REGIONS_BY_ID[regionId];
  return Math.round(
    barrels *
      spotPrice *
      regionStatic.logisticsMultiplier *
      regionalPriceMultiplier
  );
}

export function getRegionStorageCapacity(
  regionId: RegionId,
  regionRuntime: RegionRuntimeState
): number {
  const regionStatic = REGIONS_BY_ID[regionId];
  return regionRuntime.tanksCount * regionStatic.tankCapacityPerUnit;
}

export function calculateCompanyNetWorth(
  company: Company,
  regions: Record<RegionId, RegionRuntimeState>,
  wells: OilWell[],
  market: MarketState
): number {
  let assetValue = company.cash - company.debt;

  for (const regionStatic of REGIONS_DATA) {
    const rt = regions[regionStatic.id];
    if (rt.ownerCompanyId === company.id) {
      assetValue += regionStatic.concessionBasePrice * 0.75;
      assetValue += rt.tanksCount * regionStatic.tankBuildCost * 0.7;
      assetValue += calculateSaleProceeds(
        rt.storedBarrels,
        market.spotPricePerBarrel,
        regionStatic.id,
        rt.crisisPriceMultiplier ?? 1.0
      );
    }
  }

  for (const well of wells) {
    if (well.ownerCompanyId === company.id && well.status !== 'DEPLETED') {
      const regionStatic = REGIONS_BY_ID[well.regionId];
      assetValue += regionStatic.drillingBaseCost * 0.65;
    }
  }

  return Math.round(assetValue);
}

/**
 * Computes exact breakthrough chance (10% - 98%) from the two stopped reaction bars.
 * Bar 1 measures drill-head alignment around optimalPositionCenter.
 * Bar 2 measures layer-specific rotational speed around optimalSpeedCenter.
 */
export function calculateDrillingSuccessChance(
  positionVal: number,
  speedVal: number,
  layer: DrillingLayerSpec
): { chancePct: number; positionAccuracyPct: number; speedAccuracyPct: number } {
  const scoreAxis = (
    actual: number,
    target: number,
    greenHalfWidth: number
  ): number => {
    const distance = Math.abs(actual - target);
    if (distance <= greenHalfWidth) {
      // Inside green zone: 82% to 100% score
      const ratio = distance / Math.max(1, greenHalfWidth);
      return 100 - ratio * 18;
    }
    // Outside green zone: drop off smoothly toward red edges
    const maxDist = Math.max(target, 100 - target) - greenHalfWidth;
    const excessRatio = Math.min(
      1,
      (distance - greenHalfWidth) / Math.max(1, maxDist)
    );
    return Math.max(8, 82 - excessRatio * 74);
  };

  const posScore = scoreAxis(
    positionVal,
    layer.optimalPositionCenter,
    layer.positionGreenHalfWidth
  );
  const spdScore = scoreAxis(
    speedVal,
    layer.optimalSpeedCenter,
    layer.speedGreenHalfWidth
  );

  // Weighted combination slightly penalizing a catastrophic miss on either bar
  const combined = posScore * 0.48 + spdScore * 0.52;
  const minPenalty = Math.min(posScore, spdScore) < 25 ? -10 : 0;
  const chancePct = Math.max(
    10,
    Math.min(98, Math.round(combined + minPenalty))
  );

  return {
    chancePct,
    positionAccuracyPct: Math.round(posScore),
    speedAccuracyPct: Math.round(spdScore),
  };
}

/**
 * Advances global market supply/demand cycles and updates spot crude oil price.
 * Produces fast, pronounced cyclical waves across $28-$135 with guaranteed
 * perceptible movement ($4.80-$16.50) every turn and zero flat turns.
 */
export function advanceMarketCycle(
  currentMarket: MarketState,
  totalMonthlySupplyBbl: number,
  activeEvents: GeopoliticalEvent[],
  turn: number
): {
  nextMarket: MarketState;
  cycleChangedHeadline: string | null;
  cycleChangeLogKey?:
    | 'market_cycle_boom'
    | 'market_cycle_glut'
    | 'market_cycle_crisis'
    | 'market_cycle_stable';
} {
  const prevPrice = currentMarket.spotPricePerBarrel;
  let nextPhase = currentMarket.cyclePhase;
  let turnsLeft = currentMarket.cycleTurnsRemaining - 1;
  let cycleChangedHeadline: string | null = null;
  let cycleChangeLogKey:
    | 'market_cycle_boom'
    | 'market_cycle_glut'
    | 'market_cycle_crisis'
    | 'market_cycle_stable'
    | undefined;

  const hasSevereGlobalShock = activeEvents.some(
    (ev) => ev.severity === 'CRITICAL' && ev.priceImpactMultiplier >= 1.12
  );

  // Rapid 1-2 turn cycle phases so market waves visibly turn across short horizons
  if (turnsLeft <= 0) {
    const roll = Math.random();
    if (hasSevereGlobalShock && Math.random() < 0.5) {
      nextPhase = 'CRISIS';
      turnsLeft = 1 + Math.floor(Math.random() * 2);
      cycleChangedHeadline =
        'Ellátási zavarok fűtik a tőzsdét: gyorsan emelkedik a nyersolaj ára.';
    } else if (currentMarket.cyclePhase === 'STABLE') {
      nextPhase = roll < 0.5 ? 'BOOM' : 'GLUT';
      turnsLeft = 2;
      cycleChangedHeadline =
        nextPhase === 'BOOM'
          ? 'Globális ipari konjunktúra: meredeken emelkedik a nyersolaj-kereslet.'
          : 'Túltermelési hullám a piacon: megteltek a finomítói készletek.';
    } else if (currentMarket.cyclePhase === 'BOOM') {
      nextPhase = roll < 0.65 ? 'GLUT' : 'STABLE';
      turnsLeft = nextPhase === 'GLUT' ? 2 : 1;
      cycleChangedHeadline =
        nextPhase === 'STABLE'
          ? 'Csillapodik az olajpiaci láz, rövid átmeneti egyensúly alakul ki.'
          : 'A magas árak túlfűtötték a kitermelést, gyors túlkínálat alakult ki.';
    } else if (currentMarket.cyclePhase === 'GLUT') {
      nextPhase = roll < 0.65 ? 'BOOM' : 'STABLE';
      turnsLeft = nextPhase === 'BOOM' ? 2 : 1;
      cycleChangedHeadline =
        nextPhase === 'STABLE'
          ? 'Felszívódott a felesleges készlet, magához tér az olajár.'
          : 'Gyors gazdasági fordulat: erőteljes új keresleti hullám indult.';
    } else {
      nextPhase = roll < 0.55 ? 'GLUT' : 'STABLE';
      turnsLeft = nextPhase === 'GLUT' ? 2 : 1;
      cycleChangedHeadline =
        'Lecsengtek az ellátási zavarok, gyors korrekció indult a spot piacon.';
    }
    cycleChangeLogKey =
      nextPhase === 'BOOM'
        ? 'market_cycle_boom'
        : nextPhase === 'GLUT'
          ? 'market_cycle_glut'
          : nextPhase === 'CRISIS'
            ? 'market_cycle_crisis'
            : 'market_cycle_stable';
  }

  // Fast cyclical harmonic wave (~7-month primary cycle + ~4-month secondary pulse)
  const cycleWave = Math.sin(turn * 0.92) * 0.72 + Math.cos(turn * 1.45) * 0.28;

  let phaseDemandModifier = 1.0;
  let phaseAnchorPrice = 78 + cycleWave * 28;
  if (nextPhase === 'BOOM') {
    phaseDemandModifier = 1.28;
    phaseAnchorPrice = 110 + cycleWave * 21;
  } else if (nextPhase === 'GLUT') {
    phaseDemandModifier = 0.74;
    phaseAnchorPrice = 42 + cycleWave * 13;
  } else if (nextPhase === 'CRISIS') {
    phaseDemandModifier = 1.34;
    phaseAnchorPrice = 119 + Math.abs(cycleWave) * 14;
  }

  // Capacity-aware demand tracks active global supply smoothly plus cyclical demand wave
  const effectiveSupplyRef =
    totalMonthlySupplyBbl > 0
      ? Math.max(24000, totalMonthlySupplyBbl)
      : Math.max(28000, currentMarket.globalDemandBbl);
  const structuralDemand = Math.max(
    32000,
    currentMarket.globalDemandBbl * 0.45 + effectiveSupplyRef * 0.55 + 300
  );
  const demandWave =
    1 + Math.sin(turn * 0.92) * 0.18 + Math.cos(turn * 1.45) * 0.09;
  const adjustedDemand = Math.round(
    structuralDemand * phaseDemandModifier * demandWave
  );

  const supplyRatio =
    totalMonthlySupplyBbl > 0
      ? totalMonthlySupplyBbl / Math.max(18000, adjustedDemand)
      : 0.92;

  const supplyPressureDelta = Math.max(
    -8.5,
    Math.min(8.5, (1 - supplyRatio) * 12.0)
  );

  // Geopolitical event price multiplier (bounded)
  let eventMultiplier = 1.0;
  for (const ev of activeEvents) {
    eventMultiplier *= ev.priceImpactMultiplier;
  }
  eventMultiplier = Math.max(0.72, Math.min(1.42, eventMultiplier));

  const targetPrice = Math.max(
    29,
    Math.min(134, phaseAnchorPrice * eventMultiplier)
  );
  const meanReversion = (targetPrice - prevPrice) * 0.42;

  // Phase-aligned cyclical impulse (avoids aimless sideways cancellation)
  let preferredDir: 1 | -1 = cycleWave >= 0 ? 1 : -1;
  if (nextPhase === 'BOOM' || nextPhase === 'CRISIS') {
    preferredDir = Math.random() < 0.78 ? 1 : -1;
  } else if (nextPhase === 'GLUT') {
    preferredDir = Math.random() < 0.78 ? -1 : 1;
  } else {
    preferredDir = Math.random() < 0.72 ? preferredDir : (preferredDir === 1 ? -1 : 1);
  }
  const impulse = preferredDir * (4.8 + Math.random() * 8.2);

  let rawDelta = meanReversion + supplyPressureDelta + impulse;

  // Sharp cyclical bounce away from floor/ceiling so price never camps flat at $28 or $135
  if (prevPrice <= 34) {
    rawDelta = 6.2 + Math.random() * 8.5;
  } else if (prevPrice >= 129) {
    rawDelta = -(6.2 + Math.random() * 8.5);
  }

  // Enforce lively, non-flat movement every turn: $4.80 <= |delta| <= $16.50
  const minStep = 4.8;
  const maxStep = 16.5;
  let deltaDir: 1 | -1 =
    rawDelta >= 0 ? 1 : -1;
  let absDelta = Math.abs(rawDelta);
  if (absDelta < minStep) {
    absDelta = minStep + Math.random() * 3.8;
  } else if (absDelta > maxStep) {
    absDelta = maxStep - Math.random() * 2.5;
  }

  let nextPrice = Math.round((prevPrice + deltaDir * absDelta) * 100) / 100;

  // Guarantee strict [$28, $135] bounds while preserving >= $4.80 perceptible swing
  if (nextPrice < 28 || nextPrice > 135) {
    const bounceDir: 1 | -1 = nextPrice < 28 ? 1 : -1;
    const bounceStep = 5.4 + Math.random() * 7.2;
    const candidate = Math.round((prevPrice + bounceDir * bounceStep) * 100) / 100;
    if (
      candidate >= 28 &&
      candidate <= 135 &&
      Math.abs(candidate - prevPrice) >= minStep
    ) {
      nextPrice = candidate;
    } else {
      // Fallback: pick whichever direction has room for a full >= $4.80 move
      const safeDir: 1 | -1 = prevPrice <= 81.5 ? 1 : -1;
      nextPrice = Math.max(
        28,
        Math.min(
          135,
          Math.round((prevPrice + safeDir * (minStep + Math.random() * 6.5)) * 100) / 100
        )
      );
    }
  }

  const nextHistory = [...currentMarket.priceHistory, nextPrice].slice(-36);

  return {
    nextMarket: {
      spotPricePerBarrel: nextPrice,
      previousPrice: prevPrice,
      priceHistory: nextHistory,
      cyclePhase: nextPhase,
      cycleTurnsRemaining: turnsLeft,
      globalDemandBbl: adjustedDemand,
      globalSupplyBbl: totalMonthlySupplyBbl,
      activePriceMultiplier: Number(eventMultiplier.toFixed(2)),
      flatPriceTurnsInYear: 0,
    },
    cycleChangedHeadline,
    cycleChangeLogKey,
  };
}

/**
 * Ticks down existing geopolitical events and guarantees frequent, varied 1-2 month regional crises
 * (>= 3 concessions per year on Standard, >= 2 on Easy, >= 4 on Hard).
 */
export function evaluateGeopoliticalEvents(
  currentEvents: GeopoliticalEvent[],
  regions: Record<RegionId, RegionRuntimeState>,
  turn: number,
  regionalCrisesInYear = 0,
  difficulty: DifficultyLevel = 'STANDARD'
): {
  nextEvents: GeopoliticalEvent[];
  nextRegions: Record<RegionId, RegionRuntimeState>;
  newEvents: GeopoliticalEvent[];
  nextRegionalCrisesInYear: number;
} {
  const nextRegions: Record<RegionId, RegionRuntimeState> = { ...regions };
  const isNewYear = (turn - 1) % 12 === 0;
  let yearCrisisCount = isNewYear ? 0 : regionalCrisesInYear;

  // Decrement active events
  const survivingEvents: GeopoliticalEvent[] = [];
  for (const ev of currentEvents) {
    if (ev.turnsRemaining > 1) {
      survivingEvents.push({
        ...ev,
        turnsRemaining: ev.turnsRemaining - 1,
      });
    }
  }

  // Recompute regional crisis modifiers from surviving events
  for (const regionStatic of REGIONS_DATA) {
    const rt = nextRegions[regionStatic.id];
    const matchingEvent = survivingEvents.find(
      (ev) => ev.affectedRegionId === regionStatic.id
    );
    nextRegions[regionStatic.id] = {
      ...rt,
      activeCrisisTurns: matchingEvent ? matchingEvent.turnsRemaining : 0,
      crisisLabel: matchingEvent ? matchingEvent.title : null,
      crisisTemplateId: matchingEvent
        ? (matchingEvent.templateId ?? rt.crisisTemplateId ?? null)
        : null,
      crisisOutputMultiplier: matchingEvent
        ? matchingEvent.productionModifier
        : 1.0,
      crisisPriceMultiplier: matchingEvent
        ? matchingEvent.regionalPriceMultiplier ?? 1.0
        : 1.0,
    };
  }

  const newEvents: GeopoliticalEvent[] = [];
  const activeRegionalEvents = survivingEvents.filter(
    (ev) => ev.affectedRegionId !== null
  );

  // Target >= 3 regional crises per 12-turn year on Standard (2 Easy, 4 Hard)
  const targetAnnualCrises =
    difficulty === 'HARD' ? 4 : difficulty === 'EASY' ? 2 : 3;
  const monthInYear = ((turn - 1) % 12) + 1;
  const expectedByNow =
    monthInYear >= 11
      ? targetAnnualCrises
      : Math.floor((monthInYear / 12) * targetAnnualCrises);
  const mustSpawnRegional = turn >= 2 && yearCrisisCount < expectedByNow;
  const naturalChance =
    difficulty === 'HARD' ? 0.38 : difficulty === 'EASY' ? 0.22 : 0.3;

  if (
    turn >= 2 &&
    (mustSpawnRegional ||
      (activeRegionalEvents.length < 3 && Math.random() < naturalChance))
  ) {
    const regionalTemplates = GEOPOLITICAL_EVENT_TEMPLATES.filter(
      (t) => !t.globalOnly
    );
    const availableRegions = REGIONS_DATA.filter(
      (r) => nextRegions[r.id].activeCrisisTurns === 0
    );

    if (availableRegions.length > 0 && regionalTemplates.length > 0) {
      const ownedAvailable = availableRegions.filter(
        (r) => nextRegions[r.id].ownerCompanyId !== null
      );
      const pool =
        ownedAvailable.length > 0 && Math.random() < 0.78
          ? ownedAvailable
          : availableRegions;

      // Pick a candidate region, then match an appropriate crisis template
      const pickedRegion = pool[Math.floor(Math.random() * pool.length)];
      const matchingTemplates = regionalTemplates.filter((t) => {
        if (t.offshoreOnly && !pickedRegion.offshore) return false;
        if (
          t.coldRegionOnly &&
          !COLD_CLIMATE_REGION_IDS.includes(pickedRegion.id)
        ) {
          return false;
        }
        if (t.requiresUnstableRegion && pickedRegion.politicalStability >= 76) {
          return false;
        }
        return true;
      });
      const templatePool =
        matchingTemplates.length > 0 ? matchingTemplates : regionalTemplates;
      const template =
        templatePool[Math.floor(Math.random() * templatePool.length)];

      const spawnedRegional: GeopoliticalEvent = {
        id: `${template.idPrefix}_${turn}_${Math.floor(Math.random() * 1000)}`,
        templateId: template.idPrefix,
        turn,
        title: `${template.title} — ${pickedRegion.shortCode}`,
        description: `${pickedRegion.name}: ${template.description}`,
        severity: template.severity,
        affectedRegionId: pickedRegion.id,
        priceImpactMultiplier: template.priceImpactMultiplier,
        productionModifier: template.productionModifier,
        regionalPriceMultiplier: template.regionalPriceMultiplier,
        ownerRepairCost: template.ownerRepairCost,
        turnsRemaining: template.durationMonths,
      };

      survivingEvents.push(spawnedRegional);
      newEvents.push(spawnedRegional);
      yearCrisisCount += 1;

      nextRegions[pickedRegion.id] = {
        ...nextRegions[pickedRegion.id],
        activeCrisisTurns: spawnedRegional.turnsRemaining,
        crisisLabel: template.title,
        crisisTemplateId: template.idPrefix,
        crisisOutputMultiplier: template.productionModifier,
        crisisPriceMultiplier: template.regionalPriceMultiplier,
      };
    }
  }

  // Independent occasional global demand/supply macro shock (max 1 active at a time)
  const hasGlobalEvent = survivingEvents.some(
    (ev) => ev.affectedRegionId === null
  );
  if (turn >= 3 && !hasGlobalEvent && Math.random() < 0.14) {
    const globalTemplates = GEOPOLITICAL_EVENT_TEMPLATES.filter(
      (t) => t.globalOnly
    );
    if (globalTemplates.length > 0) {
      const template =
        globalTemplates[Math.floor(Math.random() * globalTemplates.length)];
      const spawnedGlobal: GeopoliticalEvent = {
        id: `${template.idPrefix}_${turn}_${Math.floor(Math.random() * 1000)}`,
        templateId: template.idPrefix,
        turn,
        title: template.title,
        description: `Világpiac: ${template.description}`,
        severity: template.severity,
        affectedRegionId: null,
        priceImpactMultiplier: template.priceImpactMultiplier,
        productionModifier: template.productionModifier,
        regionalPriceMultiplier: 1.0,
        ownerRepairCost: 0,
        turnsRemaining: template.durationMonths,
      };
      survivingEvents.push(spawnedGlobal);
      newEvents.push(spawnedGlobal);
    }
  }

  return {
    nextEvents: survivingEvents,
    nextRegions,
    newEvents,
    nextRegionalCrisesInYear: yearCrisisCount,
  };
}
