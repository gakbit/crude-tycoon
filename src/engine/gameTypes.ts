/**
 * Core domain types and interfaces for Crude Tycoon.
 * All code identifiers and comments are strictly in English; UI-facing strings are localized in Hungarian.
 */

export type GameScreenState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'DRILLING_MINIGAME'
  | 'ANALYST_MINIGAME'
  | 'SABOTAGE_MINIGAME'
  | 'TANKER_MINIGAME'
  | 'CORE_SAMPLE_MINIGAME'
  | 'PAUSED'
  | 'GAME_OVER';

export type ActiveTab = 'MAP' | 'MARKET' | 'COMPANIES' | 'NEWS';

export type DifficultyLevel = 'EASY' | 'STANDARD' | 'HARD';

export type MarketCyclePhase = 'BOOM' | 'STABLE' | 'GLUT' | 'CRISIS';

export type AiPersonality =
  | 'AGGRESSIVE_EXPANSIONIST'
  | 'CONSERVATIVE_SPECULATOR'
  | 'CARTEL_BALANCER';

export type RegionId =
  | 'north_sea'
  | 'texas_permian'
  | 'alaska_north_slope'
  | 'gulf_of_mexico'
  | 'orinoco_belt'
  | 'brazil_pre_salt'
  | 'persian_gulf'
  | 'caspian_basin'
  | 'west_siberia'
  | 'niger_delta'
  | 'libyan_sirte'
  | 'angola_offshore'
  | 'sumatra_basin'
  | 'south_china_sea'
  | 'nw_australia'
  | 'carpathian_foothills';

export interface RegionStatic {
  id: RegionId;
  shortCode: string;
  name: string;
  continent: string;
  description: string;
  geologyNote: string;
  /** X coordinate on 1000x500 world map projection */
  mapX: number;
  /** Y coordinate on 1000x500 world map projection */
  mapY: number;
  offshore: boolean;
  concessionBasePrice: number;
  drillingBaseCost: number;
  tankBuildCost: number;
  tankCapacityPerUnit: number;
  monthlyStorageCostPerTank: number;
  wellMonthlyOpex: number;
  /** Multiplier applied to spot price when selling from this region (transport efficiency) */
  logisticsMultiplier: number;
  /** 1 (easy) to 5 (extreme) */
  drillingDifficulty: 1 | 2 | 3 | 4 | 5;
  /** Number of geological strata in the reaction drilling minigame (4 to 6) */
  strataCount: 4 | 5 | 6;
  maxWellsAllowed: number;
  maxTanksAllowed: number;
  estimatedReservesBbl: number;
  /** Political stability index (0-100); lower values raise regional disruption odds */
  politicalStability: number;
  /** Initial maximum monthly well output in barrels for a standard well */
  baseWellOutputBbl: number;
}

export type SabotageTargetScope = 'CONCESSION' | 'COMPANY';

export type SabotageEffectDirection = 'BOOST' | 'SABOTAGE';

export interface ActiveConcessionHack {
  direction: SabotageEffectDirection;
  outputMultiplier: number;
  turnsRemaining: number;
  label: string;
  executedVia: 'MINIGAME' | 'CONTRACTOR';
}

export interface RegionCoreSampleReport {
  measuredAtTurn: number;
  estimatedWellOutputBbl: number;
  reservoirPressureBar: number;
  pressureProfileLabel: string;
  profileKey?: 'HIGH' | 'BALANCED' | 'MODERATE' | 'MALUS';
  greenZoneMultiplier: number;
  efficiencyBonusPct: number;
  contractorEfficiencyBonusPct: number;
  isMalus: boolean;
  executedVia: 'OWN_TEAM' | 'EXTERNAL_TEAM' | 'FAILED_SURVEY';
  consumed: boolean;
}

export interface RegionRuntimeState {
  regionId: RegionId;
  ownerCompanyId: string | null;
  tanksCount: number;
  storedBarrels: number;
  remainingReservesBbl: number;
  activeCrisisTurns: number;
  crisisLabel: string | null;
  crisisTemplateId?: string | null;
  crisisOutputMultiplier: number;
  crisisPriceMultiplier?: number;
  activeHack?: ActiveConcessionHack | null;
  sabotageLockdownTurns?: number;
  coreSampleReport?: RegionCoreSampleReport | null;
}

export type WellStatus = 'ACTIVE' | 'PAUSED' | 'DEPLETED';

