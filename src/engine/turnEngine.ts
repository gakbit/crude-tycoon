/**
 * Turn progression engine, player action handlers, two-bar drilling session builder,
 * and 3-rival AI strategic decision logic for Crude Tycoon.
 */

import {
  REGIONS_BY_ID,
  REGIONS_DATA,
  ROCK_STRATA_POOL,
} from '../data/regionsData';
import {
  extractEventTemplateId,
  formatLocaleNumber,
  getActiveLanguage,
  getDict,
  getReportPeriodMetaI18n,
  interpolate,
} from '../i18n';
import {
  advanceMarketCycle,
  calculateCompanyNetWorth,
  calculateSaleProceeds,
  calculateWellMonthlyOutput,
  evaluateGeopoliticalEvents,
  formatCurrency,
  formatGameDate,
  getRegionStorageCapacity,
} from './economyEngine';
import {
  AiPersonality,
  AnalystCardSpec,
  AnalystMinigameSession,
  Company,
  CurrentTurnLedger,
  DifficultyLevel,
  DrillingLayerSpec,
  DrillingSession,
  GameState,
  MonthlyTurnSummary,
  NewsLogEntry,
  OilWell,
  PendingTankerRescuePrompt,
  QuarterlyReportSnapshot,
  RegionCoreSampleReport,
  RegionId,
  RegionRuntimeState,
  ReportPeriodType,
  SabotageEffectDirection,
  SabotageOperationRecord,
} from './gameTypes';
import {
  buildCoreSampleSession,
  buildTankerNavigationSession,
  getCoreSampleConfig,
  getTankerRescueConfig,
  isTankerRescueEligibleEventId,
} from './operationsEngine';
import {
  buildStealthBuildingSession,
  getSabotageContractorCost,
  getSabotageEffectConfig,
  SABOTAGE_CAUGHT_FINE,
  SABOTAGE_LOCKDOWN_MONTHS,
  SABOTAGE_MINIGAME_COST,
} from './sabotageEngine';

export interface DifficultyBalanceConfig {
  playerStartingCash: number;
  aiStartingCash: number;
  victoryNetWorthTarget: number;
  maxTurns: number;
  contractorDrillMultiplier: number;
  externalAnalystCost: number;
}

export function getDifficultyBalanceConfig(
  difficulty: DifficultyLevel
): DifficultyBalanceConfig {
  switch (difficulty) {
    case 'EASY':
      return {
        playerStartingCash: 1950000,
        aiStartingCash: 2150000,
        victoryNetWorthTarget: 8400000,
        maxTurns: 20,
        contractorDrillMultiplier: 1.06,
        externalAnalystCost: 70000,
      };
    case 'HARD':
      return {
        playerStartingCash: 1550000,
        aiStartingCash: 1750000,
        victoryNetWorthTarget: 220000000,
        maxTurns: 180,
        contractorDrillMultiplier: 1.95,
        externalAnalystCost: 150000,
      };
    case 'STANDARD':
    default:
      return {
        playerStartingCash: 1950000,
        aiStartingCash: 1750000,
        victoryNetWorthTarget: 126000000,
        maxTurns: 120,
        contractorDrillMultiplier: 1.14,
        externalAnalystCost: 95000,
      };
  }
}

export function getContractorDrillMultiplier(
  difficulty: DifficultyLevel
): number {
  return getDifficultyBalanceConfig(difficulty).contractorDrillMultiplier;
}

export function getExternalAnalystCost(difficulty: DifficultyLevel): number {
  return getDifficultyBalanceConfig(difficulty).externalAnalystCost;
}

export function createEmptyTurnLedger(turnStartCash: number): CurrentTurnLedger {
  return {
    turnStartCash,
    oilSalesRevenue: 0,
    oilBarrelsSold: 0,
    bankLoanTaken: 0,
    crisisRescueRefund: 0,
    concessionPurchasesCost: 0,
    tankBuildCost: 0,
    drillingCost: 0,
    analystFeesCost: 0,
    sabotageCost: 0,
    sabotageFineCost: 0,
    crisisRescueCost: 0,
    coreSampleCost: 0,
    loanRepaymentCost: 0,
  };
}

export const ANALYST_AUDIT_COST = 95000;
export const ANALYST_AUDIT_DURATION_MONTHS = 3;

const ANALYST_DOCUMENT_DECK: Array<Omit<AnalystCardSpec, 'cardId'>> = [
  {
    pairKey: 'TANK',
    code: 'TM-04',
    title: 'Tartálymérleg',
    subtitle: 'Raktárkészlet-kimutatás',
    accentHex: '#E59A24',
    iconType: 'TANK',
  },
  {
    pairKey: 'INVOICE',
    code: 'KS-19',
    title: 'Kiviteli számla',
    subtitle: 'Export-bevételi jegyzék',
    accentHex: '#44B872',
    iconType: 'INVOICE',
  },
  {
    pairKey: 'DRILL',
    code: 'FN-88',
    title: 'Fúrási napló',
    subtitle: 'Kitermelési műszaklap',
    accentHex: '#3B82F6',
    iconType: 'DRILL',
  },
  {
    pairKey: 'BANK',
    code: 'BH-12',
    title: 'Hitellevél',
    subtitle: 'Banki fedezeti okirat',
    accentHex: '#E8665A',
    iconType: 'BANK',
  },
  {
    pairKey: 'SHIP',
    code: 'HR-51',
    title: 'Hajórakjegy',
    subtitle: 'Tartályhajó-menetlevél',
    accentHex: '#38BDF8',
    iconType: 'SHIP',
  },
  {
    pairKey: 'STOCK',
    code: 'TS-07',
    title: 'Tőzsdei szelvény',
    subtitle: 'Nyersolaj határidős kötés',
    accentHex: '#A855F7',
    iconType: 'STOCK',
  },
  {
    pairKey: 'GEOLOGY',
    code: 'RJ-33',
    title: 'Rétegjelentés',
    subtitle: 'Földtani fúrómag-elemzés',
    accentHex: '#F59E0B',
    iconType: 'GEOLOGY',
  },
  {
    pairKey: 'TAX',
    code: 'AB-90',
    title: 'Adóbevallás',
    subtitle: 'Negyedéves főkönyvi kivonat',
    accentHex: '#10B981',
    iconType: 'TAX',
  },
];

export function getAnalystMinigameConfig(difficulty: DifficultyLevel): {
  cost: number;
  rewardMonths: number;
  pairsCount: number;
  maxMistakes: number;
} {
  switch (difficulty) {
    case 'EASY':
      return { cost: 50000, rewardMonths: 6, pairsCount: 6, maxMistakes: 12 };
    case 'STANDARD':
      return { cost: 60000, rewardMonths: 5, pairsCount: 8, maxMistakes: 12 };
    case 'HARD':
      return { cost: 80000, rewardMonths: 4, pairsCount: 8, maxMistakes: 9 };
  }
}

const AI_COMPANIES_CONFIG: Array<{
  id: string;
  name: string;
  colorHex: string;
  motto: string;
  personality: AiPersonality;
}> = [
  {
    id: 'ai_borealis',
    name: 'Borealis Energia Zrt.',
    colorHex: '#3B82F6',
    motto: 'Északi kitartás, stabil hozam.',
    personality: 'CONSERVATIVE_SPECULATOR',
  },
  {
    id: 'ai_vektor',
    name: 'Vektor Nyersanyag Rt.',
    colorHex: '#E05A47',
    motto: 'Gyors terjeszkedés minden kontinensen.',
    personality: 'AGGRESSIVE_EXPANSIONIST',
  },
  {
    id: 'ai_meridian',
    name: 'Meridián Kitermelő Kft.',
    colorHex: '#A855F7',
    motto: 'Kiegyensúlyozott tartalékok, tudatos kínálat.',
    personality: 'CARTEL_BALANCER',
  },
];

function createLogEntry(
  turn: number,
  startYear: number,
  startMonth: number,
  category: NewsLogEntry['category'],
  headline: string,
  detail: string,
  i18nKey?: string,
  i18nParams?: Record<string, string | number>
): NewsLogEntry {
  return {
    id: `log_${turn}_${Math.random().toString(36).slice(2, 8)}`,
    turn,
    dateLabel: formatGameDate(startYear, startMonth, turn),
    category,
    headline,
    detail,
    ...(i18nKey ? { i18nKey } : {}),
    ...(i18nParams ? { i18nParams } : {}),
  };
}

export function getReportPeriodMeta(
  startYear: number,
  startMonth: number,
  turn: number
): { periodType: ReportPeriodType; periodLabel: string; year: number } {
  const meta = getReportPeriodMetaI18n(
    startYear,
    startMonth,
    turn,
    getActiveLanguage()
  );
  return {
    year: meta.year,
    periodType: meta.periodType,
    periodLabel: meta.periodLabel,
  };
}

export function createInitialGameState(
  playerCompanyName: string,
  difficulty: DifficultyLevel,
  soundMuted = false
): GameState {
  const startYear = 1994;
  const startMonth = 1;
  const diffConfig = getDifficultyBalanceConfig(difficulty);

  const playerCash = diffConfig.playerStartingCash;
  const aiCash = diffConfig.aiStartingCash;

  const regions: Record<RegionId, RegionRuntimeState> = {} as Record<
    RegionId,
    RegionRuntimeState
  >;

  for (const r of REGIONS_DATA) {
    regions[r.id] = {
      regionId: r.id,
      ownerCompanyId: null,
      tanksCount: 0,
      storedBarrels: 0,
      remainingReservesBbl: r.estimatedReservesBbl,
      activeCrisisTurns: 0,
      crisisLabel: null,
      crisisOutputMultiplier: 1.0,
      crisisPriceMultiplier: 1.0,
      activeHack: null,
      sabotageLockdownTurns: 0,
      coreSampleReport: null,
    };
  }

  const dict = getDict();
  const openingDateLabel = formatGameDate(startYear, startMonth, 1);

  const playerCompany: Company = {
    id: 'player',
    name: playerCompanyName.trim() || dict.companies.defaultPlayerName,
    isPlayer: true,
    colorHex: '#E59A24',
    motto: dict.companies.defaultPlayerMotto,
    personality: null,
    cash: playerCash,
    debt: 0,
    creditLimit: 2000000,
    totalRevenue: 0,
    totalExpenses: 0,
    totalBarrelsSold: 0,
    lastTurnProfit: 0,
    lastTurnProductionBbl: 0,
    netWorth: playerCash,
    quarterAccumulatedProductionBbl: 0,
    quarterAccumulatedProfit: 0,
    yearAccumulatedProductionBbl: 0,
    yearAccumulatedProfit: 0,
    lastPublishedReport: {
      reportedAtTurn: 1,
      reportedDateLabel: openingDateLabel,
      periodType: 'OPENING',
      periodLabel: dict.dates.openingLabel,
      cash: playerCash,
      debt: 0,
      netWorth: playerCash,
      quarterlyProductionBbl: 0,
      quarterlyProfit: 0,
    },
    reportHistory: [],
  };

  const aiCompanies: Company[] = AI_COMPANIES_CONFIG.map((cfg) => ({
    id: cfg.id,
    name: cfg.name,
    isPlayer: false,
    colorHex: cfg.colorHex,
    motto:
      dict.companies.aiMottos[
        cfg.id as keyof typeof dict.companies.aiMottos
      ] ?? cfg.motto,
    personality: cfg.personality,
    cash: aiCash,
    debt: 0,
    creditLimit: 2000000,
    totalRevenue: 0,
    totalExpenses: 0,
    totalBarrelsSold: 0,
    lastTurnProfit: 0,
    lastTurnProductionBbl: 0,
    netWorth: aiCash,
    quarterAccumulatedProductionBbl: 0,
    quarterAccumulatedProfit: 0,
    yearAccumulatedProductionBbl: 0,
    yearAccumulatedProfit: 0,
    lastPublishedReport: {
      reportedAtTurn: 1,
      reportedDateLabel: openingDateLabel,
      periodType: 'OPENING',
      periodLabel: dict.dates.openingLabel,
      cash: aiCash,
      debt: 0,
      netWorth: aiCash,
      quarterlyProductionBbl: 0,
      quarterlyProfit: 0,
    },
    reportHistory: [],
  }));

  return {
    screen: 'PLAYING',
    activeTab: 'MAP',
    selectedRegionId: 'carpathian_foothills',
    difficulty,
    turn: 1,
    maxTurns: diffConfig.maxTurns,
    endlessMode: false,
    startYear,
    startMonth,
    victoryNetWorthTarget: diffConfig.victoryNetWorthTarget,
    playerCompanyId: 'player',
    companies: [playerCompany, ...aiCompanies],
    regions,
    wells: [],
    market: {
      spotPricePerBarrel: 58.5,
      previousPrice: 57.0,
      priceHistory: [54.2, 55.8, 57.0, 58.5],
      cyclePhase: 'STABLE',
      cycleTurnsRemaining: 3,
      globalDemandBbl: 34000,
      globalSupplyBbl: 0,
      activePriceMultiplier: 1.0,
      flatPriceTurnsInYear: 0,
    },
    activeEvents: [],
    newsLog: [
      createLogEntry(
        1,
        startYear,
        startMonth,
        'OPERATIONS',
        dict.logEntries.game_init.title,
        interpolate(dict.logEntries.game_init.description, {
          playerName: playerCompany.name,
          cash: formatCurrency(playerCash),
        }),
        'game_init',
        { playerName: playerCompany.name, cashAmount: playerCash }
      ),
      createLogEntry(
        1,
        startYear,
        startMonth,
        'MARKET',
        dict.logEntries.market_opening.title,
        dict.logEntries.market_opening.description,
        'market_opening',
        {}
      ),
    ],
    drillingSession: null,
    analystSession: null,
    sabotageSession: null,
    tankerSession: null,
    coreSampleSession: null,
    pendingTankerRescuePrompt: null,
    gameOverSummary: null,
    analystAccessTurnsByCompanyId: {},
    sabotageHistory: [],
    pendingAnnualReportTurn: null,
    pendingMonthlySummary: null,
    currentTurnLedger: createEmptyTurnLedger(playerCash),
    regionalCrisesInYear: 0,
    soundMuted,
  };
}

