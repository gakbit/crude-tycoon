/**
 * Local browser storage persistence manager for Crude Tycoon save slots and autosave.
 */

import { formatGameDate } from '../engine/economyEngine';
import {
  GameState,
  QuarterlyReportSnapshot,
  SaveSlotSummary,
} from '../engine/gameTypes';
import {
  createEmptyTurnLedger,
  getPlayerCompany,
  getReportPeriodMeta,
} from '../engine/turnEngine';
import {
  extractEventTemplateId,
  formatGameDateI18n,
  getActiveLanguage,
  getDict,
  SupportedLanguage,
} from '../i18n';

const AUTOSAVE_KEY = 'crude_tycoon_autosave_v1';
const SLOT_PREFIX = 'crude_tycoon_slot_v1_';
export const MANUAL_SLOT_IDS = ['slot_1', 'slot_2', 'slot_3'];

function normalizeLoadedState(rawState: GameState): GameState {
  const dateLabel = formatGameDate(
    rawState.startYear,
    rawState.startMonth,
    rawState.turn
  );
  const loadedPlayer = getPlayerCompany(rawState);

  const normalizedEvents = (rawState.activeEvents ?? []).map((ev) => ({
    ...ev,
    templateId: ev.templateId ?? extractEventTemplateId(ev.id) ?? undefined,
  }));

  const normalizedRegions = Object.fromEntries(
    Object.entries(rawState.regions).map(([id, rt]) => {
      const matchingEv = normalizedEvents.find(
        (ev) => ev.affectedRegionId === id
      );
      const report = rt.coreSampleReport
        ? {
            ...rt.coreSampleReport,
            profileKey:
              rt.coreSampleReport.profileKey ??
              (rt.coreSampleReport.isMalus
                ? ('MALUS' as const)
                : rt.coreSampleReport.reservoirPressureBar >= 360
                  ? ('HIGH' as const)
                  : rt.coreSampleReport.reservoirPressureBar >= 300
                    ? ('BALANCED' as const)
                    : ('MODERATE' as const)),
          }
        : null;
      return [
        id,
        {
          ...rt,
          crisisTemplateId:
            rt.crisisTemplateId ??
            (matchingEv
              ? (matchingEv.templateId ?? extractEventTemplateId(matchingEv.id))
              : null),
          crisisPriceMultiplier: rt.crisisPriceMultiplier ?? 1.0,
          activeHack: rt.activeHack ?? null,
          sabotageLockdownTurns: rt.sabotageLockdownTurns ?? 0,
          coreSampleReport: report,
        },
      ];
    })
  ) as GameState['regions'];

  const fallbackLedger = createEmptyTurnLedger(loadedPlayer.cash);
  const rawLedger = rawState.currentTurnLedger;
  const openingLabel = getDict(getActiveLanguage()).dates.openingLabel;

  return {
    ...rawState,
    screen: 'PLAYING',
    drillingSession: null,
    analystSession: null,
    sabotageSession: null,
    tankerSession: null,
    coreSampleSession: null,
    activeEvents: normalizedEvents,
    pendingTankerRescuePrompt: rawState.pendingTankerRescuePrompt
      ? {
          ...rawState.pendingTankerRescuePrompt,
          templateId:
            rawState.pendingTankerRescuePrompt.templateId ??
            extractEventTemplateId(rawState.pendingTankerRescuePrompt.eventId) ??
            undefined,
        }
      : null,
    analystAccessTurnsByCompanyId: rawState.analystAccessTurnsByCompanyId ?? {},
    sabotageHistory: rawState.sabotageHistory ?? [],
    pendingAnnualReportTurn: rawState.pendingAnnualReportTurn ?? null,
    pendingMonthlySummary: rawState.pendingMonthlySummary
      ? {
          ...rawState.pendingMonthlySummary,
          crisisRescueRefund: rawState.pendingMonthlySummary.crisisRescueRefund ?? 0,
          crisisRescueCost: rawState.pendingMonthlySummary.crisisRescueCost ?? 0,
          coreSampleCost: rawState.pendingMonthlySummary.coreSampleCost ?? 0,
        }
      : null,
    currentTurnLedger: rawLedger
      ? {
          ...fallbackLedger,
          ...rawLedger,
          crisisRescueRefund: rawLedger.crisisRescueRefund ?? 0,
          sabotageCost: rawLedger.sabotageCost ?? 0,
          sabotageFineCost: rawLedger.sabotageFineCost ?? 0,
          crisisRescueCost: rawLedger.crisisRescueCost ?? 0,
          coreSampleCost: rawLedger.coreSampleCost ?? 0,
        }
      : fallbackLedger,
    regionalCrisesInYear: rawState.regionalCrisesInYear ?? 0,
    market: {
      ...rawState.market,
      flatPriceTurnsInYear: rawState.market.flatPriceTurnsInYear ?? 0,
    },
    regions: normalizedRegions,
    companies: rawState.companies.map((c) => {
      const fallbackTurn = c.lastPublishedReport?.reportedAtTurn ?? rawState.turn;
      const fallbackMeta =
        fallbackTurn >= 3 && fallbackTurn % 3 === 0
          ? getReportPeriodMeta(
              rawState.startYear,
              rawState.startMonth,
              fallbackTurn
            )
          : { periodType: 'OPENING' as const, periodLabel: openingLabel };

      const normalizedLastReport: QuarterlyReportSnapshot = {
        reportedAtTurn: fallbackTurn,
        reportedDateLabel:
          c.lastPublishedReport?.reportedDateLabel ?? dateLabel,
        periodType:
          c.lastPublishedReport?.periodType ?? fallbackMeta.periodType,
        periodLabel:
          c.lastPublishedReport?.periodLabel ?? fallbackMeta.periodLabel,
        cash: c.lastPublishedReport?.cash ?? c.cash,
        debt: c.lastPublishedReport?.debt ?? c.debt,
        netWorth: c.lastPublishedReport?.netWorth ?? c.netWorth,
        quarterlyProductionBbl:
          c.lastPublishedReport?.quarterlyProductionBbl ?? 0,
        quarterlyProfit: c.lastPublishedReport?.quarterlyProfit ?? 0,
        annualProductionBbl: c.lastPublishedReport?.annualProductionBbl,
        annualProfit: c.lastPublishedReport?.annualProfit,
      };

      const normalizedHistory: QuarterlyReportSnapshot[] =
        c.reportHistory && c.reportHistory.length > 0
          ? c.reportHistory.map((item) => {
              const meta =
                item.reportedAtTurn >= 3 && item.reportedAtTurn % 3 === 0
                  ? getReportPeriodMeta(
                      rawState.startYear,
                      rawState.startMonth,
                      item.reportedAtTurn
                    )
                  : {
                      periodType: 'OPENING' as const,
                      periodLabel: openingLabel,
                    };
              return {
                ...item,
                periodType: item.periodType ?? meta.periodType,
                periodLabel: item.periodLabel ?? meta.periodLabel,
                debt: item.debt ?? 0,
              };
            })
          : normalizedLastReport.reportedAtTurn >= 3
            ? [normalizedLastReport]
            : [];

      return {
        ...c,
        quarterAccumulatedProductionBbl: c.quarterAccumulatedProductionBbl ?? 0,
        quarterAccumulatedProfit: c.quarterAccumulatedProfit ?? 0,
        yearAccumulatedProductionBbl: c.yearAccumulatedProductionBbl ?? 0,
        yearAccumulatedProfit: c.yearAccumulatedProfit ?? 0,
        lastPublishedReport: normalizedLastReport,
        reportHistory: normalizedHistory,
      };
    }),
  };
}

