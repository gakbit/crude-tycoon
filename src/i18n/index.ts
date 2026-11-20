import { REGIONS_BY_ID, ROCK_STRATA_POOL } from '../data/regionsData';
import {
  ActiveConcessionHack,
  Company,
  GameOverSummary,
  GameState,
  GeopoliticalEvent,
  NewsLogEntry,
  OilWell,
  RegionId,
  TankerCurrentZoneSpec,
} from '../engine/gameTypes';
import {
  detectBrowserLanguage,
  getActiveLanguage,
  interpolate,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  loadStoredLanguage,
  resolveInitialLanguage,
  saveStoredLanguage,
  setActiveLanguage,
  subscribeLanguage,
} from './detect';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hu } from './locales/hu';
import { pl } from './locales/pl';
import { pt } from './locales/pt';
import { zh } from './locales/zh';
import {
  LANGUAGE_OPTIONS,
  RegionTranslation,
  SupportedLanguage,
  TranslationSchema,
} from './types';

export {
  detectBrowserLanguage,
  getActiveLanguage,
  interpolate,
  isSupportedLanguage,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  loadStoredLanguage,
  resolveInitialLanguage,
  saveStoredLanguage,
  setActiveLanguage,
  subscribeLanguage,
};
export type { LanguageOption, SupportedLanguage, TranslationSchema } from './types';

export const TRANSLATIONS: Record<SupportedLanguage, TranslationSchema> = {
  en,
  hu,
  de,
  es,
  fr,
  pt,
  pl,
  zh,
};

const LOCALE_TAG_MAP: Record<SupportedLanguage, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.map((opt) => [opt.code, opt.localeTag])
) as Record<SupportedLanguage, string>;

export function getLocaleTag(lang: SupportedLanguage = getActiveLanguage()): string {
  return LOCALE_TAG_MAP[lang] ?? 'en-US';
}

export function getDict(lang: SupportedLanguage = getActiveLanguage()): TranslationSchema {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}