export function getPlayerCompany(state: GameState): Company {
  return (
    state.companies.find((c) => c.id === state.playerCompanyId) ??
    state.companies[0]
  );
}

function updateCompanyInList(
  companies: Company[],
  updated: Company
): Company[] {
  return companies.map((c) => (c.id === updated.id ? updated : c));
}

export function buyRegionConcession(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);

  const dict = getDict();
  if (regionRt.ownerCompanyId !== null) {
    return { state, error: dict.engineErrors.regionAlreadyOwned };
  }
  if (player.cash < regionStatic.concessionBasePrice) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashRequired, {
        cost: formatCurrency(regionStatic.concessionBasePrice),
      }),
    };
  }

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      ownerCompanyId: player.id,
      // Include 1 starter storage tank with concession purchase? No, player builds tanks explicitly, or let's grant 1 starter tank? Actually explicit tank building makes storage management meaningful, OR let's keep tanksCount = 0 with a clear reminder in the UI!
    },
  };

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - regionStatic.concessionBasePrice,
    totalExpenses: player.totalExpenses + regionStatic.concessionBasePrice,
  };

  const nextCompanies = updateCompanyInList(state.companies, nextPlayer);
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    state.wells,
    state.market
  );

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Koncesszió megvásárolva: ${regionStatic.name}`,
    `A ${player.name} megszerezte a kitermelési jogot ${formatCurrency(regionStatic.concessionBasePrice)} áron.`,
    'concession_purchased',
    {
      regionId,
      playerName: player.name,
      priceAmount: regionStatic.concessionBasePrice,
    }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(nextCompanies, nextPlayer),
      regions: nextRegions,
      currentTurnLedger: {
        ...baseLedger,
        concessionPurchasesCost:
          baseLedger.concessionPurchasesCost + regionStatic.concessionBasePrice,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

export function buildStorageTank(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);

  const dict = getDict();
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.notYourConcessionTank };
  }
  if (regionRt.tanksCount >= regionStatic.maxTanksAllowed) {
    return { state, error: dict.engineErrors.maxTanksReached };
  }
  if (player.cash < regionStatic.tankBuildCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashRequired, {
        cost: formatCurrency(regionStatic.tankBuildCost),
      }),
    };
  }

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      tanksCount: regionRt.tanksCount + 1,
    },
  };

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - regionStatic.tankBuildCost,
    totalExpenses: player.totalExpenses + regionStatic.tankBuildCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    state.wells,
    state.market
  );

  const newCapacity =
    regionStatic.tankCapacityPerUnit * (regionRt.tanksCount + 1);
  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Új tárolótartály: ${regionStatic.shortCode}`,
    `${regionStatic.name} térségben elkészült a ${regionRt.tanksCount + 1}. tárolótartály (+${formatLocaleNumber(regionStatic.tankCapacityPerUnit, getActiveLanguage())} hordó kapacitás).`,
    'tank_built',
    {
      regionId,
      capacityBbl: newCapacity,
      costAmount: regionStatic.tankBuildCost,
    }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      currentTurnLedger: {
        ...baseLedger,
        tankBuildCost: baseLedger.tankBuildCost + regionStatic.tankBuildCost,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

export function buildContractorWell(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);

  const dict = getDict();
  const regionWells = state.wells.filter((w) => w.regionId === regionId);
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.notYourConcessionDrill };
  }
  if (regionWells.length >= regionStatic.maxWellsAllowed) {
    return { state, error: dict.engineErrors.maxWellsReached };
  }

  const contractorMult = getContractorDrillMultiplier(state.difficulty);
  const contractorCost = Math.round(regionStatic.drillingBaseCost * contractorMult);
  if (player.cash < contractorCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashContractorDrill, {
        cost: formatCurrency(contractorCost),
      }),
    };
  }

  const activeCoreReport =
    regionRt.coreSampleReport && !regionRt.coreSampleReport.consumed
      ? regionRt.coreSampleReport
      : null;
  const contractorCoreBonusPct =
    activeCoreReport && !activeCoreReport.isMalus
      ? activeCoreReport.contractorEfficiencyBonusPct
      : 0;

  const newWell: OilWell = {
    id: `well_${regionId}_${state.turn}_${Math.random().toString(36).slice(2, 6)}`,
    regionId,
    ownerCompanyId: player.id,
    name: `${regionStatic.shortCode}-${regionWells.length + 1} Kút`,
    maxMonthlyOutputBbl: regionStatic.baseWellOutputBbl,
    productionQuotaPct: 100,
    status: 'ACTIVE',
    efficiencyBonusPct: contractorCoreBonusPct,
    builtAtTurn: state.turn,
    totalExtractedBbl: 0,
  };

  const nextRegions =
    activeCoreReport && !activeCoreReport.isMalus
      ? {
          ...state.regions,
          [regionId]: {
            ...regionRt,
            coreSampleReport: {
              ...activeCoreReport,
              consumed: true,
            },
          },
        }
      : state.regions;

  const nextWells = [...state.wells, newWell];
  const nextPlayer: Company = {
    ...player,
    cash: player.cash - contractorCost,
    totalExpenses: player.totalExpenses + contractorCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    nextWells,
    state.market
  );

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Kivitelezői kút üzembe állítva: ${newWell.name}`,
    contractorCoreBonusPct > 0
      ? `${regionStatic.name} területén munkába állt az új kút (${formatCurrency(contractorCost)}, +${contractorCoreBonusPct}% magminta-elővizsgálati bónusszal).`
      : `${regionStatic.name} területén munkába állt az új kút (${formatCurrency(contractorCost)}).`,
    'contractor_well_drilled',
    {
      regionId,
      wellNumber: regionWells.length + 1,
      costAmount: contractorCost,
      coreBonusPct: contractorCoreBonusPct,
    }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      wells: nextWells,
      currentTurnLedger: {
        ...baseLedger,
        drillingCost: baseLedger.drillingCost + contractorCost,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

/**
 * Starts the clean-room two-bar reaction drilling minigame for a region.
 * Manual drilling costs 85% of base drilling cost upfront and scales 4-6 layers by region difficulty.
 */
export function startManualDrillingSession(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);

  const dict = getDict();
  const regionWells = state.wells.filter((w) => w.regionId === regionId);
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.notYourConcessionDrill };
  }
  if (regionWells.length >= regionStatic.maxWellsAllowed) {
    return { state, error: dict.engineErrors.maxWellsReached };
  }

  const upfrontCost = Math.round(regionStatic.drillingBaseCost * 0.85);
  if (player.cash < upfrontCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashManualDrill, {
        cost: formatCurrency(upfrontCost),
      }),
    };
  }

  const activeCoreReport =
    regionRt.coreSampleReport && !regionRt.coreSampleReport.consumed
      ? regionRt.coreSampleReport
      : null;
  const greenZoneMult = activeCoreReport ? activeCoreReport.greenZoneMultiplier : 1.0;
  const coreBonusEffPct =
    activeCoreReport && !activeCoreReport.isMalus
      ? activeCoreReport.efficiencyBonusPct
      : 0;

  // Generate 4 to 6 geological layers scaled by region difficulty & active core sample analysis
  const layers: DrillingLayerSpec[] = [];
  const count = regionStatic.strataCount;
  const difficulty = regionStatic.drillingDifficulty;

  // Green zone width shrinks in harder regions and scales by core sample report
  const basePosGreenHalf = Math.max(7, 16 - difficulty * 1.8);
  const baseSpeedGreenHalf = Math.max(6.5, 15 - difficulty * 1.6);
  // Oscillation speed increases in harder regions & deeper strata
  const baseBarSpeed = 52 + difficulty * 11;

  for (let i = 0; i < count; i++) {
    // Pick rock strata from softer near surface to harder deeper down
    const poolIndex = Math.min(
      ROCK_STRATA_POOL.length - 1,
      Math.floor((i / count) * ROCK_STRATA_POOL.length)
    );
    const archetype = ROCK_STRATA_POOL[poolIndex];
    // Slight deterministic/random layer variation so every layer speed target feels distinct
    const speedJitter = Math.round((Math.random() - 0.5) * 14);
    const optimalSpeedCenter = Math.max(
      14,
      Math.min(86, archetype.preferredSpeedCenter + speedJitter)
    );

    const rawPosHalf = Math.max(5.5, basePosGreenHalf - i * 0.6) * greenZoneMult;
    const rawSpdHalf = Math.max(5.0, baseSpeedGreenHalf - i * 0.6) * greenZoneMult;

    layers.push({
      index: i,
      poolIndex,
      layerName: archetype.layerName,
      rockColor: archetype.rockColor,
      hardnessLabel: archetype.hardnessLabel,
      optimalPositionCenter: 50,
      positionGreenHalfWidth: Number(
        Math.max(4.5, Math.min(28, rawPosHalf)).toFixed(1)
      ),
      optimalSpeedCenter,
      speedGreenHalfWidth: Number(
        Math.max(4.5, Math.min(27, rawSpdHalf)).toFixed(1)
      ),
      barOscillationSpeed: Math.round(baseBarSpeed + i * 7),
    });
  }

  const retryCostPerMistake = Math.round(regionStatic.drillingBaseCost * 0.22);

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - upfrontCost,
    totalExpenses: player.totalExpenses + upfrontCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const session: DrillingSession = {
    regionId,
    layers,
    currentLayerIndex: 0,
    step: 'POSITION_BAR',
    mistakesCount: 0,
    maxMistakes: 3,
    retryCostPerMistake,
    baseDrillingCost: upfrontCost,
    totalSpent: upfrontCost,
    lockedPosition: null,
    lockedSpeed: null,
    lastCalculatedChance: null,
    lastRollSuccess: null,
    accuracySamples: [],
    coreSampleMultiplier: greenZoneMult,
    coreSampleBonusEfficiencyPct: coreBonusEffPct,
  };

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      screen: 'DRILLING_MINIGAME',
      companies: updateCompanyInList(state.companies, nextPlayer),
      drillingSession: session,
      currentTurnLedger: {
        ...baseLedger,
        drillingCost: baseLedger.drillingCost + upfrontCost,
      },
    },
    error: null,
  };
}

export function chargeDrillingRetryCost(
  state: GameState,
  cost: number
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const dict = getDict();
  if (player.cash < cost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashRetryBit, {
        cost: formatCurrency(cost),
      }),
    };
  }
  const nextPlayer: Company = {
    ...player,
    cash: player.cash - cost,
    totalExpenses: player.totalExpenses + cost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      currentTurnLedger: {
        ...baseLedger,
        drillingCost: baseLedger.drillingCost + cost,
      },
    },
    error: null,
  };
}

export function completeManualDrillingMinigame(
  state: GameState,
  success: boolean,
  regionId: RegionId,
  averageAccuracyPct: number,
  mistakesCount: number
): GameState {
  const regionStatic = REGIONS_BY_ID[regionId];
  const player = getPlayerCompany(state);

  const regionRt = state.regions[regionId];
  const existingCoreReport =
    regionRt.coreSampleReport && !regionRt.coreSampleReport.consumed
      ? regionRt.coreSampleReport
      : null;

  if (!success) {
    const nextRegions =
      existingCoreReport && existingCoreReport.isMalus
        ? {
            ...state.regions,
            [regionId]: {
              ...regionRt,
              coreSampleReport: { ...existingCoreReport, consumed: true },
            },
          }
        : state.regions;
    const failLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'OPERATIONS',
      `Sikertelen kézi mélyfúrás: ${regionStatic.shortCode}`,
      `${regionStatic.name} területén a fúróberendezés ${mistakesCount} meghibásodás után feladta a kísérletet.`,
      'manual_well_failed',
      {
        regionId,
        totalCostAmount: state.drillingSession?.totalSpent ?? 0,
      }
    );
    return {
      ...state,
      screen: 'PLAYING',
      regions: nextRegions,
      drillingSession: null,
      newsLog: [failLog, ...state.newsLog].slice(0, 80),
    };
  }

  const regionWells = state.wells.filter((w) => w.regionId === regionId);
  const precisionBonus = Math.max(
    0,
    Math.min(25, Math.round((averageAccuracyPct - 60) * 0.65 - mistakesCount * 3))
  );
  const coreSurveyBonus =
    state.drillingSession?.coreSampleBonusEfficiencyPct ?? 0;
  const efficiencyBonusPct = Math.min(39, precisionBonus + coreSurveyBonus);

  const newWell: OilWell = {
    id: `well_${regionId}_${state.turn}_${Math.random().toString(36).slice(2, 6)}`,
    regionId,
    ownerCompanyId: player.id,
    name: `${regionStatic.shortCode}-${regionWells.length + 1} Kút`,
    maxMonthlyOutputBbl: regionStatic.baseWellOutputBbl,
    productionQuotaPct: 100,
    status: 'ACTIVE',
    efficiencyBonusPct,
    builtAtTurn: state.turn,
    totalExtractedBbl: 0,
  };

  const nextRegions = existingCoreReport
    ? {
        ...state.regions,
        [regionId]: {
          ...regionRt,
          coreSampleReport: {
            ...existingCoreReport,
            consumed: true,
          },
        },
      }
    : state.regions;

  const nextWells = [...state.wells, newWell];
  const updatedPlayer: Company = {
    ...player,
    netWorth: calculateCompanyNetWorth(
      player,
      nextRegions,
      nextWells,
      state.market
    ),
  };

  const successLog = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Sikeres kézi mélyfúrás: ${newWell.name}`,
    coreSurveyBonus > 0
      ? `${regionStatic.name} térségben áttörte az olajréteget (+${efficiencyBonusPct}% hozambónusz, ebből +${coreSurveyBonus}% magminta-elővizsgálatból).`
      : `${regionStatic.name} térségben áttörte az olajréteget (+${efficiencyBonusPct}% hozambónusz a pontos vezérlésért).`,
    'manual_well_drilled',
    {
      regionId,
      wellNumber: regionWells.length + 1,
      bonusPct: efficiencyBonusPct,
      coreBonusPct: coreSurveyBonus,
    }
  );

  return {
    ...state,
    screen: 'PLAYING',
    companies: updateCompanyInList(state.companies, updatedPlayer),
    regions: nextRegions,
    wells: nextWells,
    drillingSession: null,
    newsLog: [successLog, ...state.newsLog].slice(0, 80),
  };
}