export interface OilWell {
  id: string;
  regionId: RegionId;
  ownerCompanyId: string;
  name: string;
  maxMonthlyOutputBbl: number;
  productionQuotaPct: number;
  status: WellStatus;
  efficiencyBonusPct: number;
  builtAtTurn: number;
  totalExtractedBbl: number;
}

export type ReportPeriodType = 'OPENING' | 'QUARTERLY' | 'ANNUAL';

export interface QuarterlyReportSnapshot {
  reportedAtTurn: number;
  reportedDateLabel: string;
  periodType: ReportPeriodType;
  periodLabel: string;
  cash: number;
  debt: number;
  netWorth: number;
  quarterlyProductionBbl: number;
  quarterlyProfit: number;
  annualProductionBbl?: number;
  annualProfit?: number;
}

export interface Company {
  id: string;
  name: string;
  isPlayer: boolean;
  colorHex: string;
  motto: string;
  personality: AiPersonality | null;
  cash: number;
  debt: number;
  creditLimit: number;
  totalRevenue: number;
  totalExpenses: number;
  totalBarrelsSold: number;
  lastTurnProfit: number;
  lastTurnProductionBbl: number;
  netWorth: number;
  quarterAccumulatedProductionBbl: number;
  quarterAccumulatedProfit: number;
  yearAccumulatedProductionBbl: number;
  yearAccumulatedProfit: number;
  lastPublishedReport: QuarterlyReportSnapshot;
  reportHistory: QuarterlyReportSnapshot[];
}

export interface MarketState {
  spotPricePerBarrel: number;
  previousPrice: number;
  priceHistory: number[];
  cyclePhase: MarketCyclePhase;
  cycleTurnsRemaining: number;
  globalDemandBbl: number;
  globalSupplyBbl: number;
  activePriceMultiplier: number;
  flatPriceTurnsInYear?: number;
}

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface GeopoliticalEvent {
  id: string;
  templateId?: string;
  turn: number;
  title: string;
  description: string;
  severity: EventSeverity;
  affectedRegionId: RegionId | null;
  priceImpactMultiplier: number;
  productionModifier: number;
  regionalPriceMultiplier?: number;
  ownerRepairCost?: number;
  turnsRemaining: number;
  rescueAttempted?: boolean;
  rescueOutcome?: 'SUCCESS' | 'FAILED' | 'EXTERNAL_TEAM';
  rescueStakeAmount?: number;
  lostProductionBarrels?: number;
  spilledBarrelsAmount?: number;
}

export type NewsCategory = 'MARKET' | 'GEOPOLITICS' | 'OPERATIONS' | 'RIVAL';

export interface NewsLogEntry {
  id: string;
  turn: number;
  dateLabel: string;
  category: NewsCategory;
  headline: string;
  detail: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
}

export interface DrillingLayerSpec {
  index: number;
  poolIndex?: number;
  layerName: string;
  rockColor: string;
  hardnessLabel: string;
  /** Optimal center position on the 0..100 scale for Bar 1 (Drill Head Position) */
  optimalPositionCenter: number;
  /** Half-width of the green zone on Bar 1 */
  positionGreenHalfWidth: number;
  /** Optimal center position on the 0..100 scale for Bar 2 (Drilling Speed) - varies per layer */
  optimalSpeedCenter: number;
  /** Half-width of the green zone on Bar 2 */
  speedGreenHalfWidth: number;
  /** Oscillation speed in percentage points per second */
  barOscillationSpeed: number;
}

export type DrillingStep =
  | 'POSITION_BAR'
  | 'SPEED_BAR'
  | 'ROLL_RESULT'
  | 'FAILED_RETRY_PROMPT'
  | 'COMPLETE_SUCCESS'
  | 'COMPLETE_FAILED';

export interface DrillingSession {
  regionId: RegionId;
  layers: DrillingLayerSpec[];
  currentLayerIndex: number;
  step: DrillingStep;
  mistakesCount: number;
  maxMistakes: number;
  retryCostPerMistake: number;
  baseDrillingCost: number;
  totalSpent: number;
  lockedPosition: number | null;
  lockedSpeed: number | null;
  lastCalculatedChance: number | null;
  lastRollSuccess: boolean | null;
  accuracySamples: number[];
  coreSampleMultiplier?: number;
  coreSampleBonusEfficiencyPct?: number;
}

export type AnalystDocIconType =
  | 'TANK'
  | 'INVOICE'
  | 'DRILL'
  | 'BANK'
  | 'SHIP'
  | 'STOCK'
  | 'GEOLOGY'
  | 'TAX';

