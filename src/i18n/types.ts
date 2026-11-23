import {
  AiPersonality,
  DifficultyLevel,
  MarketCyclePhase,
  NewsCategory,
  RegionId,
} from '../engine/gameTypes';

export type SupportedLanguage = 'en' | 'hu' | 'de' | 'es' | 'fr' | 'pt' | 'pl' | 'zh';

export interface LanguageOption {
  code: SupportedLanguage;
  nativeLabel: string;
  localeTag: string;
  shortCode: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', nativeLabel: 'English', localeTag: 'en-US', shortCode: 'EN' },
  { code: 'hu', nativeLabel: 'Magyar', localeTag: 'hu-HU', shortCode: 'HU' },
  { code: 'de', nativeLabel: 'Deutsch', localeTag: 'de-DE', shortCode: 'DE' },
  { code: 'es', nativeLabel: 'Español', localeTag: 'es-ES', shortCode: 'ES' },
  { code: 'fr', nativeLabel: 'Français', localeTag: 'fr-FR', shortCode: 'FR' },
  { code: 'pt', nativeLabel: 'Português', localeTag: 'pt-BR', shortCode: 'PT' },
  { code: 'pl', nativeLabel: 'Polski', localeTag: 'pl-PL', shortCode: 'PL' },
  { code: 'zh', nativeLabel: '简体中文', localeTag: 'zh-CN', shortCode: 'ZH' },
] as const;

export interface RegionTranslation {
  name: string;
  continent: string;
  description: string;
  geologyNote: string;
}

export interface ChemicalStratumTranslation {
  rockName: string;
  chemicalClue: string;
  pHLabel: string;
}

export interface EventTemplateTranslation {
  title: string;
  description: string;
  crisisLabel: string;
}

export interface AnalystCardTranslation {
  docCode: string;
  title: string;
  subtitle: string;
}