export function adjustWellQuota(
  state: GameState,
  wellId: string,
  quotaPct: number
): GameState {
  const clamped = Math.max(0, Math.min(100, Math.round(quotaPct)));
  return {
    ...state,
    wells: state.wells.map((w) =>
      w.id === wellId ? { ...w, productionQuotaPct: clamped } : w
    ),
  };
}

export function toggleWellStatus(state: GameState, wellId: string): GameState {
  return {
    ...state,
    wells: state.wells.map((w) => {
      if (w.id !== wellId || w.status === 'DEPLETED') return w;
      return {
        ...w,
        status: w.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      };
    }),
  };
}

export function sellStoredOil(
  state: GameState,
  regionId: RegionId,
  barrelsToSell: number
): { state: GameState; proceeds: number } {
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);
  if (regionRt.ownerCompanyId !== player.id || regionRt.storedBarrels <= 0) {
    return { state, proceeds: 0 };
  }

  const actualBarrels = Math.min(
    Math.max(0, Math.round(barrelsToSell)),
    regionRt.storedBarrels
  );
  if (actualBarrels <= 0) {
    return { state, proceeds: 0 };
  }

  const proceeds = calculateSaleProceeds(
    actualBarrels,
    state.market.spotPricePerBarrel,
    regionId,
    regionRt.crisisPriceMultiplier ?? 1.0
  );

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      storedBarrels: regionRt.storedBarrels - actualBarrels,
    },
  };

  const nextPlayer: Company = {
    ...player,
    cash: player.cash + proceeds,
    totalRevenue: player.totalRevenue + proceeds,
    totalBarrelsSold: player.totalBarrelsSold + actualBarrels,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    state.wells,
    state.market
  );

  const regionStatic = REGIONS_BY_ID[regionId];
  const unitPriceAmount = Math.round(
    state.market.spotPricePerBarrel *
      regionStatic.logisticsMultiplier *
      (regionRt.crisisPriceMultiplier ?? 1.0)
  );
  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'MARKET',
    `Készletértékesítés: ${regionStatic.shortCode}`,
    `${formatLocaleNumber(actualBarrels, getActiveLanguage())} hordó nyersolaj eladva ${formatCurrency(proceeds)} bevételért.`,
    'oil_sold',
    {
      regionId,
      barrelsBbl: actualBarrels,
      unitPriceAmount,
      proceedsAmount: proceeds,
    }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      currentTurnLedger: {
        ...baseLedger,
        oilSalesRevenue: baseLedger.oilSalesRevenue + proceeds,
        oilBarrelsSold: baseLedger.oilBarrelsSold + actualBarrels,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    proceeds,
  };
}

export function sellAllStoredOil(state: GameState): {
  state: GameState;
  totalProceeds: number;
} {
  let workingState = state;
  let totalProceeds = 0;

  for (const r of REGIONS_DATA) {
    const rt = workingState.regions[r.id];
    if (rt.ownerCompanyId === workingState.playerCompanyId && rt.storedBarrels > 0) {
      const res = sellStoredOil(workingState, r.id, rt.storedBarrels);
      workingState = res.state;
      totalProceeds += res.proceeds;
    }
  }

  return { state: workingState, totalProceeds };
}

export function takeBankLoan(
  state: GameState,
  amount: number
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const dict = getDict();
  const available = player.creditLimit - player.debt;
  if (amount <= 0 || amount > available) {
    return {
      state,
      error: interpolate(dict.engineErrors.invalidLoanAmount, {
        limit: formatCurrency(available),
      }),
    };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash + amount,
    debt: player.debt + amount,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    'Bankhitel felvétele',
    `${formatCurrency(amount)} összegű fejlesztési hitel jóváírva (havi 1,5% kamat).`,
    'loan_taken',
    { amountValue: amount }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      currentTurnLedger: {
        ...baseLedger,
        bankLoanTaken: baseLedger.bankLoanTaken + amount,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

export function repayBankLoan(
  state: GameState,
  amount: number
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const dict = getDict();
  const actual = Math.min(amount, player.debt, player.cash);
  if (actual <= 0) {
    return { state, error: dict.engineErrors.cannotRepayDebt };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - actual,
    debt: player.debt - actual,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    'Hiteltörlesztés',
    `${formatCurrency(actual)} hiteltőke visszafizetve.`,
    'loan_repaid',
    { amountValue: actual }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      currentTurnLedger: {
        ...baseLedger,
        loanRepaymentCost: baseLedger.loanRepaymentCost + actual,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

/**
 * Hires an independent market analyst to audit an AI rival for 3 months,
 * revealing live cash, net worth, production, and regional oil stockpiles.
 */
export function hireMarketAnalyst(
  state: GameState,
  targetCompanyId: string
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const target = state.companies.find((c) => c.id === targetCompanyId);
  const analystCost = getExternalAnalystCost(state.difficulty);

  const dict = getDict();
  if (!target || target.isPlayer) {
    return { state, error: dict.engineErrors.invalidTargetCompany };
  }
  if (player.cash < analystCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashExternalAnalyst, {
        cost: formatCurrency(analystCost),
      }),
    };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - analystCost,
    totalExpenses: player.totalExpenses + analystCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const existingTurns = state.analystAccessTurnsByCompanyId?.[target.id] ?? 0;
  const nextAccessMap = {
    ...(state.analystAccessTurnsByCompanyId ?? {}),
    [target.id]: Math.max(existingTurns, ANALYST_AUDIT_DURATION_MONTHS),
  };

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Külső elemző megbízása: ${target.name}`,
    `Független átvilágítás indult ${ANALYST_AUDIT_DURATION_MONTHS} hónapra (${formatCurrency(analystCost)}). A rivális élő készletei és pénzügyei láthatóvá váltak.`,
    'external_analyst_hired',
    {
      targetName: target.name,
      months: ANALYST_AUDIT_DURATION_MONTHS,
      costAmount: analystCost,
    }
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      analystAccessTurnsByCompanyId: nextAccessMap,
      currentTurnLedger: {
        ...baseLedger,
        analystFeesCost: baseLedger.analystFeesCost + analystCost,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

/**
 * Starts the internal analyst document-matching memory minigame.
 * Cost, pair count, mistake limit, and active duration bonus scale by game difficulty.
 */
export function startAnalystMinigameSession(
  state: GameState,
  targetCompanyId: string
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const target = state.companies.find((c) => c.id === targetCompanyId);

  const dict = getDict();
  if (!target || target.isPlayer) {
    return { state, error: dict.engineErrors.invalidTargetCompany };
  }

  const config = getAnalystMinigameConfig(state.difficulty);
  if (player.cash < config.cost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashInternalAudit, {
        cost: formatCurrency(config.cost),
      }),
    };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - config.cost,
    totalExpenses: player.totalExpenses + config.cost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const selectedTypes = ANALYST_DOCUMENT_DECK.slice(0, config.pairsCount);
  const deck: AnalystCardSpec[] = [];
  selectedTypes.forEach((doc, pairIndex) => {
    deck.push({ ...doc, pairIndex, cardId: `${doc.pairKey}_A` });
    deck.push({ ...doc, pairIndex, cardId: `${doc.pairKey}_B` });
  });

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  const session: AnalystMinigameSession = {
    targetCompanyId: target.id,
    targetCompanyName: target.name,
    targetCompanyColorHex: target.colorHex,
    difficulty: state.difficulty,
    cost: config.cost,
    rewardMonths: config.rewardMonths,
    maxMistakes: config.maxMistakes,
    pairsCount: config.pairsCount,
    cards: deck,
  };

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  return {
    state: {
      ...state,
      screen: 'ANALYST_MINIGAME',
      companies: updateCompanyInList(state.companies, nextPlayer),
      analystSession: session,
      currentTurnLedger: {
        ...baseLedger,
        analystFeesCost: baseLedger.analystFeesCost + config.cost,
      },
    },
    error: null,
  };
}

export function completeAnalystMinigame(
  state: GameState,
  success: boolean,
  mistakesCount: number
): GameState {
  const session = state.analystSession;
  if (!session) {
    return {
      ...state,
      screen: 'PLAYING',
      analystSession: null,
    };
  }

  if (!success) {
    const failLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'OPERATIONS',
      `Sikertelen belső átvilágítás: ${session.targetCompanyName}`,
      `A saját elemzői csapat ${mistakesCount} téves párosítás után nem tudta összeállítani a bizalmas jelentést.`,
      'internal_audit_failed',
      {
        targetName: session.targetCompanyName,
        costAmount: session.cost,
      }
    );
    return {
      ...state,
      screen: 'PLAYING',
      analystSession: null,
      newsLog: [failLog, ...state.newsLog].slice(0, 80),
    };
  }

  const existingTurns =
    state.analystAccessTurnsByCompanyId?.[session.targetCompanyId] ?? 0;
  const nextAccessMap = {
    ...(state.analystAccessTurnsByCompanyId ?? {}),
    [session.targetCompanyId]: Math.max(existingTurns, session.rewardMonths),
  };

  const successLog = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Saját elemzés sikeres: ${session.targetCompanyName}`,
    `A könyvelési dokumentumok összeállítása sikerült (${mistakesCount} hiba). A rivális élő készletei és pénzügyei ${session.rewardMonths} hónapig láthatók.`,
    'internal_audit_success',
    {
      targetName: session.targetCompanyName,
      months: session.rewardMonths,
      costAmount: session.cost,
    }
  );

  return {
    ...state,
    screen: 'PLAYING',
    analystSession: null,
    analystAccessTurnsByCompanyId: nextAccessMap,
    newsLog: [successLog, ...state.newsLog].slice(0, 80),
  };
}

/**
 * Starts the 2D stealth corridor infiltration minigame to hack government systems
 * affecting a concession's production quota or triggering sabotage & administrative fines.
 */
export function startConcessionSabotageMinigame(
  state: GameState,
  regionId: RegionId,
  direction: SabotageEffectDirection
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];

  const dict = getDict();
  if (!regionRt.ownerCompanyId) {
    return {
      state,
      error: dict.engineErrors.sabotageFreeRegionBlocked,
    };
  }
  if ((regionRt.sabotageLockdownTurns ?? 0) > 0) {
    return {
      state,
      error: interpolate(dict.engineErrors.sabotageRegionLocked, {
        turns: regionRt.sabotageLockdownTurns ?? 0,
      }),
    };
  }
  if (player.cash < SABOTAGE_MINIGAME_COST) {
    return {
      state,
      error: interpolate(dict.engineErrors.sabotageInsufficientCash, {
        cost: formatCurrency(SABOTAGE_MINIGAME_COST),
      }),
    };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - SABOTAGE_MINIGAME_COST,
    totalExpenses: player.totalExpenses + SABOTAGE_MINIGAME_COST,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const session = buildStealthBuildingSession({
    regionId,
    targetOwnerCompanyId: regionRt.ownerCompanyId,
    direction,
    difficulty: state.difficulty,
  });

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);

  return {
    state: {
      ...state,
      screen: 'SABOTAGE_MINIGAME',
      companies: updateCompanyInList(state.companies, nextPlayer),
      sabotageSession: session,
      currentTurnLedger: {
        ...baseLedger,
        sabotageCost: (baseLedger.sabotageCost ?? 0) + SABOTAGE_MINIGAME_COST,
      },
    },
    error: null,
  };
}

/**
 * Completes the stealth corridor infiltration minigame (SUCCESS, CAUGHT, or ABORTED).
 * Caught runs inflict a $120,000 fine on the player plus a 3-month regional security lockdown.
 */
export function completeConcessionSabotageMinigame(
  state: GameState,
  outcome: 'SUCCESS' | 'CAUGHT' | 'ABORTED'
): GameState {
  const session = state.sabotageSession;
  if (!session) {
    return {
      ...state,
      screen: 'PLAYING',
      sabotageSession: null,
    };
  }

  const regionStatic = REGIONS_BY_ID[session.regionId];
  const regionRt = state.regions[session.regionId];
  const player = getPlayerCompany(state);
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);

  if (outcome === 'ABORTED') {
    const abortLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'OPERATIONS',
      `Behatolás félbeszakítva: ${regionStatic.shortCode}`,
      `${regionStatic.name} térségben a csapat visszavonult a művelet befejezése előtt. A belépési költség elveszett.`,
      'sabotage_aborted',
      { regionId: session.regionId }
    );
    return {
      ...state,
      screen: 'PLAYING',
      sabotageSession: null,
      newsLog: [abortLog, ...state.newsLog].slice(0, 80),
    };
  }

  if (outcome === 'CAUGHT') {
    const nextPlayer: Company = {
      ...player,
      cash: player.cash - session.caughtFineCost,
      totalExpenses: player.totalExpenses + session.caughtFineCost,
    };
    nextPlayer.netWorth = calculateCompanyNetWorth(
      nextPlayer,
      state.regions,
      state.wells,
      state.market
    );

    const nextRegions: Record<RegionId, RegionRuntimeState> = {
      ...state.regions,
      [session.regionId]: {
        ...regionRt,
        sabotageLockdownTurns: session.lockdownMonths,
      },
    };

    const opRecord: SabotageOperationRecord = {
      id: `sab_${state.turn}_${Math.random().toString(36).slice(2, 7)}`,
      turn: state.turn,
      targetScope: 'CONCESSION',
      targetRegionId: session.regionId,
      targetCompanyId: session.targetOwnerCompanyId,
      direction: session.direction,
      executedVia: 'MINIGAME',
      outcome: 'CAUGHT',
      costPaid: session.upfrontCost,
      finePaidByPlayer: session.caughtFineCost,
      ownerFineApplied: 0,
    };

    const caughtLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'GEOPOLITICS',
      `Lebukás a kormányzati adatközpontban: ${regionStatic.shortCode}`,
      `A biztonsági kamerák észlelték a behatolót! Büntetés: -${formatCurrency(session.caughtFineCost)}, és a régió ${session.lockdownMonths} hónapos zárolás alá került.`,
      'sabotage_caught',
      {
        regionId: session.regionId,
        fineAmount: session.caughtFineCost,
        months: session.lockdownMonths,
      }
    );

    return {
      ...state,
      screen: 'PLAYING',
      sabotageSession: null,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      sabotageHistory: [opRecord, ...(state.sabotageHistory ?? [])].slice(0, 50),
      currentTurnLedger: {
        ...baseLedger,
        sabotageFineCost:
          (baseLedger.sabotageFineCost ?? 0) + session.caughtFineCost,
      },
      newsLog: [caughtLog, ...state.newsLog].slice(0, 80),
    };
  }

  // SUCCESS: Apply production hack & optional owner fine + 3-month regional lockdown
  const ownerId = regionRt.ownerCompanyId ?? session.targetOwnerCompanyId;
  const ownerFine = session.effectConfig.ownerFine;

  let nextCompanies = [...state.companies];
  if (ownerFine > 0 && ownerId) {
    nextCompanies = nextCompanies.map((c) =>
      c.id === ownerId
        ? {
            ...c,
            cash: c.cash - ownerFine,
            totalExpenses: c.totalExpenses + ownerFine,
          }
        : c
    );
  }

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [session.regionId]: {
      ...regionRt,
      activeHack: {
        direction: session.direction,
        outputMultiplier: session.effectConfig.outputMultiplier,
        turnsRemaining: session.effectConfig.durationMonths,
        label: session.effectConfig.label,
        executedVia: 'MINIGAME',
      },
      sabotageLockdownTurns: session.lockdownMonths,
    },
  };

  nextCompanies = nextCompanies.map((c) => ({
    ...c,
    netWorth: calculateCompanyNetWorth(c, nextRegions, state.wells, state.market),
  }));

  const targetOwner = nextCompanies.find((c) => c.id === ownerId);
  const opRecord: SabotageOperationRecord = {
    id: `sab_${state.turn}_${Math.random().toString(36).slice(2, 7)}`,
    turn: state.turn,
    targetScope: 'CONCESSION',
    targetRegionId: session.regionId,
    targetCompanyId: ownerId,
    direction: session.direction,
    executedVia: 'MINIGAME',
    outcome: 'SUCCESS',
    costPaid: session.upfrontCost,
    finePaidByPlayer: 0,
    ownerFineApplied: ownerFine,
  };

  const pctDelta = Math.round((session.effectConfig.outputMultiplier - 1) * 100);
  const successLog = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    session.direction === 'SABOTAGE' ? 'RIVAL' : 'OPERATIONS',
    `Kormányzati rendszerhekkelés sikeres: ${regionStatic.shortCode}`,
    session.direction === 'BOOST'
      ? `${regionStatic.name} (${targetOwner?.name ?? 'tulajdonos'}): +${pctDelta}% termelési kvótabónusz aktiválva ${session.effectConfig.durationMonths} hónapra.`
      : `${regionStatic.name} (${targetOwner?.name ?? 'tulajdonos'}): ${pctDelta}% termeléscsökkentés (${session.effectConfig.durationMonths} hó) és ${formatCurrency(ownerFine)} hatósági bírság élesítve.`,
    session.direction === 'BOOST'
      ? 'sabotage_success_boost'
      : 'sabotage_success_sabotage',
    {
      regionId: session.regionId,
      pct: pctDelta,
      months: session.effectConfig.durationMonths,
      lockMonths: session.lockdownMonths,
      targetOwner: targetOwner?.name ?? '',
      fineAmount: ownerFine,
    }
  );

  return {
    ...state,
    screen: 'PLAYING',
    sabotageSession: null,
    companies: nextCompanies,
    regions: nextRegions,
    sabotageHistory: [opRecord, ...(state.sabotageHistory ?? [])].slice(0, 50),
    currentTurnLedger:
      ownerId === player.id && ownerFine > 0
        ? {
            ...baseLedger,
            sabotageFineCost: (baseLedger.sabotageFineCost ?? 0) + ownerFine,
          }
        : baseLedger,
    newsLog: [successLog, ...state.newsLog].slice(0, 80),
  };
}