export function saveAutosave(state: GameState): void {
  try {
    if (state.screen === 'TITLE_MENU') return;
    const sanitized: GameState = {
      ...state,
      screen:
        state.screen === 'DRILLING_MINIGAME' ||
        state.screen === 'ANALYST_MINIGAME' ||
        state.screen === 'SABOTAGE_MINIGAME' ||
        state.screen === 'TANKER_MINIGAME' ||
        state.screen === 'CORE_SAMPLE_MINIGAME'
          ? 'PLAYING'
          : state.screen,
      drillingSession: null,
      analystSession: null,
      sabotageSession: null,
      tankerSession: null,
      coreSampleSession: null,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadAutosave(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || !parsed.companies || !parsed.regions) return null;
    return normalizeLoadedState(parsed);
  } catch {
    return null;
  }
}

export function saveToSlot(slotId: string, state: GameState): void {
  try {
    const sanitized: GameState = {
      ...state,
      screen:
        state.screen === 'DRILLING_MINIGAME' ||
        state.screen === 'ANALYST_MINIGAME' ||
        state.screen === 'SABOTAGE_MINIGAME' ||
        state.screen === 'TANKER_MINIGAME' ||
        state.screen === 'CORE_SAMPLE_MINIGAME'
          ? 'PLAYING'
          : state.screen,
      drillingSession: null,
      analystSession: null,
      sabotageSession: null,
      tankerSession: null,
      coreSampleSession: null,
    };
    const payload = {
      savedAtIso: new Date().toISOString(),
      state: sanitized,
    };
    localStorage.setItem(`${SLOT_PREFIX}${slotId}`, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadFromSlot(slotId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slotId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAtIso: string; state: GameState };
    if (!parsed?.state?.companies) return null;
    return normalizeLoadedState(parsed.state);
  } catch {
    return null;
  }
}

export function deleteSlot(slotId: string): void {
  try {
    localStorage.removeItem(`${SLOT_PREFIX}${slotId}`);
  } catch {
    // Ignore
  }
}

export function listSaveSlots(
  lang: SupportedLanguage = getActiveLanguage()
): Array<{
  slotId: string;
  label: string;
  summary: SaveSlotSummary | null;
}> {
  const defaultNames = getDict(lang).saveLoadModal.defaultSlotNames;
  const labels: Record<string, string> = {
    slot_1: defaultNames[0],
    slot_2: defaultNames[1],
    slot_3: defaultNames[2],
  };

  return MANUAL_SLOT_IDS.map((slotId) => {
    try {
      const raw = localStorage.getItem(`${SLOT_PREFIX}${slotId}`);
      if (!raw) {
        return { slotId, label: labels[slotId], summary: null };
      }
      const parsed = JSON.parse(raw) as { savedAtIso: string; state: GameState };
      const player = getPlayerCompany(parsed.state);
      return {
        slotId,
        label: labels[slotId],
        summary: {
          slotId,
          label: labels[slotId],
          savedAtIso: parsed.savedAtIso,
          companyName: player.name,
          turn: parsed.state.turn,
          startYear: parsed.state.startYear,
          startMonth: parsed.state.startMonth,
          dateLabel: formatGameDateI18n(
            parsed.state.startYear,
            parsed.state.startMonth,
            parsed.state.turn,
            lang
          ),
          netWorth: player.netWorth,
          cash: player.cash,
        },
      };
    } catch {
      return { slotId, label: labels[slotId], summary: null };
    }
  });
}