export function formatLocaleNumber(
  value: number,
  lang: SupportedLanguage = getActiveLanguage(),
  decimals: number = 0
): string {
  const tag = getLocaleTag(lang);
  if (decimals <= 0) {
    return Math.round(value).toLocaleString(tag);
  }
  return value.toLocaleString(tag, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrencyI18n(
  amount: number,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const rounded = Math.round(amount);
  const absFormatted = Math.abs(rounded).toLocaleString(getLocaleTag(lang));
  return rounded < 0 ? `-$${absFormatted}` : `$${absFormatted}`;
}

export function formatBarrelsI18n(
  barrels: number,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  return `${Math.round(barrels).toLocaleString(getLocaleTag(lang))} ${dict.units.barrelsUnit}`;
}

export function getCalendarYearMonth(
  startYear: number,
  startMonth: number,
  turn: number
): { year: number; monthNumber: number; monthIndex: number } {
  const zeroBasedMonth = startMonth - 1 + (turn - 1);
  const year = startYear + Math.floor(zeroBasedMonth / 12);
  const monthIndex = ((zeroBasedMonth % 12) + 12) % 12;
  return { year, monthNumber: monthIndex + 1, monthIndex };
}

export function formatGameDateI18n(
  startYear: number,
  startMonth: number,
  turn: number,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const { year, monthIndex } = getCalendarYearMonth(startYear, startMonth, turn);
  return interpolate(dict.dates.dateFormat, {
    year,
    month: dict.dates.months[monthIndex],
  });
}

export function formatGameShortDateI18n(
  startYear: number,
  startMonth: number,
  turn: number,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const { year, monthIndex } = getCalendarYearMonth(startYear, startMonth, turn);
  return `${dict.dates.shortMonths[monthIndex]} ${String(year).slice(2)}`;
}

export function getReportPeriodMetaI18n(
  startYear: number,
  startMonth: number,
  turn: number,
  lang: SupportedLanguage = getActiveLanguage()
): {
  year: number;
  quarter: number;
  periodType: 'OPENING' | 'QUARTERLY' | 'ANNUAL';
  periodLabel: string;
} {
  const dict = getDict(lang);
  const { year, monthIndex } = getCalendarYearMonth(startYear, startMonth, turn);
  const quarter = Math.floor(monthIndex / 3) + 1;
  if (turn <= 1) {
    return {
      year,
      quarter,
      periodType: 'OPENING',
      periodLabel: dict.dates.openingLabel,
    };
  }
  const isAnnual = turn % 12 === 0;
  return {
    year,
    quarter,
    periodType: isAnnual ? 'ANNUAL' : 'QUARTERLY',
    periodLabel: isAnnual
      ? interpolate(dict.dates.annualLabel, { year })
      : interpolate(dict.dates.quarterLabel, { year, quarter }),
  };
}

export function getLocalizedRegion(
  regionId: RegionId,
  lang: SupportedLanguage = getActiveLanguage()
): RegionTranslation {
  const dict = getDict(lang);
  return dict.regions[regionId] ?? REGIONS_BY_ID[regionId];
}

export function getLocalizedDrillingStratum(
  poolIndex: number | undefined,
  fallbackName: string,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const idx =
    typeof poolIndex === 'number' && poolIndex >= 0
      ? poolIndex
      : ROCK_STRATA_POOL.findIndex((p) => p.layerName === fallbackName);
  if (idx >= 0 && idx < dict.drillingStrata.length) {
    return dict.drillingStrata[idx];
  }
  return fallbackName;
}

export function getLocalizedDrillingHardness(
  poolIndex: number | undefined,
  fallbackHardness: string,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const idx =
    typeof poolIndex === 'number' && poolIndex >= 0
      ? poolIndex
      : ROCK_STRATA_POOL.findIndex((p) => p.hardnessLabel === fallbackHardness);
  if (idx >= 0 && idx < dict.drillingHardness.length) {
    return dict.drillingHardness[idx];
  }
  return fallbackHardness;
}

export function getLocalizedChemicalStratum(
  seqIdx: number | undefined,
  fallbackRock: string,
  fallbackClue: string,
  fallbackPH: string,
  lang: SupportedLanguage = getActiveLanguage()
): { rockName: string; chemicalClue: string; pHLabel: string } {
  const dict = getDict(lang);
  const resolvedIdx =
    typeof seqIdx === 'number' && seqIdx >= 0
      ? seqIdx
      : dict.chemicalStrata.findIndex((s) => s.rockName === fallbackRock) >= 0
        ? dict.chemicalStrata.findIndex((s) => s.rockName === fallbackRock)
        : hu.chemicalStrata.findIndex((s) => s.rockName === fallbackRock);
  if (resolvedIdx >= 0 && resolvedIdx < dict.chemicalStrata.length) {
    return dict.chemicalStrata[resolvedIdx];
  }
  return {
    rockName: fallbackRock,
    chemicalClue: fallbackClue,
    pHLabel: fallbackPH,
  };
}

export function getLocalizedCoreProfile(
  profileKey: 'HIGH' | 'BALANCED' | 'MODERATE' | 'MALUS' | undefined,
  fallbackLabel: string,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  if (profileKey && dict.coreSampleProfiles[profileKey]) {
    return dict.coreSampleProfiles[profileKey];
  }
  if (fallbackLabel.includes('Magas')) return dict.coreSampleProfiles.HIGH;
  if (fallbackLabel.includes('Kiegyensúlyozott')) return dict.coreSampleProfiles.BALANCED;
  if (fallbackLabel.includes('Mérsékelt')) return dict.coreSampleProfiles.MODERATE;
  if (fallbackLabel.includes('Hibás') || fallbackLabel.includes('Sérült')) {
    return dict.coreSampleProfiles.MALUS;
  }
  return fallbackLabel;
}

const KNOWN_EVENT_PREFIXES = Object.keys(en.events);

export function extractEventTemplateId(eventId: string): string | null {
  for (const prefix of KNOWN_EVENT_PREFIXES) {
    if (eventId === prefix || eventId.startsWith(`${prefix}_`)) {
      return prefix;
    }
  }
  return null;
}

export function getLocalizedEvent(
  ev: Pick<
    GeopoliticalEvent,
    | 'id'
    | 'templateId'
    | 'title'
    | 'description'
    | 'affectedRegionId'
    | 'spilledBarrelsAmount'
    | 'rescueOutcome'
    | 'rescueSavedPct'
  >,
  lang: SupportedLanguage = getActiveLanguage()
): { title: string; description: string; crisisLabel: string } {
  const dict = getDict(lang);
  const tplId = ev.templateId ?? extractEventTemplateId(ev.id);
  const tpl = tplId ? dict.events[tplId] : undefined;

  if (!tpl) {
    return {
      title: ev.title,
      description: ev.description,
      crisisLabel: ev.title,
    };
  }

  let title = tpl.title;
  let description = tpl.description;

  if (ev.affectedRegionId) {
    const rStatic = REGIONS_BY_ID[ev.affectedRegionId];
    const rTrans = getLocalizedRegion(ev.affectedRegionId, lang);
    title = `${tpl.title} — ${rStatic.shortCode}`;
    description = `${rTrans.name}: ${tpl.description}`;
  }

  if (ev.spilledBarrelsAmount && ev.spilledBarrelsAmount > 0 && tplId === 'tanker_oil_spill') {
    description += ` (${formatBarrelsI18n(ev.spilledBarrelsAmount, lang)})`;
  }

  if (ev.rescueOutcome === 'SUCCESS') {
    description += ` · ${dict.worldMap.rescueCompleted}`;
  } else if (ev.rescueOutcome === 'EXTERNAL_TEAM') {
    description += ` · ${dict.worldMap.rescueExternalDeployed}`;
  }

  return {
    title,
    description,
    crisisLabel: tpl.crisisLabel,
  };
}

export function getLocalizedRegionCrisisLabel(
  regionId: RegionId,
  crisisTemplateId: string | undefined,
  activeEvents: GeopoliticalEvent[],
  fallbackLabel: string | null,
  lang: SupportedLanguage = getActiveLanguage()
): string | null {
  const dict = getDict(lang);
  const matching = activeEvents.find((ev) => ev.affectedRegionId === regionId);
  const tplId =
    crisisTemplateId ??
    matching?.templateId ??
    (matching ? extractEventTemplateId(matching.id) : null);
  if (tplId && dict.events[tplId]) {
    return dict.events[tplId].crisisLabel;
  }
  return fallbackLabel;
}

const DEFAULT_PLAYER_MOTTOS = new Set<string>(
  Object.values(
    {
      en: en.companies.defaultPlayerMotto,
      hu: hu.companies.defaultPlayerMotto,
      de: de.companies.defaultPlayerMotto,
      es: es.companies.defaultPlayerMotto,
      fr: fr.companies.defaultPlayerMotto,
      pt: pt.companies.defaultPlayerMotto,
      pl: pl.companies.defaultPlayerMotto,
      zh: zh.companies.defaultPlayerMotto,
    }
  )
);

export function getLocalizedCompanyMotto(
  company: Pick<Company, 'id' | 'isPlayer' | 'motto'>,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  if (company.id === 'ai_borealis' || company.id === 'ai_vektor' || company.id === 'ai_meridian') {
    return dict.companies.aiMottos[company.id];
  }
  if (company.isPlayer && DEFAULT_PLAYER_MOTTOS.has(company.motto)) {
    return dict.companies.defaultPlayerMotto;
  }
  return company.motto;
}

export function getLocalizedAnalystCard(
  pairId: number | undefined,
  fallbackDocCode: string,
  fallbackTitle: string,
  fallbackSubtitle: string,
  lang: SupportedLanguage = getActiveLanguage()
): { docCode: string; title: string; subtitle: string } {
  const dict = getDict(lang);
  if (typeof pairId === 'number' && pairId >= 0 && pairId < dict.analystDeck.length) {
    return dict.analystDeck[pairId];
  }
  const matchedIdx = hu.analystDeck.findIndex((c) => c.docCode === fallbackDocCode);
  if (matchedIdx >= 0 && matchedIdx < dict.analystDeck.length) {
    return dict.analystDeck[matchedIdx];
  }
  return {
    docCode: fallbackDocCode,
    title: fallbackTitle,
    subtitle: fallbackSubtitle,
  };
}

export function getLocalizedSabotageRoomLabel(
  roomIndex: number,
  fallbackLabel: string,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  if (roomIndex >= 0 && roomIndex < dict.sabotageRooms.length) {
    return dict.sabotageRooms[roomIndex];
  }
  return fallbackLabel;
}

export function getLocalizedTankerCurrentLabel(
  directionKey: TankerCurrentZoneSpec['directionKey'],
  fallbackLabel: string,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  if (directionKey && dict.tankerCurrents[directionKey]) {
    return dict.tankerCurrents[directionKey];
  }
  const upper = fallbackLabel.toUpperCase();
  if (upper.includes('DÉLI ÁRAMLAT')) return dict.tankerCurrents.SOUTH_CURRENT;
  if (upper.includes('ÉSZAKI ÁRAMLAT')) return dict.tankerCurrents.NORTH_CURRENT;
  if (upper.includes('ÉSZAKI SZÉLLÖKÉS')) return dict.tankerCurrents.NORTH_GUST;
  if (upper.includes('DÉLI SZÉLLÖKÉS')) return dict.tankerCurrents.SOUTH_GUST;
  return fallbackLabel;
}

export function getLocalizedHackLabel(
  hack: Pick<ActiveConcessionHack, 'direction' | 'outputMultiplier' | 'label'>,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const pctDelta = Math.round((hack.outputMultiplier - 1) * 100);
  if (hack.direction === 'BOOST') {
    return interpolate(dict.worldMap.hackBoostLabel, { pct: pctDelta });
  }
  return interpolate(dict.worldMap.hackSabotageLabel, { pct: pctDelta });
}

export function getLocalizedWellDisplayName(
  well: Pick<OilWell, 'id' | 'regionId' | 'name'>,
  _lang: SupportedLanguage = getActiveLanguage()
): string {
  const rStatic = REGIONS_BY_ID[well.regionId];
  const match = well.name.match(/(\d+)/);
  if (match && rStatic) {
    return `${rStatic.shortCode}-${match[1]}`;
  }
  return well.name;
}

export function getLocalizedHorizonLabel(
  maxTurns: number,
  lang: SupportedLanguage = getActiveLanguage()
): string {
  const dict = getDict(lang);
  const horizonYears = Math.round(maxTurns / 12);
  if (horizonYears * 12 === maxTurns) {
    return interpolate(dict.units.yearsCount, { count: horizonYears });
  }
  return interpolate(dict.units.turnsCount, { count: maxTurns });
}

export function getLocalizedGameOverSummary(
  summary: GameOverSummary,
  state: Pick<
    GameState,
    'companies' | 'playerCompanyId' | 'maxTurns' | 'victoryNetWorthTarget'
  >,
  lang: SupportedLanguage = getActiveLanguage()
): { headline: string; detail: string } {
  const dict = getDict(lang);
  const player =
    state.companies.find((c) => c.id === state.playerCompanyId) ??
    state.companies[0];
  const winner =
    state.companies.find((c) => c.id === summary.winnerCompanyId) ?? player;
  const horizon = getLocalizedHorizonLabel(state.maxTurns, lang);

  if (summary.reason === 'BANKRUPTCY') {
    return {
      headline: dict.gameOver.reasons.bankruptcyHeadline,
      detail: interpolate(dict.gameOver.reasons.bankruptcyDetail, {
        playerName: player.name,
      }),
    };
  }

  if (summary.reason === 'VICTORY_TARGET') {
    if (winner.isPlayer) {
      return {
        headline: dict.gameOver.reasons.victoryPlayerHeadline,
        detail: interpolate(dict.gameOver.reasons.victoryPlayerDetail, {
          playerName: player.name,
          target: formatCurrencyI18n(state.victoryNetWorthTarget, lang),
        }),
      };
    }
    return {
      headline: interpolate(dict.gameOver.reasons.victoryRivalHeadline, {
        leaderName: winner.name,
      }),
      detail: interpolate(dict.gameOver.reasons.victoryRivalDetail, {
        leaderName: winner.name,
        target: formatCurrencyI18n(state.victoryNetWorthTarget, lang),
        leaderWorth: formatCurrencyI18n(winner.netWorth, lang),
      }),
    };
  }

  if (winner.id === player.id) {
    return {
      headline: interpolate(dict.gameOver.reasons.horizonWinHeadline, {
        horizon,
      }),
      detail: interpolate(dict.gameOver.reasons.horizonWinDetail, {
        horizon,
        playerName: player.name,
        worth: formatCurrencyI18n(player.netWorth, lang),
      }),
    };
  }

  return {
    headline: interpolate(dict.gameOver.reasons.horizonLossHeadline, {
      horizon,
    }),
    detail: interpolate(dict.gameOver.reasons.horizonLossDetail, {
      winnerName: winner.name,
      worth: formatCurrencyI18n(winner.netWorth, lang),
    }),
  };
}

export function getLocalizedNewsEntry(
  entry: NewsLogEntry,
  context: { startYear: number; startMonth: number },
  lang: SupportedLanguage = getActiveLanguage()
): { dateLabel: string; headline: string; detail: string } {
  const dict = getDict(lang);
  const dateLabel = formatGameDateI18n(
    context.startYear,
    context.startMonth,
    entry.turn,
    lang
  );

  if (!entry.i18nKey || !dict.logEntries[entry.i18nKey]) {
    return {
      dateLabel,
      headline: entry.headline,
      detail: entry.detail,
    };
  }

  const tpl = dict.logEntries[entry.i18nKey];
  const raw = entry.i18nParams ?? {};
  const resolved: Record<string, string | number> = {};

  for (const [k, v] of Object.entries(raw)) {
    resolved[k] = v as string | number;
  }

  // Dynamically hydrate region, currency, barrel, event & period tokens if raw identifiers are stored
  if (typeof raw.regionId === 'string' && raw.regionId in REGIONS_BY_ID) {
    const rid = raw.regionId as RegionId;
    resolved.regionName = getLocalizedRegion(rid, lang).name;
    resolved.regionCode = REGIONS_BY_ID[rid].shortCode;
  }
  if (typeof raw.cashAmount === 'number') {
    resolved.cash = formatCurrencyI18n(raw.cashAmount, lang);
  }
  if (typeof raw.priceAmount === 'number') {
    resolved.price = formatCurrencyI18n(raw.priceAmount, lang);
  }
  if (typeof raw.costAmount === 'number') {
    resolved.cost = formatCurrencyI18n(raw.costAmount, lang);
  }
  if (typeof raw.totalCostAmount === 'number') {
    resolved.totalCost = formatCurrencyI18n(raw.totalCostAmount, lang);
  }
  if (typeof raw.penaltyAmount === 'number') {
    resolved.penalty = formatCurrencyI18n(raw.penaltyAmount, lang);
  }
  if (typeof raw.fineAmount === 'number') {
    resolved.fine = formatCurrencyI18n(raw.fineAmount, lang);
  }
  if (typeof raw.proceedsAmount === 'number') {
    resolved.proceeds = formatCurrencyI18n(raw.proceedsAmount, lang);
  }
  if (typeof raw.unitPriceAmount === 'number') {
    resolved.unitPrice = formatCurrencyI18n(raw.unitPriceAmount, lang);
  }
  if (typeof raw.refundAmount === 'number') {
    resolved.refund = formatCurrencyI18n(raw.refundAmount, lang);
  }
  if (typeof raw.excessAmount === 'number') {
    resolved.excess = formatCurrencyI18n(raw.excessAmount, lang);
  }
  if (typeof raw.amountValue === 'number') {
    resolved.amount = formatCurrencyI18n(raw.amountValue, lang);
  }
  if (typeof raw.leaderWorthAmount === 'number') {
    resolved.leaderWorth = formatCurrencyI18n(raw.leaderWorthAmount, lang);
  }
  if (typeof raw.capacityBbl === 'number') {
    resolved.capacity = formatLocaleNumber(raw.capacityBbl, lang);
  }
  if (typeof raw.barrelsBbl === 'number') {
    resolved.barrels = formatBarrelsI18n(raw.barrelsBbl, lang);
  }
  if (typeof raw.eventTemplateId === 'string' && dict.events[raw.eventTemplateId]) {
    const evTrans = dict.events[raw.eventTemplateId];
    resolved.eventTitle = evTrans.title;
    resolved.eventDesc = evTrans.description;
  }
  if (entry.i18nKey === 'geo_event_regional') {
    const repairCost = typeof raw.repairCostAmount === 'number' ? raw.repairCostAmount : 0;
    const priceMult = typeof raw.priceMultPct === 'number' ? raw.priceMultPct : 100;
    const spilledBbl = typeof raw.spilledBbl === 'number' ? raw.spilledBbl : 0;
    const notes: string[] = [];
    if (priceMult < 100) {
      notes.push(interpolate(dict.worldMap.localSalePrice, { pct: priceMult }).replace(/^\s*·\s*/, ''));
    }
    if (repairCost > 0) {
      notes.push(
        interpolate(dict.worldMap.damageCost, {
          amount: formatCurrencyI18n(repairCost, lang),
        }).replace(/^\s*·\s*/, '')
      );
    }
    if (spilledBbl > 0) {
      notes.push(
        interpolate(dict.tankerPrompt.spilledNotice, {
          barrels: formatBarrelsI18n(spilledBbl, lang),
        })
      );
    }
    resolved.detailNote = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  }
  if (entry.i18nKey === 'contractor_well_drilled') {
    const coreBonusPct = typeof raw.coreBonusPct === 'number' ? raw.coreBonusPct : 0;
    resolved.bonusNote =
      coreBonusPct > 0 ? ` (+${coreBonusPct}%)` : '';
  }
  if (entry.i18nKey === 'manual_well_drilled') {
    const coreBonusPct = typeof raw.coreBonusPct === 'number' ? raw.coreBonusPct : 0;
    resolved.coreNote = coreBonusPct > 0 ? ` (+${coreBonusPct}%)` : '';
  }
  if (entry.i18nKey === 'core_sample_failed') {
    const malus = typeof raw.malusPct === 'number' ? raw.malusPct : 0;
    resolved.malusNote =
      malus < 0
        ? interpolate(dict.coreSampleModal.failedBannerMalusNote, {
            malus: Math.abs(malus),
          })
        : '';
  }
  if (
    entry.i18nKey === 'report_annual_published' ||
    entry.i18nKey === 'report_quarterly_published'
  ) {
    const periodMeta = getReportPeriodMetaI18n(
      context.startYear,
      context.startMonth,
      entry.turn,
      lang
    );
    resolved.year = periodMeta.year;
    resolved.period = periodMeta.periodLabel;
    resolved.date = dateLabel;
  }

  return {
    dateLabel,
    headline: interpolate(tpl.title, resolved),
    detail: interpolate(tpl.description, resolved),
  };
}