/**
 * Hires an external cyber-mercenary crew ($280,000) to execute the government-system
 * hack immediately without stealth minigame or camera-detection fine risk.
 */
export function hireExternalHackContractor(
  state: GameState,
  regionId: RegionId,
  direction: SabotageEffectDirection
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];

  const dict = getDict();
  if (!regionRt.ownerCompanyId) {
    return {
      state,
      error: dict.engineErrors.sabotageFreeRegionBlocked,
    };
  }
  if ((regionRt.sabotageLockdownTurns ?? 0) > 0) {
    return {
      state,
      error: interpolate(dict.engineErrors.sabotageRegionLocked, {
        turns: regionRt.sabotageLockdownTurns ?? 0,
      }),
    };
  }
  const hackerContractorCost = getSabotageContractorCost(state.difficulty);
  if (player.cash < hackerContractorCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashExternalHacker, {
        cost: formatCurrency(hackerContractorCost),
      }),
    };
  }

  const effectConfig = getSabotageEffectConfig(state.difficulty, direction);
  const ownerId = regionRt.ownerCompanyId;
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      activeHack: {
        direction,
        outputMultiplier: effectConfig.outputMultiplier,
        turnsRemaining: effectConfig.durationMonths,
        label: effectConfig.label,
        executedVia: 'CONTRACTOR',
      },
      sabotageLockdownTurns: SABOTAGE_LOCKDOWN_MONTHS,
    },
  };

  let nextCompanies = state.companies.map((c) => {
    let cash = c.cash;
    let totalExpenses = c.totalExpenses;
    if (c.id === player.id) {
      cash -= hackerContractorCost;
      totalExpenses += hackerContractorCost;
    }
    if (effectConfig.ownerFine > 0 && c.id === ownerId) {
      cash -= effectConfig.ownerFine;
      totalExpenses += effectConfig.ownerFine;
    }
    return { ...c, cash, totalExpenses };
  });

  nextCompanies = nextCompanies.map((c) => ({
    ...c,
    netWorth: calculateCompanyNetWorth(c, nextRegions, state.wells, state.market),
  }));

  const targetOwner = nextCompanies.find((c) => c.id === ownerId);
  const opRecord: SabotageOperationRecord = {
    id: `sab_${state.turn}_${Math.random().toString(36).slice(2, 7)}`,
    turn: state.turn,
    targetScope: 'CONCESSION',
    targetRegionId: regionId,
    targetCompanyId: ownerId,
    direction,
    executedVia: 'CONTRACTOR',
    outcome: 'SUCCESS',
    costPaid: hackerContractorCost,
    finePaidByPlayer: 0,
    ownerFineApplied: effectConfig.ownerFine,
  };

  const pctDelta = Math.round((effectConfig.outputMultiplier - 1) * 100);
  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    direction === 'SABOTAGE' ? 'RIVAL' : 'OPERATIONS',
    `Külső hekker-beavatkozás kész: ${regionStatic.shortCode}`,
    direction === 'BOOST'
      ? `${regionStatic.name} (${targetOwner?.name ?? 'tulajdonos'}): külső csoport aktiválta a +${pctDelta}% termelési bónuszt ${effectConfig.durationMonths} hónapra (${formatCurrency(hackerContractorCost)}).`
      : `${regionStatic.name} (${targetOwner?.name ?? 'tulajdonos'}): külső csoport élesítette a ${pctDelta}% termeléscsökkentést (${effectConfig.durationMonths} hó) és ${formatCurrency(effectConfig.ownerFine)} bírságot.`,
    direction === 'BOOST'
      ? 'sabotage_external_boost'
      : 'sabotage_external_sabotage',
    {
      regionId,
      pct: pctDelta,
      months: effectConfig.durationMonths,
      costAmount: hackerContractorCost,
      lockMonths: SABOTAGE_LOCKDOWN_MONTHS,
      targetOwner: targetOwner?.name ?? '',
      fineAmount: effectConfig.ownerFine,
    }
  );

  return {
    state: {
      ...state,
      companies: nextCompanies,
      regions: nextRegions,
      sabotageHistory: [opRecord, ...(state.sabotageHistory ?? [])].slice(0, 50),
      currentTurnLedger: {
        ...baseLedger,
        sabotageCost: (baseLedger.sabotageCost ?? 0) + hackerContractorCost,
        sabotageFineCost:
          (baseLedger.sabotageFineCost ?? 0) +
          (ownerId === player.id ? effectConfig.ownerFine : 0),
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

/**
 * Starts the onshore Geological Core Sample chemical & pressure ordering lab operation.
 */
export function startCoreSampleAnalysis(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const regionWells = state.wells.filter((w) => w.regionId === regionId);

  const dict = getDict();
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.notYourConcessionCore };
  }
  if (regionStatic.offshore) {
    return {
      state,
      error: dict.engineErrors.noCoreOnOffshore,
    };
  }
  if (regionWells.length >= regionStatic.maxWellsAllowed) {
    return {
      state,
      error: dict.engineErrors.maxWellsReached,
    };
  }
  if (regionRt.coreSampleReport && !regionRt.coreSampleReport.consumed) {
    return {
      state,
      error: dict.engineErrors.coreAlreadyReady,
    };
  }

  const cfg = getCoreSampleConfig(state.difficulty);
  if (player.cash < cfg.ownTeamCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashCore, {
        cost: formatCurrency(cfg.ownTeamCost),
      }),
    };
  }

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - cfg.ownTeamCost,
    totalExpenses: player.totalExpenses + cfg.ownTeamCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    state.regions,
    state.wells,
    state.market
  );

  const session = buildCoreSampleSession(regionId, state.difficulty);
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);

  return {
    state: {
      ...state,
      screen: 'CORE_SAMPLE_MINIGAME',
      companies: updateCompanyInList(state.companies, nextPlayer),
      coreSampleSession: session,
      currentTurnLedger: {
        ...baseLedger,
        coreSampleCost: (baseLedger.coreSampleCost ?? 0) + cfg.ownTeamCost,
      },
    },
    error: null,
  };
}

/**
 * Completes the Geological Core Sample analysis (SUCCESS, FAILED, or ABORTED).
 */