export interface AnalystCardSpec {
  cardId: string;
  pairIndex?: number;
  pairKey: string;
  code: string;
  title: string;
  subtitle: string;
  accentHex: string;
  iconType: AnalystDocIconType;
}

export interface AnalystMinigameSession {
  targetCompanyId: string;
  targetCompanyName: string;
  targetCompanyColorHex: string;
  difficulty: DifficultyLevel;
  cost: number;
  rewardMonths: number;
  maxMistakes: number;
  pairsCount: number;
  cards: AnalystCardSpec[];
}

export type StealthDoorType = 'OPEN' | 'LOCKED' | 'KEYCARD';

export interface StealthRoomSpec {
  roomIndex: number;
  code: string;
  label: string;
  floor: number;
  doorX: number;
  doorHalfWidth: number;
  doorType: StealthDoorType;
  hackDurationMs: number;
}

/** SWEEP: pendulum camera with a blind spot; FIXED: blinking beam; SPOT: sliding spotlight. */
export type StealthCameraKind = 'SWEEP' | 'FIXED' | 'SPOT';

export interface StealthCameraSpec {
  id: string;
  kind: StealthCameraKind;
  floor: number;
  mountX: number;
  rangePx: number;
  blindSpotHalfPx: number;
  cycleSeconds: number;
  initialPhaseOffset: number;
  /** Beam direction for FIXED cameras. */
  facing: 1 | -1;
}

export type StealthHideKind = 'LOCKER' | 'SHADOW' | 'DESK' | 'PLANT';

export interface StealthHideSpotSpec {
  id: string;
  kind: StealthHideKind;
  floor: number;
  x: number;
  halfWidth: number;
}

export interface StealthGuardSpec {
  id: string;
  floor: number;
  patrolMinX: number;
  patrolMaxX: number;
  speedPxPerSec: number;
  pauseSeconds: number;
  visionPx: number;
  initialPhaseOffset: number;
}

export interface StealthBuildingSpec {
  floorsCount: number;
  width: number;
  liftX: number;
  /** stairsX[f] connects floor f with floor f + 1. */
  stairsX: number[];
  keycard: { floor: number; x: number } | null;
}

export interface SabotageEffectSpec {
  outputMultiplier: number;
  durationMonths: number;
  ownerFine: number;
  label: string;
}

export interface SabotageMinigameSession {
  targetScope: SabotageTargetScope;
  regionId: RegionId;
  targetOwnerCompanyId: string;
  direction: SabotageEffectDirection;
  difficulty: DifficultyLevel;
  upfrontCost: number;
  caughtFineCost: number;
  lockdownMonths: number;
  walkSpeedPxPerSec: number;
  roomsCount: number;
  building: StealthBuildingSpec;
  rooms: StealthRoomSpec[];
  cameras: StealthCameraSpec[];
  hideSpots: StealthHideSpotSpec[];
  guards: StealthGuardSpec[];
  effectConfig: SabotageEffectSpec;
}

export interface SabotageOperationRecord {
  id: string;
  turn: number;
  targetScope: SabotageTargetScope;
  targetRegionId?: RegionId;
  targetCompanyId: string;
  direction: SabotageEffectDirection;
  executedVia: 'MINIGAME' | 'CONTRACTOR';
  outcome: 'SUCCESS' | 'CAUGHT';
  costPaid: number;
  finePaidByPlayer: number;
  ownerFineApplied: number;
}

export interface TankerHazardSpec {
  id: string;
  kind: 'REEF' | 'DEBRIS';
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  minY?: number;
  maxY?: number;
}

export interface TankerCurrentZoneSpec {
  id: string;
  xStart: number;
  xEnd: number;
  forceY: number;
  label: string;
  directionKey?: 'SOUTH_CURRENT' | 'NORTH_CURRENT' | 'NORTH_GUST' | 'SOUTH_GUST';
}

export interface TankerMinigameSession {
  regionId: RegionId;
  eventId: string;
  templateId?: string;
  eventTitle: string;
  difficulty: DifficultyLevel;
  stakeBaseCost: number;
  baseEventRepairCost: number;
  failMultiplier: number;
  failExtraPenaltyCost: number;
  recoveryRatio: number;
  timeLimitSec: number;
  maxHullHp: number;
  worldWidth: number;
  worldHeight: number;
  startX: number;
  startY: number;
  harborX: number;
  harborY: number;
  harborRadius: number;
  hazards: TankerHazardSpec[];
  currents: TankerCurrentZoneSpec[];
}