export interface TranslationSchema {
  meta: {
    appName: string;
    pageTitle: string;
    pageDescription: string;
    languageLabel: string;
    languageHint: string;
  };
  units: {
    barrelFull: string;
    barrelShort: string;
    barrelsUnit: string;
    perBarrel: string;
    perMonth: string;
    monthsShort: string;
    monthsFull: string;
    turnLabel: string;
    turnsCount: string;
    yearsCount: string;
    wellsCount: string;
    tanksCount: string;
    regionsCount: string;
    piecesShort: string;
  };
  dates: {
    months: readonly [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    shortMonths: readonly [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    dateFormat: string;
    quarterLabel: string;
    annualLabel: string;
    openingLabel: string;
  };
  difficulties: Record<
    DifficultyLevel,
    {
      label: string;
      shortLabel: string;
      tagline: string;
      analystSummary: string;
    }
  >;
  marketCycles: Record<
    MarketCyclePhase,
    {
      label: string;
      shortLabel: string;
      description: string;
    }
  >;
  personalities: Record<AiPersonality | 'PLAYER', string>;
  newsCategories: Record<NewsCategory, string>;
  companies: {
    defaultPlayerName: string;
    defaultPlayerMotto: string;
    aiMottos: Record<'ai_borealis' | 'ai_vektor' | 'ai_meridian', string>;
  };
  regions: Record<RegionId, RegionTranslation>;
  drillingStrata: readonly [string, string, string, string, string, string];
  drillingHardness: readonly [string, string, string, string, string, string];
  chemicalStrata: readonly [
    ChemicalStratumTranslation,
    ChemicalStratumTranslation,
    ChemicalStratumTranslation,
    ChemicalStratumTranslation,
    ChemicalStratumTranslation,
    ChemicalStratumTranslation,
  ];
  coreSampleProfiles: {
    HIGH: string;
    BALANCED: string;
    MODERATE: string;
    MALUS: string;
  };
  events: Record<string, EventTemplateTranslation>;
  analystDeck: readonly [
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
    AnalystCardTranslation,
  ];
  sabotageRooms: readonly [string, string, string, string, string];
  tankerCurrents: {
    SOUTH_CURRENT: string;
    NORTH_CURRENT: string;
    NORTH_GUST: string;
    SOUTH_GUST: string;
  };
  titleScreen: {
    subtitle: string;
    setupTitle: string;
    faqButton: string;
    companyNameLabel: string;
    companyNamePlaceholder: string;
    difficultyLabel: string;
    horizonPrefix: string;
    targetPrefix: string;
    startingCashLabel: string;
    aiStartingCashLabel: string;
    contractorDrillLabel: string;
    crisisFreqLabel: string;
    crisisFreqValue: string;
    startButton: string;
    continueHeader: string;
    loadSlotHeader: string;
    noSavedGames: string;
    autosaveTag: string;
    turnPrefix: string;
  };
  faqModal: {
    title: string;
    subtitle: string;
    close: string;
    closeFooter: string;
    sections: {
      goalTitle: string;
      goalItems: readonly string[];
      drillingTitle: string;
      drillingItems: readonly string[];
      analystTitle: string;
      analystItems: readonly string[];
      sabotageTitle: string;
      sabotageItems: readonly string[];
      tankerTitle: string;
      tankerItems: readonly string[];
      bankTitle: string;
      bankItems: readonly string[];
      difficultiesTitle: string;
      difficultiesSummary: string;
    };
  };
  topBar: {
    cash: string;
    debt: string;
    netWorth: string;
    spotPrice: string;
    turnPrefix: string;
    tabMap: string;
    tabMarket: string;
    tabCompanies: string;
    tabNews: string;
    saveLoadButton: string;
    nextMonth: string;
  };
  newsTicker: {
    liveTicker: string;
    noActiveNews: string;
  };
  worldMap: {
    title: string;
    subtitle: string;
    mapAriaLabel: string;
    filterAll: string;
    filterMine: string;
    filterFree: string;
    crisisShort: string;
    wellShortSuffix: string;
    legendFree: string;
    legendOwnCrisis: string;
    legendOtherCrisis: string;
    quickTableTitle: string;
    colRegion: string;
    colOwner: string;
    colConcession: string;
    colOutputPerWell: string;
    colDifficulty: string;
    ownerYou: string;
    ownerAvailable: string;
    crisisTag: string;
    strataCountSuffix: string;
    offshoreTag: string;
    onshoreTag: string;
    ownerLabel: string;
    freeConcession: string;
    geologyPrefix: string;
    activeCrisisTitle: string;
    monthsRemaining: string;
    fullShutdown: string;
    localExtractionMult: string;
    localSalePrice: string;
    damageCost: string;
    rescueCompleted: string;
    rescueExternalDeployed: string;
    rescueFailed: string;
    marineRescueAvailable: string;
    manualTankerTitle: string;
    manualTankerDesc: string;
    externalTankerTitle: string;
    externalTankerDesc: string;
    activeHackTitle: string;
    hackDurationPrefix: string;
    hackExecManual: string;
    hackExecExternal: string;
    hackBoostLabel: string;
    hackSabotageLabel: string;
    remainingReserves: string;
    logisticsPriceMult: string;
    politicalStability: string;
    drillingProfile: string;
    difficultyRating: string;
    concessionFee: string;
    buyConcession: string;
    insufficientCash: string;
    rivalOperatedNotice: string;
    activeWells: string;
    storageTanks: string;
    maxCapacityPrefix: string;
    storedInventory: string;
    confidentialData: string;
    auditHint: string;
    storageHeading: string;
    tanksFraction: string;
    buildTankAlert: string;
    buildTankButton: string;
    sellInventoryButton: string;
    wellsHeading: string;
    wellsAffected: string;
    opexPrefix: string;
    damagedCoreTitle: string;
    activeCoreTitle: string;
    damagedCoreDesc: string;
    activeCoreDesc: string;
    onsiteCoreButton: string;
    onsiteCoreDesc: string;
    externalGeoButton: string;
    externalGeoDesc: string;
    manualDrillButton: string;
    manualDrillDesc: string;
    contractorDrillButton: string;
    contractorDrillDesc: string;
    drillingRequiresTank: string;
    maxWellsReached: string;
    noWellsHint: string;
    quotaLabel: string;
    expectedMonthlyYield: string;
    statusActive: string;
    statusPaused: string;
    statusDepleted: string;
    pauseTooltip: string;
    resumeTooltip: string;
    sabotageSectionTitle: string;
    lockdownBadge: string;
    boostTab: string;
    sabotageTab: string;
    boostSummary: string;
    sabotageSummary: string;
    lockdownNotice: string;
    manualInfiltrationButton: string;
    manualInfiltrationDesc: string;
    externalHackersButton: string;
    externalHackersDesc: string;
    freeRegionLockNotice: string;
    corePreSurveyHeading: string;
    onshoreAdvantageBadge: string;
    activeCoreEstimate: string;
    externalGeoInstantDesc: string;
    wellBonusTag: string;
    wellCrisisHalted: string;
    wellCrisisReduced: string;
    wellCrisisPricePressure: string;
    sabotageRoomsUnit: string;
  };
  marketView: {
    spotTitle: string;
    spotDesc: string;
    currentSpotPrice: string;
    turnLabel: string;
    historyTitle: string;
    historyDesc: string;
    chartPriceName: string;
    inventoryTitle: string;
    inventorySummary: string;
    sellAllButton: string;
    noStoredOil: string;
    regionCol: string;
    storedCol: string;
    capacityCol: string;
    localPriceCol: string;
    proceedsCol: string;
    actionCol: string;
    sellButton: string;
    bankTitle: string;
    bankSubtitle: string;
    currentDebt: string;
    availableCredit: string;
    monthlyInterest: string;
    borrowLabel: string;
    repayLabel: string;
    repayAllButton: string;
    noDebtButton: string;
    exchangeTitle: string;
    marketCycleLabel: string;
    eventMultLabel: string;
    chart12mTitle: string;
    chart12mAvg: string;
    globalDemandLabel: string;
    prevSupplyLabel: string;
    supplyDemandRatioLabel: string;
    coveragePctValue: string;
    initialMarketValue: string;
    inventoryValueLabel: string;
    sellHalfButton: string;
    bankInterestRateNote: string;
    borrowLoanButton: string;
    repayLoanButton: string;
    repayAllShortButton: string;
  };
  companiesView: {
    title: string;
    subtitle: string;
    tabsAriaLabel: string;
    tabStandingsShort: string;
    tabStandingsLongSuffix: string;
    tabDossier: string;
    tabReportsShort: string;
    tabReportsLong: string;
    standingsHintLeft: string;
    standingsHintRight: string;
    knownNetWorth: string;
    goalLabel: string;
    cashLabel: string;
    productionLabel: string;
    profitLabel: string;
    confidential: string;
    dossierButton: string;
    shortDossierButton: string;
    colCompany: string;
    colAssets: string;
    colOperations: string;
    barrels3Months: string;
    profit3Months: string;
    stockpileLabel: string;
    stockpileConfidentialHint: string;
    selectCompanyLabel: string;
    playerTag: string;
    rivalTag: string;
    liveOwnBooks: string;
    liveAuditBooks: string;
    openingData: string;
    internalAuditButton: string;
    internalAuditDesc: string;
    externalAnalystButton: string;
    externalAnalystDesc: string;
    liveCheckingAccount: string;
    creditLineLabel: string;
    freeCreditPrefix: string;
    netWorthLabel: string;
    monthlyOutputLabel: string;
    quarterCumulativePrefix: string;
    monthlyProfitLabel: string;
    reportedCash: string;
    reportedDebt: string;
    liveDebtConfidential: string;
    knownCompanyValue: string;
    lastReportSubtitle: string;
    quarterlyProduction: string;
    monthlyDataSecret: string;
    quarterlyProfit: string;
    closedQuarterSubtitle: string;
    firstReportTurn3: string;
    rivalSecrecyBanner: string;
    netWorthCompositionTitle: string;
    netWorthCompositionNote: string;
    assetCash: string;
    assetConcessions: string;
    assetTanks: string;
    assetWells: string;
    assetStoredOil: string;
    assetDebtDeduction: string;
    lifetimeRevenue: string;
    lifetimeExpenses: string;
    lifetimeExtracted: string;
    regionalPresenceTitle: string;
    noConcessionsYet: string;
    crisisBadge: string;
    wellsLabel: string;
    tanksLabel: string;
    storedLabel: string;
    audited: string;
    secret: string;
    noReportsTitle: string;
    noReportsDesc: string;
    selectPeriodLabel: string;
    reportPeriodTitle: string;
    publishedAtLabel: string;
    reportBannerTitle: string;
    annualProfitExtra: string;
    reportFootnote: string;
    nextQuarterTurnLabel: string;
    annualCloseTurnLabel: string;
    turnOrdinal: string;
    regionStatusNormal: string;
    wellsRosterTitle: string;
    noWellsCompanyNotice: string;
    wellSatelliteSecretNotice: string;
    quotaAndBonusLabel: string;
    colWell: string;
    colStatus: string;
    colEfficiencyBonus: string;
    colQuota: string;
    colMonthlyOutput: string;
    colCumulativeExtracted: string;
    reportHistoryTitle: string;
    noCompanyReportsNotice: string;
    colPeriod: string;
    colDateTurn: string;
    colPeriodOutput: string;
    colPeriodProfit: string;
    colClosingCashDebt: string;
    colClosingNetWorth: string;
    annualPrefix: string;
    debtPrefix: string;
    colOpeningCash: string;
    colOpeningNetWorth: string;
    periodMetaLine: string;
    periodRowHint: string;
    colAnnualOrQ4Output: string;
    colAnnualOrQ4Profit: string;
    openDossierButton: string;
  };
  newsView: {
    title: string;
    subtitle: string;
    filterAll: string;
    activeGlobalTitle: string;
    turnShort: string;
    remainingMonths: string;
    logTitle: string;
    emptyLog: string;
    entryDatePrefix: string;
    noCrisesNotice: string;
    worldPriceImpact: string;
    productionImpact: string;
    localPriceImpact: string;
    costImpact: string;
  };
  monthlySummary: {
    dialogTitleCompact: string;
    dialogTitleFull: string;
    closedTurnSubtitle: string;
    spotAfterClose: string;
    closingCostsTitle: string;
    wellOpexLabel: string;
    storageCostLabel: string;
    debtInterestLabel: string;
    crisisRepairLabel: string;
    totalClosingCosts: string;
    closingCashLabel: string;
    detailsButton: string;
    continueToAnnual: string;
    continueToNextMonth: string;
    kpiNetCashChange: string;
    kpiOperatingResult: string;
    kpiExtractedSold: string;
    kpiDebtCredit: string;
    inflowsTitle: string;
    totalInflowsLabel: string;
    oilSalesLabel: string;
    loanTakenLabel: string;
    rescueRefundLabel: string;
    outflowsTitle: string;
    totalOutflowsLabel: string;
    midTurnItemsHeading: string;
    concessionPurchasesLabel: string;
    tankBuildLabel: string;
    drillingCostLabel: string;
    coreSampleLabel: string;
    crisisRescueLabel: string;
    analystFeesLabel: string;
    sabotageCostLabel: string;
    sabotageFineLabel: string;
    loanRepaymentLabel: string;
    noMidTurnOutflows: string;
    reconcileStartCash: string;
    reconcileInflows: string;
    reconcileOutflows: string;
    reconcileEndingCash: string;
    annualPendingNotice: string;
  };
  annualReport: {
    title: string;
    subtitle: string;
    yearWinnerTitle: string;
    bestNetWorthLabel: string;
    colCompany: string;
    colYearlyOutput: string;
    colYearlyResult: string;
    colClosingCash: string;
    colNetWorth: string;
    youBadge: string;
    leaderPrefix: string;
    closeButton: string;
  };
  gameOver: {
    title: string;
    closingCashLabel: string;
    finalNetWorthLabel: string;
    closedTurnsLabel: string;
    standingsTitle: string;
    newGameButton: string;
    continueEndlessButton: string;
    reasons: {
      bankruptcyHeadline: string;
      bankruptcyDetail: string;
      victoryPlayerHeadline: string;
      victoryPlayerDetail: string;
      victoryRivalHeadline: string;
      victoryRivalDetail: string;
      horizonWinHeadline: string;
      horizonWinDetail: string;
      horizonLossHeadline: string;
      horizonLossDetail: string;
    };
  };
  tankerPrompt: {
    badge: string;
    titlePrefix: string;
    spilledNotice: string;
    lostProductionNotice: string;
    manualOptionBadge: string;
    manualOptionTitle: string;
    manualOptionDesc: string;
    manualSuccessTag: string;
    manualFailTag: string;
    manualStartButton: string;
    externalOptionBadge: string;
    externalOptionTitle: string;
    externalOptionDesc: string;
    externalButton: string;
    skipButton: string;
  };
  saveLoadModal: {
    title: string;
    subtitle: string;
    closeAria: string;
    emptySlot: string;
    slotTurnPrefix: string;
    saveHere: string;
    overwrite: string;
    load: string;
    delete: string;
    closeButton: string;
    defaultSlotNames: readonly [string, string, string];
  };
  drillingModal: {
    title: string;
    baseFeePrefix: string;
    mistakesLabel: string;
    bonusPrefix: string;
    coreBonusBadge: string;
    coreMalusBadge: string;
    abortButton: string;
    layerFraction: string;
    rockLabel: string;
    hardnessLabel: string;
    phase1Desc: string;
    phase2Desc: string;
    positionBarTitle: string;
    positionLeft: string;
    positionRight: string;
    positionStopButton: string;
    positionLocked: string;
    speedBarTitle: string;
    speedLow: string;
    speedHigh: string;
    speedLockButton: string;
    speedLocked: string;
    readyPrompt: string;
    failedPrompt: string;
    successTitle: string;
    successDesc: string;
    activateWellButton: string;
    bitBrokenTitle: string;
    bitBrokenDesc: string;
    buyNewBitButton: string;
    giveUpButton: string;
    maxMistakesTitle: string;
    maxMistakesDesc: string;
    ackFailureButton: string;
    strataBannerCompleted: string;
    layersLabel: string;
    totalSpentLabel: string;
    imgFallback: string;
    imgAlt: string;
    strataStackTitle: string;
    difficultyLabel: string;
    statusDone: string;
    statusActive: string;
    statusPending: string;
    targetReservoirLabel: string;
    targetReached: string;
    targetDeep: string;
    currentLayerHeader: string;
    recommendedSpeedLabel: string;
    bar1Label: string;
    bar2Label: string;
    lockedPrefix: string;
    activePrefix: string;
    waitingAfterStep1: string;
    step1Prompt: string;
    step2Prompt: string;
    rollSuccessTitle: string;
    rollSuccessDesc: string;
    rollFailedTitle: string;
    rollFailedDesc: string;
    completeSuccessSummary: string;
    nextButton: string;
    closeButton: string;
    noRetryCash: string;
  };
  coreSampleModal: {
    title: string;
    subtitle: string;
    abortButton: string;
    scannedLayersLabel: string;
    remainingSensorsLabel: string;
    statusLabel: string;
    statusSuccess: string;
    statusFailed: string;
    statusMeasuring: string;
    pressureProfilePrefix: string;
    depthTitle: string;
    holdPrompt: string;
    resonanceWindowLabel: string;
    hitFeedback: string;
    missEarlyFeedback: string;
    missOverrunFeedback: string;
    holdButtonRelease: string;
    holdButtonStart: string;
    holdHint: string;
    scannerLogTitle: string;
    completedLayersCount: string;
    depthPrefix: string;
    pendingMeasure: string;
    yieldBonusLabel: string;
    successBannerTitle: string;
    successBannerDesc: string;
    saveReportButton: string;
    failedBannerTitle: string;
    failedBannerDescZeroPenalty: string;
    failedBannerDescPenalty: string;
    failedBannerMalusNote: string;
    ackFailureButton: string;
    headerTitle: string;
    headerSubtitle: string;
    sensorAttemptsLabel: string;
    sensorAttemptsVal: string;
    layersRevealedVal: string;
    windowWidthLabel: string;
    windowWidthVal: string;
    drillAdvantageHeader: string;
    drillAdvantageVal: string;
    failSurchargeNote: string;
    failZoneNote: string;
    boreholeProfileTitle: string;
    surfaceToDepth: string;
    layerDepthLabel: string;
    activeSonarStatus: string;
    deeperLockedStatus: string;
    scanningTitle: string;
    speedWindowMeta: string;
    clueInstruction: string;
    surfaceZero: string;
    overflowHundred: string;
    inZoneNow: string;
    scanningPulse: string;
    standbyPrompt: string;
    buttonInZone: string;
    buttonScanning: string;
    buttonIdle: string;
    oneHandHint: string;
    feedbackReady: string;
    feedbackHitDone: string;
    feedbackHitNext: string;
    feedbackEarly: string;
    feedbackOverrun: string;
    feedbackRecalibrated: string;
    estOutputLabel: string;
    reservoirPressureLabel: string;
    drillAdvantageActiveLabel: string;
    successHeading: string;
    successSummary: string;
    failedHeading: string;
    failedSummaryPrefix: string;
    failedSurchargeSentence: string;
  };
  analystModal: {
    title: string;
    subtitle: string;
    mistakesLeft: string;
    pairsLabel: string;
    abortButton: string;
    cardBackLabel: string;
    successTitle: string;
    successDesc: string;
    activateAccessButton: string;
    failedTitle: string;
    failedDesc: string;
    ackFailureButton: string;
    headerMeta: string;
    rewardAccessPrefix: string;
    stepsLabel: string;
    matchHint: string;
    sealedFileAria: string;
    closeButton: string;
  };
  sabotageModal: {
    titlePrefix: string;
    securityLevelSuffix: string;
    feePrefix: string;
    targetEffectPrefix: string;
    boostEffectDesc: string;
    sabotageEffectDesc: string;
    retreatButton: string;
    hackedRoomsLabel: string;
    statusPrefix: string;
    statusCaught: string;
    statusSuccess: string;
    statusHacking: string;
    statusWalking: string;
    statusHidden: string;
    statusExposed: string;
    statusClimbing: string;
    statusLift: string;
    statusNeedKey: string;
    keycardLabel: string;
    caughtPenaltyLabel: string;
    roomStatusOk: string;
    roomStatusLocked: string;
    svgAriaLabel: string;
    controlsHint: string;
    legendHide: string;
    legendCameras: string;
    legendDoors: string;
    successTitle: string;
    successBoostDesc: string;
    successSabotageDesc: string;
    applyButton: string;
    caughtTitle: string;
    caughtDesc: string;
    ackFineButton: string;
  };
  tankerModal: {
    titlePrefix: string;
    difficultySuffix: string;
    retreatButton: string;
    timeLeftLabel: string;
    hullLabel: string;
    speedLabel: string;
    dockingSafe: string;
    dockingTooFast: string;
    saveGoalLabel: string;
    hitFlashAlert: string;
    canvasHarborTitle: string;
    canvasHarborSub: string;
    canvasReefLabel: string;
    controlsLeftTitle: string;
    controlsRightTitle: string;
    controlsAccelTitle: string;
    controlsBrakeTitle: string;
    controlsShortLeft: string;
    controlsShortRight: string;
    controlsShortAccel: string;
    controlsShortBrake: string;
    instructionsHint: string;
    dockSpeedHint: string;
    winTitle: string;
    winDesc: string;
    claimWinButton: string;
    failTitleTimeout: string;
    failTitleSunk: string;
    failTitleAborted: string;
    failDesc: string;
    ackFailButton: string;
    subtitleGuide: string;
    surrenderButton: string;
    secondsShort: string;
    hullIntegrityLabel: string;
    speedChannelLabel: string;
    knotsUnit: string;
    stakeAtRiskLabel: string;
    controlsSummary: string;
    alertCurrentPrefix: string;
    recoverySuccessNote: string;
    readyTitle: string;
    readyDesc: string;
    rewardTitle: string;
    rewardDesc: string;
    failStakeTitle: string;
    startManeuverButton: string;
    successCreditsLabel: string;
    netZeroTag: string;
    successReductionLabel: string;
    failFineAppliedLabel: string;
    closeReportButton: string;
    failHullReason: string;
    failTimeReason: string;
    btnLeft: string;
    btnThrust: string;
    btnBrake: string;
    btnRight: string;
  };
  toasts: {
    savedToSlot: string;
    loadedFromSlot: string;
    autosaveLoaded: string;
    slotDeleted: string;
    slotSavedBrowser: string;
    concessionBought: string;
    tankBuilt: string;
    contractorWellBuilt: string;
    manualDrillSuccess: string;
    manualDrillFailed: string;
    oilSoldRegion: string;
    oilSoldAll: string;
    analystHired: string;
    internalAuditSuccess: string;
    internalAuditFailed: string;
    sabotageSuccess: string;
    sabotageCaught: string;
    sabotageAborted: string;
    externalHackerSuccess: string;
    coreSampleSuccess: string;
    coreSampleFailed: string;
    coreSampleAborted: string;
    externalCoreSuccess: string;
    tankerWin: string;
    tankerFail: string;
    externalTankerSuccess: string;
  };
  engineErrors: {
    cannotAcquireRegion: string;
    regionAlreadyOwned: string;
    insufficientCashConcession: string;
    insufficientCashRequired: string;
    notYourConcessionTank: string;
    maxTanksReached: string;
    insufficientCashTank: string;
    notYourConcessionDrill: string;
    buildTankBeforeDrill: string;
    maxWellsReached: string;
    insufficientCashDrill: string;
    insufficientCashContractorDrill: string;
    insufficientCashManualDrill: string;
    insufficientCashRetryBit: string;
    notYourConcessionCore: string;
    noCoreOnOffshore: string;
    coreAlreadyReady: string;
    insufficientCashCore: string;
    insufficientCashExternalGeo: string;
    notYourConcessionSell: string;
    noOilToSell: string;
    alreadyHaveAuditAccess: string;
    targetRivalNotFound: string;
    invalidTargetCompany: string;
    insufficientCashAudit: string;
    insufficientCashExternalAnalyst: string;
    insufficientCashInternalAudit: string;
    minigameNotYourConcession: string;
    minigameNeedTankFirst: string;
    minigameMaxWells: string;
    minigameInsufficientCash: string;
    creditLimitExceeded: string;
    invalidLoanAmount: string;
    amountMustBePositive: string;
    noDebtToRepay: string;
    cannotRepayDebt: string;
    sabotageFreeRegionBlocked: string;
    sabotageRegionLocked: string;
    sabotageInsufficientCash: string;
    insufficientCashExternalHacker: string;
    tankerNotOwnedRegion: string;
    tankerInvalidFleetRegion: string;
    tankerNoActiveEvent: string;
    tankerCrisisUnavailable: string;
    tankerAlreadyHandled: string;
    tankerInsufficientCashFleet: string;
  };
  logEntries: Record<
    string,
    {
      title: string;
      description: string;
    }
  >;
}
