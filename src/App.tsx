/**
 * Root Crude Tycoon application orchestrating the state machine,
 * engine mutations, audio feedback, and browser localStorage persistence.
 */

import React, { useEffect, useState } from 'react';
import { AnalystMinigameModal } from './components/AnalystMinigameModal';
import { AnnualReportModal } from './components/AnnualReportModal';
import { CompaniesSubView, CompaniesView } from './components/CompaniesView';
import { CoreSampleMinigameModal } from './components/CoreSampleMinigameModal';
import { DrillingMinigameModal } from './components/DrillingMinigameModal';
import { GameOverModal } from './components/GameOverModal';
import { MarketView } from './components/MarketView';
import { MonthlySummaryModal } from './components/MonthlySummaryModal';
import { NewsTicker } from './components/NewsTicker';
import { NewsView } from './components/NewsView';
import { SabotageMinigameModal } from './components/SabotageMinigameModal';
import { SaveLoadModal } from './components/SaveLoadModal';
import { TankerRescuePromptModal } from './components/TankerRescuePromptModal';
import { TankerSpillMinigameModal } from './components/TankerSpillMinigameModal';
import { TitleScreen } from './components/TitleScreen';
import { TopBar } from './components/TopBar';
import { WorldMapView } from './components/WorldMapView';
import {
  ActiveTab,
  DifficultyLevel,
  GameState,
  RegionId,
  SabotageEffectDirection,
} from './engine/gameTypes';
import { SABOTAGE_CAUGHT_FINE, SABOTAGE_LOCKDOWN_MONTHS } from './engine/sabotageEngine';
import {
  adjustWellQuota,
  advanceMonthlyTurn,
  ANALYST_AUDIT_DURATION_MONTHS,
  buildContractorWell,
  buildStorageTank,
  buyRegionConcession,
  chargeDrillingRetryCost,
  completeAnalystMinigame,
  completeConcessionSabotageMinigame,
  completeCoreSampleAnalysis,
  completeManualDrillingMinigame,
  completeTankerRescueOperation,
  createInitialGameState,
  dismissTankerRescuePrompt,
  getPlayerCompany,
  hireExternalCoreSampleInstitute,
  hireExternalHackContractor,
  hireExternalTankerRescueFleet,
  hireMarketAnalyst,
  repayBankLoan,
  sellAllStoredOil,
  sellStoredOil,
  startAnalystMinigameSession,
  startConcessionSabotageMinigame,
  startCoreSampleAnalysis,
  startManualDrillingSession,
  startTankerRescueOperation,
  takeBankLoan,
  toggleWellStatus,
} from './engine/turnEngine';
import { formatCurrencyI18n, interpolate } from './i18n';
import { useI18n } from './i18n/I18nContext';
import { soundFx } from './utils/soundFx';
import {
  deleteSlot,
  listSaveSlots,
  loadAutosave,
  loadFromSlot,
  saveAutosave,
  saveToSlot,
} from './utils/storage';