export interface PendingTankerRescuePrompt {
  regionId: RegionId;
  eventId: string;
  templateId?: string;
  eventTitle: string;
  eventDescription: string;
  baseRepairCost: number;
  stakeBaseCost: number;
  spilledBarrelsAmount: number;
  lostProductionBarrels: number;
}

export interface CoreSampleLayerSpec {
  layerId: string;
  seqIdx?: number;
  depthOrder: number;
  rockName: string;
  chemicalFormula: string;
  chemicalClue: string;
  pressureBar: number;
  densityGcm3: number;
  pHLabel: string;
  rockColor: string;
  targetCenterPct: number;
  targetHalfWidthPct: number;
  sweepSpeedPctPerSec: number;
}

export interface CoreSampleMinigameSession {
  regionId: RegionId;
  difficulty: DifficultyLevel;
  costPaid: number;
  maxAttempts: number;
  failPenaltyCost: number;
  failGreenZoneMultiplier: number;
  greenZoneMultiplier: number;
  efficiencyBonusPct: number;
  contractorEfficiencyBonusPct: number;
  estimatedWellOutputBbl: number;
  reservoirPressureBar: number;
  pressureProfileLabel: string;
  profileKey?: 'HIGH' | 'BALANCED' | 'MODERATE' | 'MALUS';
  orderedTargetLayers: CoreSampleLayerSpec[];
}

export interface CurrentTurnLedger {
  turnStartCash: number;
  oilSalesRevenue: number;
  oilBarrelsSold: number;
  bankLoanTaken: number;
  crisisRescueRefund?: number;
  concessionPurchasesCost: number;
  tankBuildCost: number;
  drillingCost: number;
  analystFeesCost: number;
  sabotageCost: number;
  sabotageFineCost: number;
  crisisRescueCost?: number;
  coreSampleCost?: number;
  loanRepaymentCost: number;
}

export interface MonthlyTurnSummary {
  closedTurn: number;
  closedDateLabel: string;
  startingCash: number;
  endingCash: number;
  endingDebt: number;
  creditLimit: number;
  spotPriceAfterClose: number;
  barrelsExtracted: number;
  barrelsSold: number;
  oilSalesRevenue: number;
  bankLoanTaken: number;
  crisisRescueRefund: number;
  totalInflows: number;
  wellOpexCost: number;
  storageCost: number;
  debtInterestCost: number;
  crisisRepairCost: number;
  closingCostsTotal: number;
  concessionPurchasesCost: number;
  tankBuildCost: number;
  drillingCost: number;
  analystFeesCost: number;
  sabotageCost: number;
  sabotageFineCost: number;
  crisisRescueCost: number;
  coreSampleCost: number;
  loanRepaymentCost: number;
  midTurnOutflowsTotal: number;
  totalOutflows: number;
  netCashChange: number;
  operatingProfitLoss: number;
}

export interface GameOverSummary {
  reason: 'VICTORY_TARGET' | 'TIME_HORIZON' | 'BANKRUPTCY';
  headline: string;
  detail: string;
  winnerCompanyId: string;
}

export interface GameState {
  screen: GameScreenState;
  activeTab: ActiveTab;
  selectedRegionId: RegionId;
  difficulty: DifficultyLevel;
  turn: number;
  maxTurns: number;
  endlessMode: boolean;
  startYear: number;
  startMonth: number;
  victoryNetWorthTarget: number;
  playerCompanyId: string;
  companies: Company[];
  regions: Record<RegionId, RegionRuntimeState>;
  wells: OilWell[];
  market: MarketState;
  activeEvents: GeopoliticalEvent[];
  newsLog: NewsLogEntry[];
  drillingSession: DrillingSession | null;
  analystSession: AnalystMinigameSession | null;
  sabotageSession: SabotageMinigameSession | null;
  tankerSession: TankerMinigameSession | null;
  coreSampleSession: CoreSampleMinigameSession | null;
  pendingTankerRescuePrompt: PendingTankerRescuePrompt | null;
  gameOverSummary: GameOverSummary | null;
  analystAccessTurnsByCompanyId: Record<string, number>;
  sabotageHistory?: SabotageOperationRecord[];
  pendingAnnualReportTurn: number | null;
  pendingMonthlySummary: MonthlyTurnSummary | null;
  currentTurnLedger: CurrentTurnLedger;
  regionalCrisesInYear?: number;
  soundMuted: boolean;
}

export interface SaveSlotSummary {
  slotId: string;
  label: string;
  savedAtIso: string;
  companyName: string;
  turn: number;
  startYear?: number;
  startMonth?: number;
  dateLabel: string;
  netWorth: number;
  cash: number;
}