export function completeCoreSampleAnalysis(
  state: GameState,
  outcome: 'SUCCESS' | 'FAILED' | 'ABORTED'
): GameState {
  const session = state.coreSampleSession;
  if (!session) {
    return {
      ...state,
      screen: 'PLAYING',
      coreSampleSession: null,
    };
  }

  const regionStatic = REGIONS_BY_ID[session.regionId];
  const regionRt = state.regions[session.regionId];
  const player = getPlayerCompany(state);
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);

  const dict = getDict();
  if (outcome === 'ABORTED') {
    const abortLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'OPERATIONS',
      `Magminta-elemzés megszakítva: ${regionStatic.shortCode}`,
      `${regionStatic.name}: a laboratóriumi rétegelemzés félbeszakadt, a befizetett vizsgálati díj elveszett.`,
      'core_sample_aborted',
      { regionId: session.regionId }
    );
    return {
      ...state,
      screen: 'PLAYING',
      coreSampleSession: null,
      newsLog: [abortLog, ...state.newsLog].slice(0, 80),
    };
  }

  if (outcome === 'FAILED') {
    const penalty = session.failPenaltyCost;
    const nextPlayer: Company = {
      ...player,
      cash: player.cash - penalty,
      totalExpenses: player.totalExpenses + penalty,
    };
    const hasMalus = session.failGreenZoneMultiplier < 1.0;
    const malusReport: RegionCoreSampleReport | null = hasMalus
      ? {
          measuredAtTurn: state.turn,
          estimatedWellOutputBbl: regionStatic.baseWellOutputBbl,
          reservoirPressureBar: session.reservoirPressureBar,
          pressureProfileLabel: dict.coreSampleProfiles.MALUS,
          profileKey: 'MALUS',
          greenZoneMultiplier: session.failGreenZoneMultiplier,
          efficiencyBonusPct: 0,
          contractorEfficiencyBonusPct: 0,
          isMalus: true,
          executedVia: 'FAILED_SURVEY',
          consumed: false,
        }
      : regionRt.coreSampleReport ?? null;

    const nextRegions = {
      ...state.regions,
      [session.regionId]: {
        ...regionRt,
        coreSampleReport: malusReport,
      },
    };
    nextPlayer.netWorth = calculateCompanyNetWorth(
      nextPlayer,
      nextRegions,
      state.wells,
      state.market
    );

    const failLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'OPERATIONS',
      `Sikertelen magminta-hitelesítés: ${regionStatic.shortCode}`,
      `${regionStatic.name}: a kőzetrétegek sorrendje hibás maradt.${
        penalty > 0 ? ` Visszazárási pótdíj: -${formatCurrency(penalty)}.` : ''
      }${
        hasMalus
          ? ' A következő kézi fúrás zöld sávja -5%-kal szűkül.'
          : ''
      }`,
      'core_sample_failed',
      {
        regionId: session.regionId,
        penaltyAmount: penalty,
        malusPct: hasMalus
          ? Math.round((1 - session.failGreenZoneMultiplier) * 100) * -1
          : 0,
      }
    );

    return {
      ...state,
      screen: 'PLAYING',
      coreSampleSession: null,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      currentTurnLedger: {
        ...baseLedger,
        coreSampleCost: (baseLedger.coreSampleCost ?? 0) + penalty,
      },
      newsLog: [failLog, ...state.newsLog].slice(0, 80),
    };
  }

  // SUCCESS: Save positive report & drilling boost on the region
  const report: RegionCoreSampleReport = {
    measuredAtTurn: state.turn,
    estimatedWellOutputBbl: session.estimatedWellOutputBbl,
    reservoirPressureBar: session.reservoirPressureBar,
    pressureProfileLabel: session.pressureProfileLabel,
    profileKey: session.profileKey ?? 'BALANCED',
    greenZoneMultiplier: session.greenZoneMultiplier,
    efficiencyBonusPct: session.efficiencyBonusPct,
    contractorEfficiencyBonusPct: session.contractorEfficiencyBonusPct,
    isMalus: false,
    executedVia: 'OWN_TEAM',
    consumed: false,
  };

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [session.regionId]: {
      ...regionRt,
      coreSampleReport: report,
    },
  };

  const marginPct = Math.round((session.greenZoneMultiplier - 1) * 100);
  const successLog = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Magminta-elemzés elkészült: ${regionStatic.shortCode}`,
    `${regionStatic.name}: várható hozam ${formatLocaleNumber(session.estimatedWellOutputBbl, getActiveLanguage())} hordó/hó (${session.reservoirPressureBar} bar). A következő kézi fúrás zöld zónája +${marginPct}%-kal nő, és +${session.efficiencyBonusPct}% hozambónuszt ad.`,
    'core_sample_success',
    {
      regionId: session.regionId,
      pressure: session.reservoirPressureBar,
      margin: marginPct,
      manual: session.efficiencyBonusPct,
      contractor: session.contractorEfficiencyBonusPct,
    }
  );

  return {
    ...state,
    screen: 'PLAYING',
    coreSampleSession: null,
    regions: nextRegions,
    newsLog: [successLog, ...state.newsLog].slice(0, 80),
  };
}

/**
 * Elevated-cost non-interactive alternative to Core Sample Analysis:
 * hires an external geological institute for immediate borehole report & drilling bonus.
 */
export function hireExternalCoreSampleInstitute(
  state: GameState,
  regionId: RegionId
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const regionWells = state.wells.filter((w) => w.regionId === regionId);

  const dict = getDict();
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.notYourConcessionCore };
  }
  if (regionStatic.offshore) {
    return {
      state,
      error: dict.engineErrors.noCoreOnOffshore,
    };
  }
  if (regionWells.length >= regionStatic.maxWellsAllowed) {
    return {
      state,
      error: dict.engineErrors.maxWellsReached,
    };
  }
  if (regionRt.coreSampleReport && !regionRt.coreSampleReport.consumed) {
    return {
      state,
      error: dict.engineErrors.coreAlreadyReady,
    };
  }

  const cfg = getCoreSampleConfig(state.difficulty);
  if (player.cash < cfg.externalTeamCost) {
    return {
      state,
      error: interpolate(dict.engineErrors.insufficientCashExternalGeo, {
        cost: formatCurrency(cfg.externalTeamCost),
      }),
    };
  }

  const previewSession = buildCoreSampleSession(regionId, state.difficulty);
  const estOutput = Math.round(
    regionStatic.baseWellOutputBbl * (1 + cfg.externalEfficiencyBonusPct / 100)
  );

  const report: RegionCoreSampleReport = {
    measuredAtTurn: state.turn,
    estimatedWellOutputBbl: estOutput,
    reservoirPressureBar: previewSession.reservoirPressureBar,
    pressureProfileLabel: previewSession.pressureProfileLabel,
    profileKey: previewSession.profileKey ?? 'BALANCED',
    greenZoneMultiplier: cfg.externalGreenZoneMultiplier,
    efficiencyBonusPct: cfg.externalEfficiencyBonusPct,
    contractorEfficiencyBonusPct: cfg.externalContractorEfficiencyBonusPct,
    isMalus: false,
    executedVia: 'EXTERNAL_TEAM',
    consumed: false,
  };

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      coreSampleReport: report,
    },
  };

  const nextPlayer: Company = {
    ...player,
    cash: player.cash - cfg.externalTeamCost,
    totalExpenses: player.totalExpenses + cfg.externalTeamCost,
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    state.wells,
    state.market
  );

  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  const extMarginPct = Math.round((cfg.externalGreenZoneMultiplier - 1) * 100);
  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    `Külső geológiai jelentés kész: ${regionStatic.shortCode}`,
    `${regionStatic.name}: külső intézet felmérte a rezervoárt (${formatLocaleNumber(estOutput, getActiveLanguage())} hordó/hó, ${formatCurrency(cfg.externalTeamCost)}). Következő fúrási bónusz: +${extMarginPct}% célzóna, +${cfg.externalEfficiencyBonusPct}% hozam.`,
    'core_sample_external',
    {
      regionId,
      costAmount: cfg.externalTeamCost,
      pressure: previewSession.reservoirPressureBar,
      margin: extMarginPct,
      manual: cfg.externalEfficiencyBonusPct,
      contractor: cfg.externalContractorEfficiencyBonusPct,
    }
  );

  return {
    state: {
      ...state,
      companies: updateCompanyInList(state.companies, nextPlayer),
      regions: nextRegions,
      currentTurnLedger: {
        ...baseLedger,
        coreSampleCost: (baseLedger.coreSampleCost ?? 0) + cfg.externalTeamCost,
      },
      newsLog: [log, ...state.newsLog].slice(0, 80),
    },
    error: null,
  };
}

/**
 * Applies Tanker Rescue economic, crisis-duration, and barrel-salvage resolution.
 */
function resolveTankerRescueOutcome(
  state: GameState,
  regionId: RegionId,
  eventId: string,
  mode: 'OWN_WIN' | 'OWN_FAIL' | 'EXTERNAL_WIN'
): GameState {
  const event = state.activeEvents.find((ev) => ev.id === eventId);
  if (!event) {
    return {
      ...state,
      screen: 'PLAYING',
      tankerSession: null,
      pendingTankerRescuePrompt: null,
    };
  }

  const regionStatic = REGIONS_BY_ID[regionId];
  const regionRt = state.regions[regionId];
  const player = getPlayerCompany(state);
  const baseLedger = state.currentTurnLedger ?? createEmptyTurnLedger(player.cash);
  const baseRepair = event.ownerRepairCost ?? 0;
  const isStormOnly = event.id.startsWith('storm_disruption') && baseRepair <= 0;
  const cfg = getTankerRescueConfig(state.difficulty, baseRepair, isStormOnly);

  if (mode === 'OWN_FAIL') {
    const extraPenalty = cfg.failExtraPenaltyCost;
    const nextPlayer: Company = {
      ...player,
      cash: player.cash - extraPenalty,
      totalExpenses: player.totalExpenses + extraPenalty,
    };
    const nextEvents = state.activeEvents.map((ev) =>
      ev.id === eventId
        ? {
            ...ev,
            rescueAttempted: true,
            rescueOutcome: 'FAILED' as const,
            ownerRepairCost: cfg.failTotalCrisisCost,
          }
        : ev
    );
    nextPlayer.netWorth = calculateCompanyNetWorth(
      nextPlayer,
      state.regions,
      state.wells,
      state.market
    );

    const failLog = createLogEntry(
      state.turn,
      state.startYear,
      state.startMonth,
      'GEOPOLITICS',
      `Tankermentés sikertelen: ${regionStatic.shortCode}`,
      `${regionStatic.name}: a manőver meghiúsult, ${cfg.failMultiplier}× környezetvédelmi kártérítés lépett életbe (pótbírság: -${formatCurrency(extraPenalty)}).`,
      'tanker_rescue_failed',
      {
        regionId,
        mult: cfg.failMultiplier,
        excessAmount: extraPenalty,
      }
    );

    return {
      ...state,
      screen: 'PLAYING',
      tankerSession: null,
      pendingTankerRescuePrompt: null,
      companies: updateCompanyInList(state.companies, nextPlayer),
      activeEvents: nextEvents,
      currentTurnLedger: {
        ...baseLedger,
        crisisRescueCost: (baseLedger.crisisRescueCost ?? 0) + extraPenalty,
      },
      newsLog: [failLog, ...state.newsLog].slice(0, 80),
    };
  }

  const recoveryRatio =
    mode === 'OWN_WIN' ? cfg.recoveryRatio : cfg.externalRecoveryRatio;

  // Cash adjustment: OWN_WIN refunds billed base repair (bringing net fine to $0);
  // EXTERNAL_WIN charges the elevated external rescue fleet contract fee.
  const cashRefund = mode === 'OWN_WIN' ? baseRepair : 0;
  const externalFee = mode === 'EXTERNAL_WIN' ? cfg.externalFleetFee : 0;

  // Mitigate remaining crisis duration & output penalty
  const nextTurnsRemaining =
    event.turnsRemaining > 1
      ? Math.max(1, Math.floor(event.turnsRemaining / 2))
      : event.turnsRemaining;
  const nextProdModifier = Number(
    Math.min(
      1.0,
      event.productionModifier + (1 - event.productionModifier) * recoveryRatio
    ).toFixed(2)
  );

  // Salvage spilled oil and disrupted monthly extraction up to tank capacity & reserves
  const cap = getRegionStorageCapacity(regionId, regionRt);
  const freeSpace = Math.max(0, cap - regionRt.storedBarrels);
  const spillCandidate = Math.round(
    (event.spilledBarrelsAmount ?? 0) * recoveryRatio
  );
  const actualSpillRecovered = Math.min(spillCandidate, freeSpace);
  const remainingSpaceAfterSpill = Math.max(0, freeSpace - actualSpillRecovered);
  const prodCandidate = Math.round(
    (event.lostProductionBarrels ?? 0) * recoveryRatio
  );
  const actualProdRecovered = Math.min(
    prodCandidate,
    remainingSpaceAfterSpill,
    regionRt.remainingReservesBbl
  );
  const totalBarrelsRecovered = actualSpillRecovered + actualProdRecovered;

  const nextRegions: Record<RegionId, RegionRuntimeState> = {
    ...state.regions,
    [regionId]: {
      ...regionRt,
      storedBarrels: regionRt.storedBarrels + totalBarrelsRecovered,
      remainingReservesBbl: Math.max(
        0,
        regionRt.remainingReservesBbl - actualProdRecovered
      ),
      activeCrisisTurns: nextTurnsRemaining,
      crisisOutputMultiplier: nextProdModifier,
    },
  };

  const nextEvents = state.activeEvents.map((ev) =>
    ev.id === eventId
      ? {
          ...ev,
          rescueAttempted: true,
          rescueOutcome:
            mode === 'OWN_WIN'
              ? ('SUCCESS' as const)
              : ('EXTERNAL_TEAM' as const),
          turnsRemaining: nextTurnsRemaining,
          productionModifier: nextProdModifier,
          ownerRepairCost: mode === 'OWN_WIN' ? 0 : ev.ownerRepairCost,
        }
      : ev
  );

  const nextPlayer: Company = {
    ...player,
    cash: player.cash + cashRefund - externalFee,
    totalExpenses: Math.max(0, player.totalExpenses - cashRefund + externalFee),
  };
  nextPlayer.netWorth = calculateCompanyNetWorth(
    nextPlayer,
    nextRegions,
    state.wells,
    state.market
  );

  const log = createLogEntry(
    state.turn,
    state.startYear,
    state.startMonth,
    'OPERATIONS',
    mode === 'OWN_WIN'
      ? `Sikeres tankermentés: ${regionStatic.shortCode}`
      : `Külső mentőflotta bevetve: ${regionStatic.shortCode}`,
    mode === 'OWN_WIN'
      ? `${regionStatic.name}: a hajó biztonságba ért! ${
          cashRefund > 0
            ? `Válságbírság jóváírva (+${formatCurrency(cashRefund)}, nettó $0), `
            : 'Bírság elhárítva ($0), '
        }kitermelési szorzó ${Math.round(nextProdModifier * 100)}%${
          totalBarrelsRecovered > 0
            ? `, +${formatLocaleNumber(totalBarrelsRecovered, getActiveLanguage())} hordó megmentve`
            : ''
        }.`
      : `${regionStatic.name}: külső mentőflotta elhárította a kár nagyját (${formatCurrency(externalFee)}). Kitermelési szorzó ${Math.round(nextProdModifier * 100)}%${
          totalBarrelsRecovered > 0
            ? `, +${formatLocaleNumber(totalBarrelsRecovered, getActiveLanguage())} hordó megmentve`
            : ''
        }.`,
    mode === 'OWN_WIN' ? 'tanker_rescue_success' : 'tanker_rescue_external',
    {
      regionId,
      refundAmount: cashRefund,
      pct: Math.round(recoveryRatio * 100),
      barrelsBbl: totalBarrelsRecovered,
      costAmount: externalFee,
    }
  );

  return {
    ...state,
    screen: 'PLAYING',
    tankerSession: null,
    pendingTankerRescuePrompt: null,
    companies: updateCompanyInList(state.companies, nextPlayer),
    regions: nextRegions,
    activeEvents: nextEvents,
    currentTurnLedger: {
      ...baseLedger,
      crisisRescueRefund: (baseLedger.crisisRescueRefund ?? 0) + cashRefund,
      crisisRescueCost: (baseLedger.crisisRescueCost ?? 0) + externalFee,
    },
    newsLog: [log, ...state.newsLog].slice(0, 80),
  };
}

export function startTankerRescueOperation(
  state: GameState,
  regionId: RegionId,
  eventId: string
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionRt = state.regions[regionId];
  const event = state.activeEvents.find(
    (ev) => ev.id === eventId && ev.affectedRegionId === regionId
  );

  const dict = getDict();
  if (regionRt.ownerCompanyId !== player.id) {
    return {
      state,
      error: dict.engineErrors.tankerNotOwnedRegion,
    };
  }
  if (!event || !isTankerRescueEligibleEventId(event.id)) {
    return {
      state,
      error: dict.engineErrors.tankerCrisisUnavailable,
    };
  }
  if (event.rescueAttempted) {
    return {
      state,
      error: dict.engineErrors.tankerAlreadyHandled,
    };
  }

  const session = buildTankerNavigationSession({
    regionId,
    eventId: event.id,
    eventTitle: event.title,
    baseEventRepairCost: event.ownerRepairCost ?? 0,
    difficulty: state.difficulty,
  });

  return {
    state: {
      ...state,
      screen: 'TANKER_MINIGAME',
      tankerSession: session,
      pendingTankerRescuePrompt: null,
    },
    error: null,
  };
}

export function completeTankerRescueOperation(
  state: GameState,
  outcome: 'SUCCESS' | 'FAILED'
): GameState {
  const session = state.tankerSession;
  if (!session) {
    return {
      ...state,
      screen: 'PLAYING',
      tankerSession: null,
    };
  }

  return resolveTankerRescueOutcome(
    state,
    session.regionId,
    session.eventId,
    outcome === 'SUCCESS' ? 'OWN_WIN' : 'OWN_FAIL'
  );
}

export function hireExternalTankerRescueFleet(
  state: GameState,
  regionId: RegionId,
  eventId: string
): { state: GameState; error: string | null } {
  const player = getPlayerCompany(state);
  const regionRt = state.regions[regionId];
  const event = state.activeEvents.find(
    (ev) => ev.id === eventId && ev.affectedRegionId === regionId
  );

  const dict = getDict();
  if (regionRt.ownerCompanyId !== player.id) {
    return { state, error: dict.engineErrors.tankerInvalidFleetRegion };
  }
  if (!event || !isTankerRescueEligibleEventId(event.id)) {
    return { state, error: dict.engineErrors.tankerCrisisUnavailable };
  }
  if (event.rescueAttempted) {
    return { state, error: dict.engineErrors.tankerAlreadyHandled };
  }

  const baseRepair = event.ownerRepairCost ?? 0;
  const isStormOnly = event.id.startsWith('storm_disruption') && baseRepair <= 0;
  const cfg = getTankerRescueConfig(state.difficulty, baseRepair, isStormOnly);

  if (player.cash < cfg.externalFleetFee) {
    return {
      state,
      error: interpolate(dict.engineErrors.tankerInsufficientCashFleet, {
        cost: formatCurrency(cfg.externalFleetFee),
      }),
    };
  }

  return {
    state: resolveTankerRescueOutcome(state, regionId, eventId, 'EXTERNAL_WIN'),
    error: null,
  };
}

export function dismissTankerRescuePrompt(state: GameState): GameState {
  return {
    ...state,
    pendingTankerRescuePrompt: null,
  };
}

/**
 * Executes autonomous monthly decisions for the 3 AI rival corporations.
 */
function runAiRivalActions(
  companies: Company[],
  regions: Record<RegionId, RegionRuntimeState>,
  wells: OilWell[],
  spotPrice: number,
  turn: number,
  startYear: number,
  startMonth: number,
  difficulty: DifficultyLevel
): {
  companies: Company[];
  regions: Record<RegionId, RegionRuntimeState>;
  wells: OilWell[];
  logs: NewsLogEntry[];
} {
  let nextCompanies = [...companies];
  const nextRegions: Record<RegionId, RegionRuntimeState> = { ...regions };
  const nextWells = [...wells];
  const logs: NewsLogEntry[] = [];

  const aiDrillCostMult =
    difficulty === 'EASY' ? 0.97 : difficulty === 'HARD' ? 1.15 : 1.21;
  const aiEfficiencyBonusPct =
    difficulty === 'EASY' ? 4 : difficulty === 'HARD' ? 1 : 3;

  for (let idx = 0; idx < nextCompanies.length; idx++) {
    let ai = { ...nextCompanies[idx] };
    if (ai.isPlayer) continue;

    const ownedRegionStatics = REGIONS_DATA.filter(
      (r) => nextRegions[r.id].ownerCompanyId === ai.id
    );
    const aiTotalWells = nextWells.filter((w) => w.ownerCompanyId === ai.id);

    // 0. Draw modest credit if under-scaled and short on cash
    const minLoanTrigger = difficulty === 'HARD' ? 680000 : 550000;
    const creditChunk = difficulty === 'HARD' ? 500000 : 400000;
    if (
      (ownedRegionStatics.length === 0 || aiTotalWells.length < 2) &&
      ai.cash < minLoanTrigger &&
      ai.creditLimit - ai.debt >= creditChunk
    ) {
      ai.cash += creditChunk;
      ai.debt += creditChunk;
    }

    // 1. Sell stored oil depending on personality and spot price
    const sellThreshold =
      difficulty === 'HARD'
        ? ai.personality === 'CONSERVATIVE_SPECULATOR'
          ? 68
          : ai.personality === 'CARTEL_BALANCER'
            ? 58
            : 46
        : ai.personality === 'CONSERVATIVE_SPECULATOR'
          ? 74
          : ai.personality === 'CARTEL_BALANCER'
            ? 60
            : 46;

    for (const rStatic of ownedRegionStatics) {
      const rt = nextRegions[rStatic.id];
      const cap = getRegionStorageCapacity(rStatic.id, rt);
      const mustClearTank = cap > 0 && rt.storedBarrels >= cap * 0.85;

      if (
        rt.storedBarrels > 0 &&
        (spotPrice >= sellThreshold || mustClearTank || ai.cash < 260000)
      ) {
        const sellRatio =
          spotPrice >= sellThreshold + 12 ? 1.0 : mustClearTank ? 0.75 : 0.55;
        const barrelsToSell = Math.round(rt.storedBarrels * sellRatio);
        if (barrelsToSell > 0) {
          const proceeds = calculateSaleProceeds(
            barrelsToSell,
            spotPrice,
            rStatic.id,
            rt.crisisPriceMultiplier ?? 1.0
          );
          nextRegions[rStatic.id] = {
            ...rt,
            storedBarrels: rt.storedBarrels - barrelsToSell,
          };
          ai.cash += proceeds;
          ai.totalRevenue += proceeds;
          ai.totalBarrelsSold += barrelsToSell;
        }
      }
    }

    // 2. Ensure storage tank exists before wells overflow
    for (const rStatic of ownedRegionStatics) {
      const rt = nextRegions[rStatic.id];
      const aiWellsInRegion = nextWells.filter(
        (w) => w.regionId === rStatic.id && w.ownerCompanyId === ai.id
      );
      const neededTanks = Math.max(1, Math.ceil(aiWellsInRegion.length * 0.7));
      if (
        rt.tanksCount < neededTanks &&
        rt.tanksCount < rStatic.maxTanksAllowed &&
        ai.cash >= rStatic.tankBuildCost + 110000
      ) {
        ai.cash -= rStatic.tankBuildCost;
        ai.totalExpenses += rStatic.tankBuildCost;
        nextRegions[rStatic.id] = {
          ...rt,
          tanksCount: rt.tanksCount + 1,
        };
      }
    }

    // 3. Drill new wells in owned regions if profitable
    const cashBuffer =
      difficulty === 'HARD'
        ? ai.personality === 'AGGRESSIVE_EXPANSIONIST'
          ? 140000
          : 220000
        : ai.personality === 'AGGRESSIVE_EXPANSIONIST'
          ? 140000
          : 240000;
    let drilledNow = 0;

    for (const rStatic of ownedRegionStatics) {
      if (drilledNow >= 1) break;
      const rt = nextRegions[rStatic.id];
      const regionWells = nextWells.filter((w) => w.regionId === rStatic.id);
      const drillCost = Math.round(rStatic.drillingBaseCost * aiDrillCostMult);
      if (
        rt.tanksCount > 0 &&
        regionWells.length < rStatic.maxWellsAllowed &&
        ai.cash >= drillCost + cashBuffer &&
        rt.remainingReservesBbl > rStatic.baseWellOutputBbl * 12
      ) {
        ai.cash -= drillCost;
        ai.totalExpenses += drillCost;
        nextWells.push({
          id: `well_${rStatic.id}_${turn}_${ai.id}_${regionWells.length + 1}`,
          regionId: rStatic.id,
          ownerCompanyId: ai.id,
          name: `${rStatic.shortCode}-${regionWells.length + 1} Kút`,
          maxMonthlyOutputBbl: rStatic.baseWellOutputBbl,
          productionQuotaPct:
            ai.personality === 'CARTEL_BALANCER' && spotPrice < 40 ? 60 : 100,
          status: 'ACTIVE',
          efficiencyBonusPct: aiEfficiencyBonusPct,
          builtAtTurn: turn,
          totalExtractedBbl: 0,
        });
        drilledNow += 1;
      }
    }

    // 4. Buy an unowned region concession if cash allows
    const maxRegionsDesired =
      difficulty === 'EASY'
        ? ai.personality === 'AGGRESSIVE_EXPANSIONIST'
          ? 3
          : 2
        : difficulty === 'HARD'
          ? ai.personality === 'AGGRESSIVE_EXPANSIONIST'
            ? 5
            : 4
          : 4;
    if (ownedRegionStatics.length < maxRegionsDesired) {
      const unowned = REGIONS_DATA.filter(
        (r) =>
          nextRegions[r.id].ownerCompanyId === null &&
          ai.cash >= r.concessionBasePrice + r.tankBuildCost + 160000
      );
      if (unowned.length > 0) {
        unowned.sort((a, b) => {
          const scoreA = a.baseWellOutputBbl / a.concessionBasePrice;
          const scoreB = b.baseWellOutputBbl / b.concessionBasePrice;
          return scoreB - scoreA;
        });
        const target =
          ai.personality === 'CONSERVATIVE_SPECULATOR'
            ? unowned.find((r) => r.politicalStability >= 75) ?? unowned[0]
            : unowned[0];

        ai.cash -= target.concessionBasePrice;
        ai.totalExpenses += target.concessionBasePrice;
        nextRegions[target.id] = {
          ...nextRegions[target.id],
          ownerCompanyId: ai.id,
        };
        logs.push(
          createLogEntry(
            turn,
            startYear,
            startMonth,
            'RIVAL',
            `Rivális terjeszkedés: ${ai.name}`,
            `A versenytárs megvásárolta a(z) ${target.name} koncesszióját.`,
            'ai_concession_acquired',
            {
              companyName: ai.name,
              regionId: target.id,
            }
          )
        );
      }
    }

    nextCompanies[idx] = ai;
  }

  return {
    companies: nextCompanies,
    regions: nextRegions,
    wells: nextWells,
    logs,
  };
}

/**
 * Advances the simulation by one full month: extraction, OPEX/storage billing,
 * AI rival decisions, market cycle updates, geopolitical events, and victory/bankruptcy checks.
 */
export function advanceMonthlyTurn(state: GameState): GameState {
  const nextTurn = state.turn + 1;
  const newLogs: NewsLogEntry[] = [];

  // Track starting cash per company to compute monthly profit delta
  const startingCashById: Record<string, number> = {};
  const monthlyProdById: Record<string, number> = {};
  for (const c of state.companies) {
    startingCashById[c.id] = c.cash;
    monthlyProdById[c.id] = 0;
  }

  const playerBeforeClose = getPlayerCompany(state);
  const activeLedger =
    state.currentTurnLedger ?? createEmptyTurnLedger(playerBeforeClose.cash);
  let playerCrisisRepairCost = 0;
  let playerWellOpexCost = 0;
  let playerStorageCost = 0;
  let playerDebtInterestCost = 0;

  // 1. Geopolitical events tick & guaranteed annual regional crises + repair cost billing
  const geoResult = evaluateGeopoliticalEvents(
    state.activeEvents,
    state.regions,
    nextTurn,
    state.regionalCrisesInYear ?? 0,
    state.difficulty
  );
  let workingRegions = geoResult.nextRegions;
  let nextEvents = geoResult.nextEvents;
  let workingCompanies = [...state.companies];
  const spilledByEventId: Record<string, number> = {};

  for (const spawnedEv of geoResult.newEvents) {
    let eventDetail = spawnedEv.description;
    const regionId = spawnedEv.affectedRegionId;
    let effectiveCrisisCost = spawnedEv.ownerRepairCost ?? 0;

    if (regionId) {
      const rt = workingRegions[regionId];

      // Event-specific immediate regional operational impact
      if (spawnedEv.id.startsWith('tanker_oil_spill') && rt.storedBarrels > 0) {
        const spilledBarrels = Math.min(
          rt.storedBarrels,
          Math.max(1, Math.round(rt.storedBarrels * 0.12))
        );
        spilledByEventId[spawnedEv.id] = spilledBarrels;
        workingRegions[regionId] = {
          ...rt,
          storedBarrels: rt.storedBarrels - spilledBarrels,
        };
        eventDetail += ` Rakományvesztés: ${formatLocaleNumber(spilledBarrels, getActiveLanguage())} hordó kifolyt a tárolókból.`;
      } else if (spawnedEv.id.startsWith('scada_cyberattack')) {
        workingRegions[regionId] = {
          ...rt,
          sabotageLockdownTurns: Math.max(rt.sabotageLockdownTurns ?? 0, 3),
          activeHack:
            rt.activeHack?.direction === 'BOOST' ? null : (rt.activeHack ?? null),
        };
        eventDetail +=
          ' A hatóságok 2 hónapos rendszerzárolást és az aktív kvótamódosítások törlését rendelték el.';
      }

      const ownerId = workingRegions[regionId].ownerCompanyId;

      // Environmental fine scales with industrial footprint (wells & storage tanks)
      if (spawnedEv.id.startsWith('environmental_fine') && ownerId) {
        const activeRegionWellsCount = state.wells.filter(
          (w) =>
            w.regionId === regionId &&
            w.ownerCompanyId === ownerId &&
            w.status !== 'DEPLETED'
        ).length;
        const tanksCount = workingRegions[regionId].tanksCount;
        effectiveCrisisCost += activeRegionWellsCount * 25000 + tanksCount * 10000;
      }

      if (effectiveCrisisCost > 0 && ownerId) {
        if (ownerId === state.playerCompanyId) {
          playerCrisisRepairCost += effectiveCrisisCost;
        }
        workingCompanies = workingCompanies.map((c) =>
          c.id === ownerId
            ? {
                ...c,
                cash: c.cash - effectiveCrisisCost,
                totalExpenses: c.totalExpenses + effectiveCrisisCost,
              }
            : c
        );
        const ownerCompany = workingCompanies.find((c) => c.id === ownerId);
        eventDetail += ` Rendkívüli költség (${ownerCompany?.name ?? 'tulajdonos'}): -${formatCurrency(effectiveCrisisCost)}.`;
      }
    }

    const eventTemplateId =
      spawnedEv.templateId ?? extractEventTemplateId(spawnedEv.id) ?? '';
    newLogs.push(
      createLogEntry(
        nextTurn,
        state.startYear,
        state.startMonth,
        'GEOPOLITICS',
        spawnedEv.title,
        eventDetail,
        regionId ? 'geo_event_regional' : 'geo_event_global',
        regionId
          ? {
              eventTemplateId,
              regionId,
              repairCostAmount: effectiveCrisisCost,
              priceMultPct: Math.round(
                (spawnedEv.regionalPriceMultiplier ?? 1) * 100
              ),
              spilledBbl: spilledByEventId[spawnedEv.id] ?? 0,
            }
          : { eventTemplateId }
      )
    );
  }

  // 2. Run AI rival strategic actions before monthly production closes
  const aiResult = runAiRivalActions(
    workingCompanies,
    workingRegions,
    state.wells,
    state.market.spotPricePerBarrel,
    nextTurn,
    state.startYear,
    state.startMonth,
    state.difficulty
  );
  workingCompanies = aiResult.companies;
  workingRegions = aiResult.regions;
  let workingWells = aiResult.wells;
  newLogs.push(...aiResult.logs);

  // Lookup active regional crisis flags affecting ongoing monthly costs
  const frozenRegionIds = new Set<RegionId>();
  const windfallRoyaltyRegionIds = new Set<RegionId>();
  for (const ev of nextEvents) {
    if (!ev.affectedRegionId) continue;
    if (ev.id.startsWith('arctic_freeze')) {
      frozenRegionIds.add(ev.affectedRegionId);
    } else if (ev.id.startsWith('windfall_royalty_tax')) {
      windfallRoyaltyRegionIds.add(ev.affectedRegionId);
    }
  }

  // 3. Execute monthly oil extraction and OPEX/storage billing
  let totalGlobalProduction = 0;
  let playerStorageOverflowed = false;
  const monthlyExtractedByRegion: Partial<Record<RegionId, number>> = {};
  const monthlyLostPotentialByRegion: Partial<Record<RegionId, number>> = {};

  workingWells = workingWells.map((well) => {
    const regionStatic = REGIONS_BY_ID[well.regionId];
    const rt = workingRegions[well.regionId];

    // Bill monthly OPEX for ACTIVE wells (+45% heating surcharge during arctic freeze)
    if (well.status === 'ACTIVE') {
      const wellOpex = frozenRegionIds.has(well.regionId)
        ? Math.round(regionStatic.wellMonthlyOpex * 1.45)
        : regionStatic.wellMonthlyOpex;
      if (well.ownerCompanyId === state.playerCompanyId) {
        playerWellOpexCost += wellOpex;
      }
      workingCompanies = workingCompanies.map((c) =>
        c.id === well.ownerCompanyId
          ? {
              ...c,
              cash: c.cash - wellOpex,
              totalExpenses: c.totalExpenses + wellOpex,
            }
          : c
      );
    }

    const potentialOutput = calculateWellMonthlyOutput(well, rt);
    const baselineNoCrisisOutput = calculateWellMonthlyOutput(well, {
      ...rt,
      crisisOutputMultiplier: 1.0,
    });
    if (rt.crisisOutputMultiplier < 1.0 && baselineNoCrisisOutput > potentialOutput) {
      monthlyLostPotentialByRegion[well.regionId] =
        (monthlyLostPotentialByRegion[well.regionId] ?? 0) +
        (baselineNoCrisisOutput - potentialOutput);
    }

    if (potentialOutput <= 0) {
      if (rt.remainingReservesBbl <= 0 && well.status !== 'DEPLETED') {
        return { ...well, status: 'DEPLETED' as const };
      }
      return well;
    }

    const storageCap = getRegionStorageCapacity(well.regionId, rt);
    const freeSpace = Math.max(0, storageCap - rt.storedBarrels);
    const actualExtracted = Math.min(potentialOutput, freeSpace);

    if (actualExtracted < potentialOutput && well.ownerCompanyId === state.playerCompanyId) {
      playerStorageOverflowed = true;
    }

    if (actualExtracted > 0) {
      workingRegions[well.regionId] = {
        ...rt,
        storedBarrels: rt.storedBarrels + actualExtracted,
        remainingReservesBbl: Math.max(
          0,
          rt.remainingReservesBbl - actualExtracted
        ),
      };
      monthlyProdById[well.ownerCompanyId] =
        (monthlyProdById[well.ownerCompanyId] ?? 0) + actualExtracted;
      monthlyExtractedByRegion[well.regionId] =
        (monthlyExtractedByRegion[well.regionId] ?? 0) + actualExtracted;
      totalGlobalProduction += actualExtracted;
    }

    const depletedNow = workingRegions[well.regionId].remainingReservesBbl <= 0;
    return {
      ...well,
      totalExtractedBbl: well.totalExtractedBbl + actualExtracted,
      status: depletedNow ? ('DEPLETED' as const) : well.status,
    };
  });

  // Attach spilled & lost production metrics onto newly spawned tanker-eligible events
  nextEvents = nextEvents.map((ev) => {
    if (!ev.affectedRegionId || ev.turn !== nextTurn) return ev;
    if (!isTankerRescueEligibleEventId(ev.id)) return ev;
    const baseRepair = ev.ownerRepairCost ?? 0;
    const isStormOnly = ev.id.startsWith('storm_disruption') && baseRepair <= 0;
    const cfg = getTankerRescueConfig(state.difficulty, baseRepair, isStormOnly);
    return {
      ...ev,
      rescueAttempted: false,
      rescueStakeAmount: cfg.stakeBaseCost,
      spilledBarrelsAmount: spilledByEventId[ev.id] ?? 0,
      lostProductionBarrels: monthlyLostPotentialByRegion[ev.affectedRegionId] ?? 0,
    };
  });

  if (playerStorageOverflowed) {
    newLogs.push(
      createLogEntry(
        nextTurn,
        state.startYear,
        state.startMonth,
        'OPERATIONS',
        'Raktárkapacitás megtelt!',
        'Egy vagy több régiójában megteltek a tartályok, így a felesleges kitermelést vissza kellett fogni. Építsen új tartályt vagy értékesítsen olajat!',
        'storage_overflow',
        {}
      )
    );
  }

  // 4. Storage tank maintenance (+50% heating in frozen regions), windfall royalty surcharge & debt interest (1.5%/month)
  for (const rStatic of REGIONS_DATA) {
    const rt = workingRegions[rStatic.id];
    if (rt.ownerCompanyId && rt.tanksCount > 0) {
      const baseStorageFee = rt.tanksCount * rStatic.monthlyStorageCostPerTank;
      const storageFee = frozenRegionIds.has(rStatic.id)
        ? Math.round(baseStorageFee * 1.5)
        : baseStorageFee;
      if (rt.ownerCompanyId === state.playerCompanyId) {
        playerStorageCost += storageFee;
      }
      workingCompanies = workingCompanies.map((c) =>
        c.id === rt.ownerCompanyId
          ? {
              ...c,
              cash: c.cash - storageFee,
              totalExpenses: c.totalExpenses + storageFee,
            }
          : c
      );
    }

    const extractedInRegion = monthlyExtractedByRegion[rStatic.id] ?? 0;
    if (
      rt.ownerCompanyId &&
      extractedInRegion > 0 &&
      windfallRoyaltyRegionIds.has(rStatic.id)
    ) {
      const royaltySurcharge = Math.round(extractedInRegion * 6.5);
      if (rt.ownerCompanyId === state.playerCompanyId) {
        playerCrisisRepairCost += royaltySurcharge;
      }
      workingCompanies = workingCompanies.map((c) =>
        c.id === rt.ownerCompanyId
          ? {
              ...c,
              cash: c.cash - royaltySurcharge,
              totalExpenses: c.totalExpenses + royaltySurcharge,
            }
          : c
      );
    }
  }

  workingCompanies = workingCompanies.map((c) => {
    const interest = c.debt > 0 ? Math.round(c.debt * 0.015) : 0;
    if (c.id === state.playerCompanyId) {
      playerDebtInterestCost = interest;
    }
    return {
      ...c,
      cash: c.cash - interest,
      totalExpenses: c.totalExpenses + interest,
      lastTurnProductionBbl: monthlyProdById[c.id] ?? 0,
    };
  });

  // 5. Market cycle & spot price update
  const marketRes = advanceMarketCycle(
    state.market,
    totalGlobalProduction,
    nextEvents,
    nextTurn
  );
  if (marketRes.cycleChangedHeadline) {
    newLogs.push(
      createLogEntry(
        nextTurn,
        state.startYear,
        state.startMonth,
        'MARKET',
        'Piaci ciklusváltás',
        marketRes.cycleChangedHeadline,
        marketRes.cycleChangeLogKey ?? 'market_cycle_stable',
        {}
      )
    );
  }

  // Tick down active regional government hacks & security lockdowns after extraction
  for (const rStatic of REGIONS_DATA) {
    const rt = workingRegions[rStatic.id];
    const nextLockdown = Math.max(0, (rt.sabotageLockdownTurns ?? 0) - 1);
    let nextHack = rt.activeHack ?? null;
    if (nextHack) {
      if (nextHack.turnsRemaining <= 1) {
        nextHack = null;
      } else {
        nextHack = {
          ...nextHack,
          turnsRemaining: nextHack.turnsRemaining - 1,
        };
      }
    }
    if (
      nextLockdown !== (rt.sabotageLockdownTurns ?? 0) ||
      nextHack !== (rt.activeHack ?? null)
    ) {
      workingRegions[rStatic.id] = {
        ...rt,
        activeHack: nextHack,
        sabotageLockdownTurns: nextLockdown,
      };
    }
  }

  // 6. Recompute Net Worth, quarterly/annual accumulators, and monthly cashflow delta
  const isQuarterlyClose = nextTurn % 3 === 0;
  const isAnnualClose = nextTurn % 12 === 0;
  const currentDateLabel = formatGameDate(
    state.startYear,
    state.startMonth,
    nextTurn
  );
  const periodMeta = getReportPeriodMeta(
    state.startYear,
    state.startMonth,
    nextTurn
  );

  workingCompanies = workingCompanies.map((c) => {
    const monthlyProfit = Math.round(c.cash - (startingCashById[c.id] ?? c.cash));
    const monthlyProd = monthlyProdById[c.id] ?? 0;
    const netWorth = calculateCompanyNetWorth(
      c,
      workingRegions,
      workingWells,
      marketRes.nextMarket
    );
    const nextAccProd = (c.quarterAccumulatedProductionBbl ?? 0) + monthlyProd;
    const nextAccProfit = (c.quarterAccumulatedProfit ?? 0) + monthlyProfit;
    const nextYearProd = (c.yearAccumulatedProductionBbl ?? 0) + monthlyProd;
    const nextYearProfit = (c.yearAccumulatedProfit ?? 0) + monthlyProfit;

    const existingHistory = c.reportHistory ?? [];
    let nextReport = c.lastPublishedReport;
    let nextHistory = existingHistory;

    if (isQuarterlyClose) {
      const publishedSnapshot: QuarterlyReportSnapshot = {
        reportedAtTurn: nextTurn,
        reportedDateLabel: currentDateLabel,
        periodType: periodMeta.periodType,
        periodLabel: periodMeta.periodLabel,
        cash: c.cash,
        debt: c.debt,
        netWorth,
        quarterlyProductionBbl: nextAccProd,
        quarterlyProfit: nextAccProfit,
        ...(isAnnualClose
          ? {
              annualProductionBbl: nextYearProd,
              annualProfit: nextYearProfit,
            }
          : {}),
      };
      nextReport = publishedSnapshot;
      nextHistory = [...existingHistory, publishedSnapshot];
    }

    return {
      ...c,
      lastTurnProfit: monthlyProfit,
      netWorth,
      quarterAccumulatedProductionBbl: isQuarterlyClose ? 0 : nextAccProd,
      quarterAccumulatedProfit: isQuarterlyClose ? 0 : nextAccProfit,
      yearAccumulatedProductionBbl: isAnnualClose ? 0 : nextYearProd,
      yearAccumulatedProfit: isAnnualClose ? 0 : nextYearProfit,
      lastPublishedReport: nextReport,
      reportHistory: nextHistory,
    };
  });

  if (isQuarterlyClose) {
    const topReportCompany = [...workingCompanies].sort(
      (a, b) => b.netWorth - a.netWorth
    )[0];
    newLogs.push(
      createLogEntry(
        nextTurn,
        state.startYear,
        state.startMonth,
        'MARKET',
        isAnnualClose
          ? `Éves zárójelentések publikálva (${periodMeta.year})`
          : `Negyedéves gyorsjelentések publikálva (${periodMeta.periodLabel})`,
        `A vállalatok közzétették a(z) ${currentDateLabel} havi hivatalos mérlegüket. A jelentések alapján az élen: ${topReportCompany.name} (${formatCurrency(topReportCompany.netWorth)}).`,
        isAnnualClose
          ? 'report_annual_published'
          : 'report_quarterly_published',
        {
          leaderName: topReportCompany.name,
          leaderWorthAmount: topReportCompany.netWorth,
        }
      )
    );
  }

  // Tick down active market analyst assignments
  const nextAnalystMap: Record<string, number> = {};
  for (const [compId, remaining] of Object.entries(
    state.analystAccessTurnsByCompanyId ?? {}
  )) {
    if (remaining > 1) {
      nextAnalystMap[compId] = remaining - 1;
    } else if (remaining === 1) {
      const target = workingCompanies.find((c) => c.id === compId);
      if (target) {
        newLogs.push(
          createLogEntry(
            nextTurn,
            state.startYear,
            state.startMonth,
            'OPERATIONS',
            `Elemzői megbízás lejárt: ${target.name}`,
            'A rivális élő készletei és pénzügyi adatai ismét bizalmas státuszba kerültek.',
            'analyst_expired',
            { targetName: target.name }
          )
        );
      }
    }
  }

  // 7. Check Victory / Time Horizon / Bankruptcy
  const player = workingCompanies.find((c) => c.id === state.playerCompanyId)!;
  let nextScreen = state.screen;
  let gameOverSummary = state.gameOverSummary;

  const sortedByWorth = [...workingCompanies].sort(
    (a, b) => b.netWorth - a.netWorth
  );

  if (player.cash < -player.creditLimit * 0.5) {
    nextScreen = 'GAME_OVER';
    gameOverSummary = {
      reason: 'BANKRUPTCY',
      headline: 'Fizetésképtelenség — Csődeljárás',
      detail: `A ${player.name} tartozásai meghaladták a finanszírozható hitelkeretet, így a hitelezők felszámolták a vállalatot.`,
      winnerCompanyId: sortedByWorth[0].id,
    };
  } else if (
    !state.endlessMode &&
    sortedByWorth[0].netWorth >= state.victoryNetWorthTarget
  ) {
    const leader = sortedByWorth[0];
    nextScreen = 'GAME_OVER';
    gameOverSummary = {
      reason: 'VICTORY_TARGET',
      headline: leader.isPlayer
        ? 'Globális Energetikai Dominancia!'
        : `Piacvezetői vereség: ${leader.name}`,
      detail: leader.isPlayer
        ? `Gratulálunk! A ${player.name} átlépte a ${formatCurrency(state.victoryNetWorthTarget)} célvagyont, és megszerezte a piacvezető szerepet.`
        : `A(z) ${leader.name} Önt megelőzve érte el a ${formatCurrency(state.victoryNetWorthTarget)} célvagyont (${formatCurrency(leader.netWorth)} nettó vagyonnal).`,
      winnerCompanyId: leader.id,
    };
  } else if (!state.endlessMode && nextTurn >= state.maxTurns) {
    nextScreen = 'GAME_OVER';
    const winner = sortedByWorth[0];
    const horizonYears = Math.round(state.maxTurns / 12);
    const horizonLabel =
      horizonYears * 12 === state.maxTurns
        ? `${horizonYears} éves`
        : `${state.maxTurns} hónapos`;
    gameOverSummary = {
      reason: 'TIME_HORIZON',
      headline:
        winner.id === player.id
          ? `${horizonLabel} stratégiai győzelem!`
          : `Lejárt a(z) ${horizonLabel} üzleti ciklus`,
      detail:
        winner.id === player.id
          ? `A(z) ${horizonLabel} ciklus végén a ${player.name} végzett az élen ${formatCurrency(player.netWorth)} nettó vagyonnal.`
          : `A versenyt a ${winner.name} zárta az első helyen ${formatCurrency(winner.netWorth)} vagyonnal.`,
      winnerCompanyId: winner.id,
    };
  }

  const sabotageCost = activeLedger.sabotageCost ?? 0;
  const sabotageFineCost = activeLedger.sabotageFineCost ?? 0;
  const crisisRescueRefund = activeLedger.crisisRescueRefund ?? 0;
  const crisisRescueCost = activeLedger.crisisRescueCost ?? 0;
  const coreSampleCost = activeLedger.coreSampleCost ?? 0;

  const totalInflows =
    activeLedger.oilSalesRevenue +
    activeLedger.bankLoanTaken +
    crisisRescueRefund;
  const closingCostsTotal =
    playerWellOpexCost +
    playerStorageCost +
    playerDebtInterestCost +
    playerCrisisRepairCost;
  const midTurnOutflowsTotal =
    activeLedger.concessionPurchasesCost +
    activeLedger.tankBuildCost +
    activeLedger.drillingCost +
    activeLedger.analystFeesCost +
    sabotageCost +
    sabotageFineCost +
    crisisRescueCost +
    coreSampleCost +
    activeLedger.loanRepaymentCost;
  const totalOutflows = closingCostsTotal + midTurnOutflowsTotal;
  const netCashChange = player.cash - activeLedger.turnStartCash;
  const operatingProfitLoss = activeLedger.oilSalesRevenue - closingCostsTotal;

  const monthlySummary: MonthlyTurnSummary = {
    closedTurn: nextTurn,
    closedDateLabel: currentDateLabel,
    startingCash: activeLedger.turnStartCash,
    endingCash: player.cash,
    endingDebt: player.debt,
    creditLimit: player.creditLimit,
    spotPriceAfterClose: marketRes.nextMarket.spotPricePerBarrel,
    barrelsExtracted: monthlyProdById[player.id] ?? 0,
    barrelsSold: activeLedger.oilBarrelsSold,
    oilSalesRevenue: activeLedger.oilSalesRevenue,
    bankLoanTaken: activeLedger.bankLoanTaken,
    crisisRescueRefund,
    totalInflows,
    wellOpexCost: playerWellOpexCost,
    storageCost: playerStorageCost,
    debtInterestCost: playerDebtInterestCost,
    crisisRepairCost: playerCrisisRepairCost,
    closingCostsTotal,
    concessionPurchasesCost: activeLedger.concessionPurchasesCost,
    tankBuildCost: activeLedger.tankBuildCost,
    drillingCost: activeLedger.drillingCost,
    analystFeesCost: activeLedger.analystFeesCost,
    sabotageCost,
    sabotageFineCost,
    crisisRescueCost,
    coreSampleCost,
    loanRepaymentCost: activeLedger.loanRepaymentCost,
    midTurnOutflowsTotal,
    totalOutflows,
    netCashChange,
    operatingProfitLoss,
  };

  // Trigger turn-transition Tanker Rescue emergency offer if a newly spawned marine/storm
  // crisis struck a player-owned region
  const playerNewTankerEvent = nextEvents.find(
    (ev) =>
      ev.turn === nextTurn &&
      ev.affectedRegionId !== null &&
      workingRegions[ev.affectedRegionId].ownerCompanyId === state.playerCompanyId &&
      isTankerRescueEligibleEventId(ev.id) &&
      !ev.rescueAttempted
  );
  const pendingTankerRescuePrompt: PendingTankerRescuePrompt | null =
    nextScreen === 'PLAYING' && playerNewTankerEvent?.affectedRegionId
      ? {
          regionId: playerNewTankerEvent.affectedRegionId,
          eventId: playerNewTankerEvent.id,
          templateId:
            playerNewTankerEvent.templateId ??
            extractEventTemplateId(playerNewTankerEvent.id) ??
            undefined,
          eventTitle: playerNewTankerEvent.title,
          eventDescription: playerNewTankerEvent.description,
          baseRepairCost: playerNewTankerEvent.ownerRepairCost ?? 0,
          stakeBaseCost:
            playerNewTankerEvent.rescueStakeAmount ??
            playerNewTankerEvent.ownerRepairCost ??
            65000,
          spilledBarrelsAmount: playerNewTankerEvent.spilledBarrelsAmount ?? 0,
          lostProductionBarrels: playerNewTankerEvent.lostProductionBarrels ?? 0,
        }
      : null;

  return {
    ...state,
    screen: nextScreen,
    turn: nextTurn,
    companies: workingCompanies,
    regions: workingRegions,
    wells: workingWells,
    market: marketRes.nextMarket,
    activeEvents: nextEvents,
    newsLog: [...newLogs, ...state.newsLog].slice(0, 80),
    analystAccessTurnsByCompanyId: nextAnalystMap,
    pendingAnnualReportTurn:
      isAnnualClose && nextScreen === 'PLAYING'
        ? nextTurn
        : nextScreen === 'GAME_OVER'
          ? null
          : state.pendingAnnualReportTurn ?? null,
    pendingMonthlySummary: nextScreen === 'PLAYING' ? monthlySummary : null,
    pendingTankerRescuePrompt,
    currentTurnLedger: createEmptyTurnLedger(player.cash),
    regionalCrisesInYear: geoResult.nextRegionalCrisesInYear,
    gameOverSummary,
  };
}