export default function App() {
  const { lang, dict } = useI18n();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [saveSlots, setSaveSlots] = useState(() => listSaveSlots(lang));
  const [hasAutosave, setHasAutosave] = useState(() => loadAutosave() !== null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [companiesSubView, setCompaniesSubView] =
    useState<CompaniesSubView>('STANDINGS');
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    tone: 'INFO' | 'ERROR' | 'SUCCESS';
  } | null>(null);

  const showToast = (
    text: string,
    tone: 'INFO' | 'ERROR' | 'SUCCESS' = 'INFO'
  ) => {
    setToastMsg({ text, tone });
  };

  useEffect(() => {
    setSaveSlots(listSaveSlots(lang));
  }, [lang]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  const refreshSaves = () => {
    setSaveSlots(listSaveSlots(lang));
    setHasAutosave(loadAutosave() !== null);
  };

  const handleStartNewGame = (
    companyName: string,
    difficulty: DifficultyLevel
  ) => {
    soundFx.setMuted(false);
    soundFx.turnAdvance();
    const initial = createInitialGameState(companyName, difficulty, false);
    setCompaniesSubView('STANDINGS');
    setGameState(initial);
    saveAutosave(initial);
    refreshSaves();
  };

  const handleContinueAutosave = () => {
    const loaded = loadAutosave();
    if (loaded) {
      soundFx.setMuted(loaded.soundMuted);
      soundFx.click();
      setGameState(loaded);
    }
  };

  const handleLoadSlot = (slotId: string) => {
    const loaded = loadFromSlot(slotId);
    if (loaded) {
      soundFx.setMuted(loaded.soundMuted);
      soundFx.click();
      setGameState(loaded);
      setShowSaveModal(false);
      const slotLabel =
        saveSlots.find((s) => s.slotId === slotId)?.label ?? slotId;
      showToast(
        interpolate(dict.toasts.loadedFromSlot, { label: slotLabel }),
        'SUCCESS'
      );
    }
  };

  const handleSaveSlot = (slotId: string) => {
    if (!gameState) return;
    saveToSlot(slotId, gameState);
    soundFx.cash();
    refreshSaves();
    showToast(dict.toasts.slotSavedBrowser, 'SUCCESS');
  };

  const handleDeleteSlot = (slotId: string) => {
    deleteSlot(slotId);
    soundFx.click();
    refreshSaves();
  };

  if (!gameState || gameState.screen === 'TITLE_MENU') {
    return (
      <TitleScreen
        hasAutosave={hasAutosave}
        saveSlots={saveSlots}
        onStartNewGame={handleStartNewGame}
        onContinueAutosave={handleContinueAutosave}
        onLoadSlot={handleLoadSlot}
        onDeleteSlot={handleDeleteSlot}
      />
    );
  }

  const player = getPlayerCompany(gameState);

  const handleSelectTab = (tab: ActiveTab) => {
    soundFx.click();
    setGameState((prev) => (prev ? { ...prev, activeTab: tab } : prev));
  };

  const handleAdvanceTurn = () => {
    soundFx.turnAdvance();
    setGameState((prev) => {
      if (!prev) return prev;
      const next = advanceMonthlyTurn(prev);
      saveAutosave(next);
      return next;
    });
  };

  const handleToggleMute = () => {
    setGameState((prev) => {
      if (!prev) return prev;
      const nextMuted = !prev.soundMuted;
      soundFx.setMuted(nextMuted);
      if (!nextMuted) soundFx.click();
      return { ...prev, soundMuted: nextMuted };
    });
  };

  const handleReturnToTitle = () => {
    saveAutosave(gameState);
    refreshSaves();
    setGameState(null);
  };

  const handleBuyConcession = (regionId: RegionId) => {
    const res = buyRegionConcession(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.concessionBought, 'SUCCESS');
  };

  const handleBuildTank = (regionId: RegionId) => {
    const res = buildStorageTank(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.tankBuilt, 'SUCCESS');
  };

  const handleBuildContractorWell = (regionId: RegionId) => {
    const res = buildContractorWell(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.layerBreakthrough();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.contractorWellBuilt, 'SUCCESS');
  };

  const handleStartManualDrilling = (regionId: RegionId) => {
    const res = startManualDrillingSession(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.click();
    setGameState(res.state);
  };

  const handleChargeDrillingRetry = (cost: number): boolean => {
    const res = chargeDrillingRetryCost(gameState, cost);
    if (res.error) {
      showToast(res.error, 'ERROR');
      return false;
    }
    setGameState(res.state);
    return true;
  };

  const handleFinishDrillingMinigame = (
    success: boolean,
    averageAccuracyPct: number,
    mistakesCount: number
  ) => {
    if (!gameState.drillingSession) return;
    const regionId = gameState.drillingSession.regionId;
    const next = completeManualDrillingMinigame(
      gameState,
      success,
      regionId,
      averageAccuracyPct,
      mistakesCount
    );
    setGameState(next);
    saveAutosave(next);
    if (success) {
      soundFx.cash();
      showToast(dict.toasts.manualDrillSuccess, 'SUCCESS');
    } else {
      showToast(dict.toasts.manualDrillFailed, 'ERROR');
    }
  };

  const handleSellRegionalOil = (regionId: RegionId, barrels: number) => {
    const res = sellStoredOil(gameState, regionId, barrels);
    if (res.proceeds > 0) {
      soundFx.cash();
      setGameState(res.state);
      saveAutosave(res.state);
      showToast(
        interpolate(dict.toasts.oilSoldRegion, {
          amount: formatCurrencyI18n(res.proceeds, lang),
        }),
        'SUCCESS'
      );
    }
  };

  const handleSellAllOil = () => {
    const res = sellAllStoredOil(gameState);
    if (res.totalProceeds > 0) {
      soundFx.cash();
      setGameState(res.state);
      saveAutosave(res.state);
      showToast(
        interpolate(dict.toasts.oilSoldAll, {
          amount: formatCurrencyI18n(res.totalProceeds, lang),
        }),
        'SUCCESS'
      );
    }
  };

  const handleTakeLoan = (amount: number) => {
    const res = takeBankLoan(gameState, amount);
    if (res.error) {
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
  };

  const handleRepayLoan = (amount: number) => {
    const res = repayBankLoan(gameState, amount);
    if (res.error) {
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
  };

  const handleHireAnalyst = (companyId: string) => {
    const res = hireMarketAnalyst(gameState, companyId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(
      interpolate(dict.toasts.analystHired, {
        months: ANALYST_AUDIT_DURATION_MONTHS,
      }),
      'SUCCESS'
    );
  };

  const handleStartAnalystMinigame = (companyId: string) => {
    const res = startAnalystMinigameSession(gameState, companyId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.click();
    setGameState(res.state);
  };

  const handleFinishAnalystMinigame = (
    success: boolean,
    mistakesCount: number
  ) => {
    if (!gameState.analystSession) return;
    const rewardMonths = gameState.analystSession.rewardMonths;
    const next = completeAnalystMinigame(gameState, success, mistakesCount);
    setGameState(next);
    saveAutosave(next);
    if (success) {
      soundFx.cash();
      showToast(
        interpolate(dict.toasts.internalAuditSuccess, {
          months: rewardMonths,
        }),
        'SUCCESS'
      );
    } else {
      showToast(dict.toasts.internalAuditFailed, 'ERROR');
    }
  };

  const handleStartSabotageMinigame = (
    regionId: RegionId,
    direction: SabotageEffectDirection
  ) => {
    const res = startConcessionSabotageMinigame(gameState, regionId, direction);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.click();
    setGameState(res.state);
  };

  const handleFinishSabotageMinigame = (
    outcome: 'SUCCESS' | 'CAUGHT' | 'ABORTED'
  ) => {
    if (!gameState.sabotageSession) return;
    const next = completeConcessionSabotageMinigame(gameState, outcome);
    setGameState(next);
    saveAutosave(next);
    if (outcome === 'SUCCESS') {
      soundFx.cash();
      showToast(dict.toasts.sabotageSuccess, 'SUCCESS');
    } else if (outcome === 'CAUGHT') {
      soundFx.alarmTriggered();
      showToast(
        interpolate(dict.toasts.sabotageCaught, {
          fine: formatCurrencyI18n(SABOTAGE_CAUGHT_FINE, lang),
          months: SABOTAGE_LOCKDOWN_MONTHS,
        }),
        'ERROR'
      );
    } else {
      showToast(dict.toasts.sabotageAborted, 'INFO');
    }
  };

  const handleHireExternalHacker = (
    regionId: RegionId,
    direction: SabotageEffectDirection
  ) => {
    const res = hireExternalHackContractor(gameState, regionId, direction);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.externalHackerSuccess, 'SUCCESS');
  };

  const handleStartCoreSampleAnalysis = (regionId: RegionId) => {
    const res = startCoreSampleAnalysis(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.click();
    setGameState(res.state);
  };

  const handleFinishCoreSample = (
    outcome: 'SUCCESS' | 'FAILED' | 'ABORTED'
  ) => {
    if (!gameState.coreSampleSession) return;
    const next = completeCoreSampleAnalysis(gameState, outcome);
    setGameState(next);
    saveAutosave(next);
    if (outcome === 'SUCCESS') {
      soundFx.cash();
      showToast(dict.toasts.coreSampleSuccess, 'SUCCESS');
    } else if (outcome === 'FAILED') {
      showToast(dict.toasts.coreSampleFailed, 'ERROR');
    } else {
      showToast(dict.toasts.coreSampleAborted, 'INFO');
    }
  };

  const handleHireExternalCoreSample = (regionId: RegionId) => {
    const res = hireExternalCoreSampleInstitute(gameState, regionId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.externalCoreSuccess, 'SUCCESS');
  };

  const handleStartTankerRescue = (regionId: RegionId, eventId: string) => {
    const res = startTankerRescueOperation(gameState, regionId, eventId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.click();
    setGameState(res.state);
  };

  const handleFinishTankerRescue = (outcome: 'SUCCESS' | 'FAILED') => {
    if (!gameState.tankerSession) return;
    const next = completeTankerRescueOperation(gameState, outcome);
    setGameState(next);
    saveAutosave(next);
    if (outcome === 'SUCCESS') {
      soundFx.cash();
      showToast(dict.toasts.tankerWin, 'SUCCESS');
    } else {
      soundFx.alarmTriggered();
      showToast(dict.toasts.tankerFail, 'ERROR');
    }
  };

  const handleHireExternalTankerFleet = (
    regionId: RegionId,
    eventId: string
  ) => {
    const res = hireExternalTankerRescueFleet(gameState, regionId, eventId);
    if (res.error) {
      soundFx.drillFailure();
      showToast(res.error, 'ERROR');
      return;
    }
    soundFx.cash();
    setGameState(res.state);
    saveAutosave(res.state);
    showToast(dict.toasts.externalTankerSuccess, 'SUCCESS');
  };

  const handleDismissTankerPrompt = () => {
    soundFx.click();
    const next = dismissTankerRescuePrompt(gameState);
    setGameState(next);
    saveAutosave(next);
  };

  return (
    <div className="min-h-screen bg-[#12161B] text-[#E6ECF2] flex flex-col">
      <TopBar
        state={gameState}
        onSelectTab={handleSelectTab}
        onAdvanceTurn={handleAdvanceTurn}
        onOpenSaveModal={() => {
          refreshSaves();
          setShowSaveModal(true);
        }}
        onToggleMute={handleToggleMute}
        onReturnToTitle={handleReturnToTitle}
      />

      {/* Non-intrusive Feedback Toast */}
      {toastMsg && (
        <div className="mx-auto mt-3 w-full max-w-[1440px] px-6">
          <div
            role="status"
            className={`border px-4 py-2 text-xs font-semibold ${
              toastMsg.tone === 'ERROR'
                ? 'border-[#D94436] bg-[#2D1819] text-[#F4A59D]'
                : toastMsg.tone === 'SUCCESS'
                  ? 'border-[#2E9E5B] bg-[#16291E] text-[#A2E4BC]'
                  : 'border-[#E59A24] bg-[#272015] text-[#F9D697]'
            }`}
          >
            {toastMsg.text}
          </div>
        </div>
      )}

      <main className="flex-1 pb-12">
        {gameState.activeTab === 'MAP' && (
          <WorldMapView
            state={gameState}
            onSelectRegion={(regionId) => {
              soundFx.click();
              setGameState((prev) =>
                prev ? { ...prev, selectedRegionId: regionId } : prev
              );
            }}
            onBuyConcession={handleBuyConcession}
            onBuildTank={handleBuildTank}
            onBuildContractorWell={handleBuildContractorWell}
            onStartManualDrilling={handleStartManualDrilling}
            onStartCoreSampleAnalysis={handleStartCoreSampleAnalysis}
            onHireExternalCoreSample={handleHireExternalCoreSample}
            onStartTankerRescue={handleStartTankerRescue}
            onHireExternalTankerFleet={handleHireExternalTankerFleet}
            onSellRegionalOil={handleSellRegionalOil}
            onAdjustWellQuota={(wellId, quotaPct) =>
              setGameState((prev) =>
                prev ? adjustWellQuota(prev, wellId, quotaPct) : prev
              )
            }
            onToggleWellStatus={(wellId) => {
              soundFx.click();
              setGameState((prev) =>
                prev ? toggleWellStatus(prev, wellId) : prev
              );
            }}
            onStartSabotageMinigame={handleStartSabotageMinigame}
            onHireExternalHacker={handleHireExternalHacker}
          />
        )}

        {gameState.activeTab === 'MARKET' && (
          <MarketView
            state={gameState}
            onSellRegionalOil={handleSellRegionalOil}
            onSellAllOil={handleSellAllOil}
            onTakeLoan={handleTakeLoan}
            onRepayLoan={handleRepayLoan}
          />
        )}

        {gameState.activeTab === 'COMPANIES' && (
          <CompaniesView
            state={gameState}
            activeSubView={companiesSubView}
            onChangeSubView={setCompaniesSubView}
            onHireAnalyst={handleHireAnalyst}
            onStartAnalystMinigame={handleStartAnalystMinigame}
          />
        )}

        {gameState.activeTab === 'NEWS' && <NewsView state={gameState} />}
      </main>

      {/* Bottom 90s Scrolling Wire Ticker */}
      <NewsTicker state={gameState} onNavigateTab={handleSelectTab} />

      {/* Two-Bar Reaction Drilling Minigame Overlay */}
      {gameState.screen === 'DRILLING_MINIGAME' && gameState.drillingSession && (
        <DrillingMinigameModal
          session={gameState.drillingSession}
          playerCash={player.cash}
          onChargeRetry={handleChargeDrillingRetry}
          onFinishMinigame={handleFinishDrillingMinigame}
        />
      )}

      {/* Document-Matching Memory Analyst Minigame Overlay */}
      {gameState.screen === 'ANALYST_MINIGAME' && gameState.analystSession && (
        <AnalystMinigameModal
          session={gameState.analystSession}
          onFinishMinigame={handleFinishAnalystMinigame}
        />
      )}

      {/* 2D Stealth Corridor Government-System Hack Overlay */}
      {gameState.screen === 'SABOTAGE_MINIGAME' && gameState.sabotageSession && (
        <SabotageMinigameModal
          session={gameState.sabotageSession}
          onFinishMinigame={handleFinishSabotageMinigame}
        />
      )}

      {/* 2D Maritime Inertia Tanker Rescue Operation */}
      {gameState.screen === 'TANKER_MINIGAME' && gameState.tankerSession && (
        <TankerSpillMinigameModal
          session={gameState.tankerSession}
          onFinishOperation={handleFinishTankerRescue}
        />
      )}

      {/* Geological Core Sample Chemical & Pressure Ordering Lab */}
      {gameState.screen === 'CORE_SAMPLE_MINIGAME' &&
        gameState.coreSampleSession && (
          <CoreSampleMinigameModal
            session={gameState.coreSampleSession}
            onFinishOperation={handleFinishCoreSample}
          />
        )}

      {/* End-of-Turn Monthly Financial Summary Modal */}
      {gameState.screen === 'PLAYING' &&
        gameState.pendingMonthlySummary !== null && (
          <MonthlySummaryModal
            summary={gameState.pendingMonthlySummary}
            startYear={gameState.startYear}
            startMonth={gameState.startMonth}
            hasPendingAnnualReport={gameState.pendingAnnualReportTurn !== null}
            onClose={() => {
              soundFx.click();
              setGameState((prev) => {
                if (!prev) return prev;
                const next = { ...prev, pendingMonthlySummary: null };
                saveAutosave(next);
                return next;
              });
            }}
          />
        )}

      {/* Year-End Annual Report Modal (opens after Monthly Summary closes) */}
      {gameState.screen === 'PLAYING' &&
        gameState.pendingMonthlySummary === null &&
        gameState.pendingAnnualReportTurn !== null && (
          <AnnualReportModal
            state={gameState}
            reportTurn={gameState.pendingAnnualReportTurn}
            onClose={() => {
              soundFx.click();
              setGameState((prev) => {
                if (!prev) return prev;
                const next = { ...prev, pendingAnnualReportTurn: null };
                saveAutosave(next);
                return next;
              });
            }}
            onOpenReportsArchive={() => {
              soundFx.click();
              setCompaniesSubView('REPORTS');
              setGameState((prev) => {
                if (!prev) return prev;
                const next: GameState = {
                  ...prev,
                  activeTab: 'COMPANIES',
                  pendingAnnualReportTurn: null,
                };
                saveAutosave(next);
                return next;
              });
            }}
          />
        )}

      {/* Turn-Transition Emergency Tanker Rescue Alert Modal */}
      {gameState.screen === 'PLAYING' &&
        gameState.pendingMonthlySummary === null &&
        gameState.pendingAnnualReportTurn === null &&
        gameState.pendingTankerRescuePrompt !== null && (
          <TankerRescuePromptModal
            prompt={gameState.pendingTankerRescuePrompt}
            difficulty={gameState.difficulty}
            playerCash={player.cash}
            onStartManualRescue={handleStartTankerRescue}
            onHireExternalFleet={handleHireExternalTankerFleet}
            onDismiss={handleDismissTankerPrompt}
          />
        )}

      {/* Save / Load Modal */}
      {showSaveModal && (
        <SaveLoadModal
          saveSlots={saveSlots}
          onSaveSlot={handleSaveSlot}
          onLoadSlot={handleLoadSlot}
          onDeleteSlot={handleDeleteSlot}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Game Over Summary Modal */}
      {gameState.screen === 'GAME_OVER' && (
        <GameOverModal
          state={gameState}
          onContinueEndless={() =>
            setGameState((prev) =>
              prev
                ? {
                    ...prev,
                    screen: 'PLAYING',
                    endlessMode: true,
                    gameOverSummary: null,
                  }
                : prev
            )
          }
          onRestartNewGame={() => {
            setGameState(null);
            refreshSaves();
          }}
        />
      )}
    </div>
  );
}
