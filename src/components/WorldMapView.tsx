/**
 * Interactive 16-region global map and regional operations inspector.
 * Allows purchasing concessions, building storage tanks, selling regional oil,
 * managing well quotas, and launching manual reaction drilling or contractor drilling.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Crosshair,
  Database,
  DollarSign,
  Eye,
  Factory,
  FlaskConical,
  Lock,
  Navigation,
  Pause,
  Play,
  Shield,
  Terminal,
  Wrench,
} from 'lucide-react';
import { REGIONS_BY_ID, REGIONS_DATA } from '../data/regionsData';
import {
  calculateSaleProceeds,
  calculateWellMonthlyOutput,
  getRegionStorageCapacity,
} from '../engine/economyEngine';
import {
  GameState,
  RegionId,
  SabotageEffectDirection,
} from '../engine/gameTypes';
import {
  getCoreSampleConfig,
  getTankerRescueConfig,
  isTankerRescueEligibleEventId,
} from '../engine/operationsEngine';
import {
  getSabotageContractorCost,
  getSabotageEffectConfig,
  getStealthRoomCount,
  SABOTAGE_CAUGHT_FINE,
  SABOTAGE_MINIGAME_COST,
} from '../engine/sabotageEngine';
import {
  getContractorDrillMultiplier,
  getPlayerCompany,
} from '../engine/turnEngine';
import {
  formatBarrelsI18n,
  formatCurrencyI18n,
  formatLocaleNumber,
  getLocalizedHackLabel,
  getLocalizedRegion,
  getLocalizedRegionCrisisLabel,
  getLocalizedWellDisplayName,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';

interface WorldMapViewProps {
  state: GameState;
  onSelectRegion: (regionId: RegionId) => void;
  onBuyConcession: (regionId: RegionId) => void;
  onBuildTank: (regionId: RegionId) => void;
  onBuildContractorWell: (regionId: RegionId) => void;
  onStartManualDrilling: (regionId: RegionId) => void;
  onStartCoreSampleAnalysis: (regionId: RegionId) => void;
  onHireExternalCoreSample: (regionId: RegionId) => void;
  onStartTankerRescue: (regionId: RegionId, eventId: string) => void;
  onHireExternalTankerFleet: (regionId: RegionId, eventId: string) => void;
  onSellRegionalOil: (regionId: RegionId, barrels: number) => void;
  onAdjustWellQuota: (wellId: string, quotaPct: number) => void;
  onToggleWellStatus: (wellId: string) => void;
  onStartSabotageMinigame: (
    regionId: RegionId,
    direction: SabotageEffectDirection
  ) => void;
  onHireExternalHacker: (
    regionId: RegionId,
    direction: SabotageEffectDirection
  ) => void;
}

export const WorldMapView: React.FC<WorldMapViewProps> = ({
  state,
  onSelectRegion,
  onBuyConcession,
  onBuildTank,
  onBuildContractorWell,
  onStartManualDrilling,
  onStartCoreSampleAnalysis,
  onHireExternalCoreSample,
  onStartTankerRescue,
  onHireExternalTankerFleet,
  onSellRegionalOil,
  onAdjustWellQuota,
  onToggleWellStatus,
  onStartSabotageMinigame,
  onHireExternalHacker,
}) => {
  const { lang, dict } = useI18n();
  const [ownerFilter, setOwnerFilter] = useState<'ALL' | 'MINE' | 'FREE'>('ALL');
  const [hackDirectionByRegion, setHackDirectionByRegion] = useState<
    Partial<Record<RegionId, SabotageEffectDirection>>
  >({});
  const player = getPlayerCompany(state);

  const selectedStatic = REGIONS_BY_ID[state.selectedRegionId];
  const selectedLocalized = getLocalizedRegion(selectedStatic.id, lang);
  const selectedRuntime = state.regions[state.selectedRegionId];
  const selectedCrisisLabel =
    selectedRuntime.activeCrisisTurns > 0
      ? getLocalizedRegionCrisisLabel(
          selectedStatic.id,
          selectedRuntime.crisisTemplateId ?? undefined,
          state.activeEvents,
          selectedRuntime.crisisLabel,
          lang
        )
      : null;
  const selectedOwner = selectedRuntime.ownerCompanyId
    ? state.companies.find((c) => c.id === selectedRuntime.ownerCompanyId) ?? null
    : null;

  const regionWells = useMemo(
    () => state.wells.filter((w) => w.regionId === state.selectedRegionId),
    [state.wells, state.selectedRegionId]
  );

  const filteredRegions = useMemo(() => {
    return REGIONS_DATA.filter((r) => {
      const rt = state.regions[r.id];
      if (ownerFilter === 'MINE') return rt.ownerCompanyId === player.id;
      if (ownerFilter === 'FREE') return rt.ownerCompanyId === null;
      return true;
    });
  }, [ownerFilter, state.regions, player.id]);

  const storageCap = getRegionStorageCapacity(
    selectedStatic.id,
    selectedRuntime
  );
  const storagePct =
    storageCap > 0
      ? Math.min(100, Math.round((selectedRuntime.storedBarrels / storageCap) * 100))
      : 0;

  const contractorCost = Math.round(
    selectedStatic.drillingBaseCost * getContractorDrillMultiplier(state.difficulty)
  );
  const manualUpfrontCost = Math.round(selectedStatic.drillingBaseCost * 0.85);
  const regionalPriceMult = selectedRuntime.crisisPriceMultiplier ?? 1.0;
  const fullRegionalSaleProceeds = calculateSaleProceeds(
    selectedRuntime.storedBarrels,
    state.market.spotPricePerBarrel,
    selectedStatic.id,
    regionalPriceMult
  );
  const activeRegionEvent = state.activeEvents.find(
    (ev) => ev.affectedRegionId === selectedStatic.id
  );

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Retro Vector World Map + Quick Filter Table */}
        <div className="lg:col-span-7 space-y-5">
          <div className="retro-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#354150] bg-[#161C24] px-5 py-3">
              <div>
                <h1 className="font-display text-base font-bold text-[#F3F6FA]">
                  {dict.worldMap.title}
                </h1>
                <p className="text-xs text-[#8D9CAD]">
                  {dict.worldMap.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[#12161B] p-1 border border-[#2B3543]">
                <button
                  type="button"
                  onClick={() => setOwnerFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    ownerFilter === 'ALL'
                      ? 'bg-[#283340] text-[#F3F6FA]'
                      : 'text-[#8D9CAD] hover:text-[#E6ECF2]'
                  }`}
                >
                  {dict.worldMap.filterAll}
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerFilter('MINE')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    ownerFilter === 'MINE'
                      ? 'bg-[#283340] text-[#E59A24]'
                      : 'text-[#8D9CAD] hover:text-[#E6ECF2]'
                  }`}
                >
                  {dict.worldMap.filterMine}
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerFilter('FREE')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    ownerFilter === 'FREE'
                      ? 'bg-[#283340] text-[#44B872]'
                      : 'text-[#8D9CAD] hover:text-[#E6ECF2]'
                  }`}
                >
                  {dict.worldMap.filterFree}
                </button>
              </div>
            </div>

            {/* SVG World Map Projection (1000 x 500) */}
            <div className="relative bg-[#0E141A] p-2">
              <svg
                viewBox="0 0 1000 480"
                className="w-full h-auto block select-none"
                role="img"
                aria-label={dict.worldMap.mapAriaLabel}
              >
                {/* Ocean Background & Retro Coordinate Grid */}
                <rect width="1000" height="480" fill="#0E141A" />
                {[100, 200, 300, 400].map((y) => (
                  <line
                    key={`lat_${y}`}
                    x1="0"
                    y1={y}
                    x2="1000"
                    y2={y}
                    stroke="#1A242F"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}
                {[150, 300, 450, 600, 750, 900].map((x) => (
                  <line
                    key={`lon_${x}`}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="480"
                    stroke="#1A242F"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Stylized Clean Continental Landmasses */}
                <g fill="#1F2934" stroke="#314050" strokeWidth="1.2">
                  {/* North America */}
                  <path d="M95,78 L195,62 L285,84 L292,148 L252,196 L225,228 L198,242 L175,204 L132,165 L92,126 Z" />
                  {/* Greenland */}
                  <path d="M312,38 L372,32 L386,74 L334,86 Z" />
                  {/* South America */}
                  <path d="M268,258 L334,264 L378,314 L352,386 L306,442 L282,424 L274,344 L254,296 Z" />
                  {/* Europe */}
                  <path d="M446,138 L466,86 L546,74 L584,114 L568,158 L516,174 L462,168 Z" />
                  {/* Africa */}
                  <path d="M448,194 L536,188 L592,226 L584,292 L548,378 L508,392 L478,324 L440,254 Z" />
                  {/* Middle East & Asia */}
                  <path d="M578,108 L682,76 L814,82 L898,118 L866,182 L842,232 L772,262 L714,242 L652,248 L602,228 L576,174 Z" />
                  {/* Indonesia / Maritime SE Asia */}
                  <path d="M746,282 L802,286 L824,306 L762,306 Z" />
                  {/* Australia */}
                  <path d="M778,334 L868,326 L898,378 L858,418 L786,404 L768,366 Z" />
                </g>

                {/* 16 Interactive Region Markers */}
                {REGIONS_DATA.map((region) => {
                  const rt = state.regions[region.id];
                  const isSelected = state.selectedRegionId === region.id;
                  const owner = rt.ownerCompanyId
                    ? state.companies.find((c) => c.id === rt.ownerCompanyId)
                    : null;
                  const markerColor = owner ? owner.colorHex : '#64748B';
                  const regionWellCount = state.wells.filter(
                    (w) => w.regionId === region.id
                  ).length;
                  const hasCrisis = rt.activeCrisisTurns > 0;
                  const isPlayerOwnedCrisis =
                    hasCrisis && rt.ownerCompanyId === player.id;
                  const isOtherCrisis =
                    hasCrisis && rt.ownerCompanyId !== player.id;
                  const isDimmed =
                    (ownerFilter === 'MINE' && rt.ownerCompanyId !== player.id) ||
                    (ownerFilter === 'FREE' && rt.ownerCompanyId !== null);

                  return (
                    <g
                      key={region.id}
                      transform={`translate(${region.mapX}, ${region.mapY})`}
                      onClick={() => onSelectRegion(region.id)}
                      className="cursor-pointer"
                      style={{ opacity: isDimmed ? 0.25 : 1 }}
                    >
                      {isPlayerOwnedCrisis && (
                        <>
                          <circle
                            r="23"
                            fill="none"
                            stroke="#EF4444"
                            strokeWidth="2"
                            className="crisis-ring-pulse"
                          />
                          <circle
                            r="27"
                            fill="none"
                            stroke="#EF4444"
                            strokeOpacity="0.45"
                            strokeWidth="1"
                            strokeDasharray="2 3"
                          />
                        </>
                      )}

                      {isSelected && (
                        <circle
                          r="18"
                          fill="none"
                          stroke="#E59A24"
                          strokeWidth="2"
                          strokeDasharray="3 2"
                        />
                      )}

                      <rect
                        x="-18"
                        y="-10"
                        width="36"
                        height="20"
                        rx="2"
                        fill={isPlayerOwnedCrisis ? '#2E1416' : '#12161B'}
                        stroke={
                          isSelected
                            ? '#E59A24'
                            : isPlayerOwnedCrisis
                              ? '#EF4444'
                              : markerColor
                        }
                        strokeWidth={
                          isSelected || isPlayerOwnedCrisis ? '2' : '1.5'
                        }
                      />

                      <rect
                        x="-18"
                        y="-10"
                        width="6"
                        height="20"
                        fill={markerColor}
                      />

                      <text
                        x="3"
                        y="3.5"
                        textAnchor="middle"
                        fill="#F3F6FA"
                        fontSize="9.5"
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight="600"
                      >
                        {region.shortCode}
                      </text>

                      {regionWellCount > 0 && (
                        <text
                          x="0"
                          y="21"
                          textAnchor="middle"
                          fill={isPlayerOwnedCrisis ? '#FCA5A5' : '#A2B0C0'}
                          fontSize="8.5"
                          fontFamily="IBM Plex Mono, monospace"
                          fontWeight={isPlayerOwnedCrisis ? '700' : '400'}
                        >
                          {regionWellCount} {dict.worldMap.wellShortSuffix}
                        </text>
                      )}

                      {isPlayerOwnedCrisis && (
                        <>
                          <g transform="translate(18, -12)">
                            <polygon
                              points="0,-8 7.5,5.5 -7.5,5.5"
                              fill="#EF4444"
                              stroke="#FEF2F2"
                              strokeWidth="1"
                            />
                            <text
                              x="0"
                              y="3.5"
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="8.5"
                              fontWeight="800"
                            >
                              !
                            </text>
                          </g>
                          <text
                            x="0"
                            y={regionWellCount > 0 ? 31 : 21}
                            textAnchor="middle"
                            fill="#F87171"
                            fontSize="7.5"
                            fontFamily="IBM Plex Mono, monospace"
                            fontWeight="700"
                          >
                            {dict.worldMap.crisisShort}
                          </text>
                        </>
                      )}

                      {isOtherCrisis && (
                        <g transform="translate(16, -11)" opacity="0.85">
                          <circle r="4.8" fill="#7C2D28" stroke="#D94436" strokeWidth="0.8" />
                          <text
                            x="0"
                            y="2.5"
                            textAnchor="middle"
                            fill="#FDE8E8"
                            fontSize="7.5"
                            fontWeight="700"
                          >
                            !
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Map Legend */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#1D2631] px-3 pt-2.5 pb-1 text-xs text-[#9FB0C2]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 bg-[#64748B]" />
                    <span>{dict.worldMap.legendFree}</span>
                  </span>
                  {state.companies.map((c) => (
                    <span key={c.id} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5"
                        style={{ backgroundColor: c.colorHex }}
                      />
                      <span>{c.name}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1 text-[#F87171] font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 text-[#EF4444]" />
                    <span>{dict.worldMap.legendOwnCrisis}</span>
                  </span>
                  <span className="text-[#94A3B8]">
                    {dict.worldMap.legendOtherCrisis}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Compact 16-region Quick Selection Table */}
          <div className="retro-panel overflow-hidden">
            <div className="border-b border-[#354150] bg-[#161C24] px-5 py-2.5 text-xs font-semibold text-[#C3CFD9]">
              {interpolate(dict.worldMap.quickTableTitle, {
                count: filteredRegions.length,
              })}
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-[#2D3846] bg-[#181F28] text-[#8D9CAD]">
                  <tr>
                    <th className="px-4 py-2 font-semibold">
                      {dict.worldMap.colRegion}
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {dict.worldMap.colOwner}
                    </th>
                    <th className="px-4 py-2 font-semibold text-right">
                      {dict.worldMap.colConcession}
                    </th>
                    <th className="px-4 py-2 font-semibold text-right">
                      {dict.worldMap.colOutputPerWell}
                    </th>
                    <th className="px-4 py-2 font-semibold text-right">
                      {dict.worldMap.colDifficulty}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252E3A]">
                  {filteredRegions.map((r) => {
                    const rt = state.regions[r.id];
                    const locR = getLocalizedRegion(r.id, lang);
                    const owner = rt.ownerCompanyId
                      ? state.companies.find((c) => c.id === rt.ownerCompanyId)
                      : null;
                    const isSelected = state.selectedRegionId === r.id;
                    const isPlayerCrisisRow =
                      rt.activeCrisisTurns > 0 && rt.ownerCompanyId === player.id;
                    const isOtherCrisisRow =
                      rt.activeCrisisTurns > 0 && rt.ownerCompanyId !== player.id;

                    return (
                      <tr
                        key={r.id}
                        onClick={() => onSelectRegion(r.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#E59A24]/15 text-[#F8FAFC]'
                            : isPlayerCrisisRow
                              ? 'bg-[#2C1719]/80 hover:bg-[#381C1E] text-[#FDE8E8]'
                              : 'hover:bg-[#222A35] text-[#CBD5E1]'
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[#E59A24]">
                              {r.shortCode}
                            </span>
                            <span>{locR.name}</span>
                            {isPlayerCrisisRow && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F87171]">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span>
                                  {interpolate(dict.worldMap.crisisTag, {
                                    turns: rt.activeCrisisTurns,
                                  })}
                                </span>
                              </span>
                            )}
                            {isOtherCrisisRow && (
                              <span className="text-[11px] text-[#94A3B8]">
                                · {dict.worldMap.crisisShort}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {owner ? (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0"
                                style={{ backgroundColor: owner.colorHex }}
                              />
                              <span className="truncate max-w-[140px]">
                                {owner.isPlayer
                                  ? dict.worldMap.ownerYou
                                  : owner.name}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#44B872]">
                              {dict.worldMap.ownerAvailable}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums text-right">
                          {formatCurrencyI18n(r.concessionBasePrice, lang)}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums text-right">
                          {formatLocaleNumber(r.baseWellOutputBbl, lang)}{' '}
                          {dict.units.barrelShort}
                        </td>
                        <td className="px-4 py-2 font-mono tabular-nums text-right">
                          {r.drillingDifficulty}/5 ({r.strataCount}{' '}
                          {dict.worldMap.strataCountSuffix})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Selected Region Inspector & Operations */}
        <div className="lg:col-span-5 retro-panel p-6 space-y-5">
          {/* Header & Unboxed Metadata */}
          <div className="border-b border-[#2D3846] pb-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[#9FB0C2]">
                  {selectedLocalized.continent} ·{' '}
                  {selectedStatic.offshore
                    ? dict.worldMap.offshoreTag
                    : dict.worldMap.onshoreTag}{' '}
                  · {selectedStatic.shortCode}
                </div>
                <h2 className="font-display text-xl font-bold text-[#F8FAFC] mt-0.5">
                  {selectedLocalized.name}
                </h2>
              </div>

              <div className="text-right text-xs shrink-0">
                <div className="text-[#8D9CAD]">{dict.worldMap.ownerLabel}</div>
                <div className="font-semibold text-[#F3F6FA]">
                  {selectedOwner
                    ? selectedOwner.name
                    : dict.worldMap.freeConcession}
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#B4C1CF]">
              {selectedLocalized.description}
            </p>
            <p className="text-xs text-[#8D9CAD]">
              {dict.worldMap.geologyPrefix} {selectedLocalized.geologyNote}
            </p>
          </div>

          {/* Crisis Warning if Active */}
          {selectedRuntime.activeCrisisTurns > 0 && (
            <div className="border border-[#D94436]/60 bg-[#2C1819] p-3.5 text-xs space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-[#F18B82]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {interpolate(dict.worldMap.activeCrisisTitle, {
                      label:
                        selectedCrisisLabel ??
                        selectedRuntime.crisisLabel ??
                        '',
                      turns: selectedRuntime.activeCrisisTurns,
                    })}
                  </span>
                </div>
                <p className="text-[#E2B4B0] font-mono tabular-nums">
                  {selectedRuntime.crisisOutputMultiplier === 0
                    ? dict.worldMap.fullShutdown
                    : interpolate(dict.worldMap.localExtractionMult, {
                        pct: Math.round(
                          selectedRuntime.crisisOutputMultiplier * 100
                        ),
                      })}
                  {regionalPriceMult < 1
                    ? interpolate(dict.worldMap.localSalePrice, {
                        pct: Math.round(regionalPriceMult * 100),
                      })
                    : ''}
                  {activeRegionEvent?.ownerRepairCost &&
                  activeRegionEvent.ownerRepairCost > 0
                    ? interpolate(dict.worldMap.damageCost, {
                        amount: formatCurrencyI18n(
                          activeRegionEvent.ownerRepairCost,
                          lang
                        ),
                      })
                    : ''}
                </p>
              </div>

              {/* Marine / Storm Tanker Rescue Actions for Player */}
              {selectedOwner?.isPlayer &&
                activeRegionEvent &&
                isTankerRescueEligibleEventId(activeRegionEvent.id) &&
                (() => {
                  const baseRepair = activeRegionEvent.ownerRepairCost ?? 0;
                  const isStormOnly =
                    activeRegionEvent.id.startsWith('storm_disruption') &&
                    baseRepair <= 0;
                  const cfg = getTankerRescueConfig(
                    state.difficulty,
                    baseRepair,
                    isStormOnly
                  );

                  if (activeRegionEvent.rescueAttempted) {
                    return (
                      <div className="border-t border-[#D94436]/40 pt-2 text-[11px] font-semibold text-[#CBD5E1]">
                        {activeRegionEvent.rescueOutcome === 'SUCCESS'
                          ? dict.worldMap.rescueCompleted
                          : activeRegionEvent.rescueOutcome === 'EXTERNAL_TEAM'
                            ? dict.worldMap.rescueExternalDeployed
                            : interpolate(dict.worldMap.rescueFailed, {
                                mult: cfg.failMultiplier,
                              })}
                      </div>
                    );
                  }

                  return (
                    <div className="border-t border-[#D94436]/40 pt-2.5 space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-[#F9D697]">
                        <Anchor className="h-3.5 w-3.5 text-[#38BDF8]" />
                        <span>{dict.worldMap.marineRescueAvailable}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onStartTankerRescue(
                              selectedStatic.id,
                              activeRegionEvent.id
                            )
                          }
                          className="retro-button flex flex-col items-start gap-0.5 bg-[#E59A24] px-3 py-2 text-left text-[#12161B] hover:bg-[#F0A938] cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                            <Navigation className="h-3.5 w-3.5" />
                            <span>{dict.worldMap.manualTankerTitle}</span>
                          </span>
                          <span className="font-mono text-[10px] tabular-nums font-medium">
                            {interpolate(dict.worldMap.manualTankerDesc, {
                              mult: cfg.failMultiplier,
                            })}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={player.cash < cfg.externalFleetFee}
                          onClick={() =>
                            onHireExternalTankerFleet(
                              selectedStatic.id,
                              activeRegionEvent.id
                            )
                          }
                          className="retro-button flex flex-col items-start gap-0.5 bg-[#25303C] px-3 py-2 text-left text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                            <Anchor className="h-3.5 w-3.5 text-[#38BDF8]" />
                            <span>{dict.worldMap.externalTankerTitle}</span>
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-[#B4C1CF]">
                            {interpolate(dict.worldMap.externalTankerDesc, {
                              cost: formatCurrencyI18n(
                                cfg.externalFleetFee,
                                lang
                              ),
                            })}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}

          {/* Active Government Hack / Sabotage Banner */}
          {selectedRuntime.activeHack &&
            selectedRuntime.activeHack.turnsRemaining > 0 && (
              <div
                className={`border p-3.5 text-xs space-y-1 ${
                  selectedRuntime.activeHack.direction === 'BOOST'
                    ? 'border-[#2E9E5B]/60 bg-[#15281D]'
                    : 'border-[#E59A24]/60 bg-[#272015]'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  <Terminal className="h-4 w-4 shrink-0" />
                  <span
                    className={
                      selectedRuntime.activeHack.direction === 'BOOST'
                        ? 'text-[#44B872]'
                        : 'text-[#E59A24]'
                    }
                  >
                    {interpolate(dict.worldMap.activeHackTitle, {
                      label: getLocalizedHackLabel(
                        selectedRuntime.activeHack,
                        lang
                      ),
                    })}
                  </span>
                </div>
                <p className="text-[#CBD5E1] font-mono tabular-nums">
                  {interpolate(dict.worldMap.hackDurationPrefix, {
                    turns: selectedRuntime.activeHack.turnsRemaining,
                  })}
                  {selectedRuntime.activeHack.executedVia === 'MINIGAME'
                    ? dict.worldMap.hackExecManual
                    : dict.worldMap.hackExecExternal}
                </p>
              </div>
            )}

          {/* Region Economic Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 border border-[#2B3543] bg-[#141920] p-4 text-xs">
            <div>
              <div className="text-[#8D9CAD]">
                {dict.worldMap.remainingReserves}
              </div>
              <div className="font-mono font-semibold tabular-nums text-[#E6ECF2] mt-0.5">
                {formatBarrelsI18n(selectedRuntime.remainingReservesBbl, lang)}
              </div>
            </div>
            <div>
              <div className="text-[#8D9CAD]">
                {dict.worldMap.logisticsPriceMult}
              </div>
              <div className="font-mono font-semibold tabular-nums text-[#E59A24] mt-0.5">
                {Math.round(
                  selectedStatic.logisticsMultiplier * regionalPriceMult * 100
                )}
                % (
                {formatCurrencyI18n(
                  selectedStatic.logisticsMultiplier *
                    regionalPriceMult *
                    state.market.spotPricePerBarrel,
                  lang
                )}
                {dict.units.perBarrel})
              </div>
            </div>
            <div>
              <div className="text-[#8D9CAD]">
                {dict.worldMap.politicalStability}
              </div>
              <div className="font-mono font-semibold tabular-nums text-[#E6ECF2] mt-0.5 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#44B872]" />
                <span>{selectedStatic.politicalStability}%</span>
              </div>
            </div>
            <div>
              <div className="text-[#8D9CAD]">
                {dict.worldMap.drillingProfile}
              </div>
              <div className="font-mono font-semibold tabular-nums text-[#E6ECF2] mt-0.5">
                {interpolate(dict.worldMap.difficultyRating, {
                  diff: selectedStatic.drillingDifficulty,
                  strata: selectedStatic.strataCount,
                })}
              </div>
            </div>
          </div>

          {/* Case A: Unowned Region -> Buy Concession */}
          {selectedRuntime.ownerCompanyId === null && (
            <div className="space-y-3 border-t border-[#2D3846] pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#B4C1CF]">
                  {dict.worldMap.concessionFee}
                </span>
                <span className="font-mono text-base font-bold tabular-nums text-[#E59A24]">
                  {formatCurrencyI18n(selectedStatic.concessionBasePrice, lang)}
                </span>
              </div>
              <button
                type="button"
                disabled={player.cash < selectedStatic.concessionBasePrice}
                onClick={() => onBuyConcession(selectedStatic.id)}
                className="retro-button w-full bg-[#E59A24] px-4 py-3 text-sm font-bold text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {player.cash >= selectedStatic.concessionBasePrice
                  ? dict.worldMap.buyConcession
                  : dict.worldMap.insufficientCash}
              </button>
            </div>
          )}

          {/* Case B: Owned by AI Rival */}
          {selectedOwner && !selectedOwner.isPlayer && (() => {
            const analystTurns =
              state.analystAccessTurnsByCompanyId?.[selectedOwner.id] ?? 0;
            const hasAnalystAccess = analystTurns > 0;

            return (
              <div className="border-t border-[#2D3846] pt-4 space-y-3 text-xs text-[#B4C1CF]">
                <p>
                  {interpolate(dict.worldMap.rivalOperatedNotice, {
                    name: selectedOwner.name,
                  })}
                </p>

                <div className="grid grid-cols-2 gap-3 border border-[#2B3543] bg-[#141920] p-3 font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[#8D9CAD]">
                      {dict.worldMap.activeWells}
                    </div>
                    <div className="text-[#F3F6FA] font-semibold mt-0.5">
                      {regionWells.length} {dict.units.piecesShort}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[#8D9CAD]">
                      {dict.worldMap.storageTanks}
                    </div>
                    <div className="text-[#F3F6FA] font-semibold mt-0.5">
                      {selectedRuntime.tanksCount} {dict.units.piecesShort}{' '}
                      {interpolate(dict.worldMap.maxCapacityPrefix, {
                        cap: formatBarrelsI18n(storageCap, lang),
                      })}
                    </div>
                  </div>
                  <div className="col-span-2 border-t border-[#232B35] pt-2 flex items-center justify-between">
                    <span className="font-sans text-[#8D9CAD]">
                      {dict.worldMap.storedInventory}
                    </span>
                    {hasAnalystAccess ? (
                      <span className="font-semibold text-[#44B872] flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        <span>
                          {formatBarrelsI18n(
                            selectedRuntime.storedBarrels,
                            lang
                          )}{' '}
                          ({storagePct}% ·{' '}
                          {interpolate(dict.worldMap.monthsRemaining, {
                            turns: analystTurns,
                          })}
                          )
                        </span>
                      </span>
                    ) : (
                      <span className="text-[#E59A24] flex items-center gap-1.5 font-sans font-medium">
                        <Lock className="h-3.5 w-3.5" />
                        <span>{dict.worldMap.confidentialData}</span>
                      </span>
                    )}
                  </div>
                </div>

                {!hasAnalystAccess && (
                  <div className="border border-[#2D3846] bg-[#12161B] px-3 py-2.5 text-[11px] text-[#9FB0C2]">
                    {dict.worldMap.auditHint}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Case C: Owned by Player -> Storage, Drilling & Wells Management */}
          {selectedOwner && selectedOwner.isPlayer && (
            <div className="space-y-5 border-t border-[#2D3846] pt-4">
              {/* Storage & Sales */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[#E6ECF2]">
                    <Database className="h-3.5 w-3.5 text-[#E59A24]" />
                    <span>
                      {interpolate(dict.worldMap.storageHeading, {
                        count: selectedRuntime.tanksCount,
                        max: selectedStatic.maxTanksAllowed,
                      })}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#B4C1CF]">
                    {formatLocaleNumber(selectedRuntime.storedBarrels, lang)} /{' '}
                    {formatBarrelsI18n(storageCap, lang)}
                  </span>
                </div>

                {/* Storage Progress Bar */}
                <div className="h-2.5 w-full bg-[#12161B] border border-[#2D3846] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      storagePct >= 90 ? 'bg-[#D94436]' : 'bg-[#2E9E5B]'
                    }`}
                    style={{ width: `${storagePct}%` }}
                  />
                </div>

                {selectedRuntime.tanksCount === 0 && (
                  <p className="text-xs text-[#E59A24]">
                    {dict.worldMap.buildTankAlert}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      selectedRuntime.tanksCount >=
                        selectedStatic.maxTanksAllowed ||
                      player.cash < selectedStatic.tankBuildCost
                    }
                    onClick={() => onBuildTank(selectedStatic.id)}
                    className="retro-button flex-1 bg-[#25303C] px-3 py-2 text-xs font-semibold text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {interpolate(dict.worldMap.buildTankButton, {
                      cost: formatCurrencyI18n(
                        selectedStatic.tankBuildCost,
                        lang
                      ),
                    })}
                  </button>

                  {selectedRuntime.storedBarrels > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onSellRegionalOil(
                          selectedStatic.id,
                          selectedRuntime.storedBarrels
                        )
                      }
                      className="retro-button flex items-center gap-1.5 bg-[#2E9E5B] px-3 py-2 text-xs font-bold text-white hover:bg-[#36B56A] whitespace-nowrap cursor-pointer"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      <span>
                        {interpolate(dict.worldMap.sellInventoryButton, {
                          proceeds: formatCurrencyI18n(
                            fullRegionalSaleProceeds,
                            lang
                          ),
                        })}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Drilling Options */}
              <div className="space-y-2.5 border-t border-[#2D3846] pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-[#E6ECF2]">
                    <Factory className="h-3.5 w-3.5 text-[#E59A24]" />
                    <span>
                      {interpolate(dict.worldMap.wellsHeading, {
                        count: regionWells.length,
                        max: selectedStatic.maxWellsAllowed,
                      })}
                    </span>
                    {selectedRuntime.activeCrisisTurns > 0 &&
                      (selectedRuntime.crisisOutputMultiplier < 1 ||
                        regionalPriceMult < 1) &&
                      regionWells.some((w) => w.status === 'ACTIVE') && (
                        <span className="inline-flex items-center gap-1 text-[#F87171] font-semibold">
                          <span>·</span>
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>
                            {interpolate(dict.worldMap.wellsAffected, {
                              count: regionWells.filter(
                                (w) => w.status === 'ACTIVE'
                              ).length,
                            })}
                          </span>
                        </span>
                      )}
                  </span>
                  <span className="font-mono tabular-nums text-[#8D9CAD]">
                    {interpolate(dict.worldMap.opexPrefix, {
                      cost: formatCurrencyI18n(
                        selectedStatic.wellMonthlyOpex,
                        lang
                      ),
                    })}
                  </span>
                </div>

                {/* Onshore Geological Core Sample Pre-Survey */}
                {!selectedStatic.offshore &&
                  regionWells.length < selectedStatic.maxWellsAllowed &&
                  (() => {
                    const activeReport =
                      selectedRuntime.coreSampleReport &&
                      !selectedRuntime.coreSampleReport.consumed
                        ? selectedRuntime.coreSampleReport
                        : null;
                    const coreCfg = getCoreSampleConfig(state.difficulty);

                    if (activeReport) {
                      return (
                        <div
                          className={`border p-3 text-xs space-y-1 ${
                            activeReport.isMalus
                              ? 'border-[#D94436]/60 bg-[#281618]'
                              : 'border-[#2E9E5B]/60 bg-[#15281D]'
                          }`}
                        >
                          <div
                            className={`flex items-center justify-between gap-2 font-bold ${
                              activeReport.isMalus
                                ? 'text-[#F87171]'
                                : 'text-[#44B872]'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {activeReport.isMalus
                                  ? dict.worldMap.damagedCoreTitle
                                  : dict.worldMap.activeCoreTitle}
                              </span>
                            </span>
                            <span className="font-mono text-[11px] tabular-nums">
                              {activeReport.reservoirPressureBar} bar
                            </span>
                          </div>
                          {activeReport.isMalus ? (
                            <p className="text-[#E2B4B0] text-[11px]">
                              {interpolate(dict.worldMap.damagedCoreDesc, {
                                margin: -5,
                              })}
                            </p>
                          ) : (
                            <p className="font-mono text-[11px] tabular-nums text-[#CBD5E1]">
                              {interpolate(dict.worldMap.activeCoreEstimate, {
                                output: formatBarrelsI18n(
                                  activeReport.estimatedWellOutputBbl,
                                  lang
                                ),
                                margin: Math.round(
                                  (activeReport.greenZoneMultiplier - 1) * 100
                                ),
                                bonus: activeReport.efficiencyBonusPct,
                              })}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="border border-[#2D3846] bg-[#141920] p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-[#E6ECF2]">
                            <FlaskConical className="h-3.5 w-3.5 text-[#38BDF8]" />
                            <span>{dict.worldMap.corePreSurveyHeading}</span>
                          </span>
                          <span className="text-[11px] text-[#8D9CAD]">
                            {dict.worldMap.onshoreAdvantageBadge}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={player.cash < coreCfg.ownTeamCost}
                            onClick={() =>
                              onStartCoreSampleAnalysis(selectedStatic.id)
                            }
                            className="retro-button flex flex-col items-start gap-0.5 bg-[#1B2A38] border border-[#38BDF8]/50 px-3 py-2 text-left text-[#E6ECF2] hover:bg-[#223548] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-bold text-[#38BDF8] whitespace-nowrap">
                              <FlaskConical className="h-3.5 w-3.5" />
                              <span>{dict.worldMap.onsiteCoreButton}</span>
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-[#CBD5E1]">
                              {interpolate(dict.worldMap.onsiteCoreDesc, {
                                cost: formatCurrencyI18n(
                                  coreCfg.ownTeamCost,
                                  lang
                                ),
                                margin: Math.round(
                                  (coreCfg.greenZoneMultiplier - 1) * 100
                                ),
                                yield: coreCfg.efficiencyBonusPct,
                              })}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={player.cash < coreCfg.externalTeamCost}
                            onClick={() =>
                              onHireExternalCoreSample(selectedStatic.id)
                            }
                            className="retro-button flex flex-col items-start gap-0.5 bg-[#25303C] px-3 py-2 text-left text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                              <FlaskConical className="h-3.5 w-3.5 text-[#E59A24]" />
                              <span>{dict.worldMap.externalGeoButton}</span>
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-[#B4C1CF]">
                              {interpolate(dict.worldMap.externalGeoInstantDesc, {
                                cost: formatCurrencyI18n(
                                  coreCfg.externalTeamCost,
                                  lang
                                ),
                                bonus: coreCfg.externalEfficiencyBonusPct,
                              })}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                {regionWells.length < selectedStatic.maxWellsAllowed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={player.cash < manualUpfrontCost}
                      onClick={() => onStartManualDrilling(selectedStatic.id)}
                      className="retro-button flex flex-col items-start gap-0.5 bg-[#E59A24] px-3.5 py-2.5 text-left text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                        <Crosshair className="h-3.5 w-3.5" />
                        <span>{dict.worldMap.manualDrillButton}</span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums font-medium">
                        {interpolate(dict.worldMap.manualDrillDesc, {
                          cost: formatCurrencyI18n(manualUpfrontCost, lang),
                        })}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={player.cash < contractorCost}
                      onClick={() => onBuildContractorWell(selectedStatic.id)}
                      className="retro-button flex flex-col items-start gap-0.5 bg-[#25303C] px-3.5 py-2.5 text-left text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                        <Wrench className="h-3.5 w-3.5 text-[#E59A24]" />
                        <span>
                          {interpolate(dict.worldMap.contractorDrillButton, {
                            mult: Math.round(
                              getContractorDrillMultiplier(state.difficulty) *
                                100
                            ),
                          })}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-[#B4C1CF]">
                        {interpolate(dict.worldMap.contractorDrillDesc, {
                          cost: formatCurrencyI18n(contractorCost, lang),
                        })}
                      </span>
                    </button>
                  </div>
                )}

                {/* Active Wells List */}
                {regionWells.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {regionWells.map((well) => {
                      const estOutput = calculateWellMonthlyOutput(
                        well,
                        selectedRuntime
                      );
                      const isAffectedByCrisis =
                        well.status === 'ACTIVE' &&
                        selectedRuntime.activeCrisisTurns > 0 &&
                        (selectedRuntime.crisisOutputMultiplier < 1 ||
                          regionalPriceMult < 1);
                      const crisisImpactText =
                        selectedRuntime.crisisOutputMultiplier === 0
                          ? dict.worldMap.wellCrisisHalted
                          : selectedRuntime.crisisOutputMultiplier < 1
                            ? interpolate(dict.worldMap.wellCrisisReduced, {
                                pct: Math.round(
                                  selectedRuntime.crisisOutputMultiplier * 100
                                ),
                              })
                            : interpolate(
                                dict.worldMap.wellCrisisPricePressure,
                                {
                                  pct: Math.round(regionalPriceMult * 100),
                                }
                              );

                      return (
                        <div
                          key={well.id}
                          className={`border p-3 text-xs space-y-2 ${
                            isAffectedByCrisis
                              ? 'border-[#D94436]/75 bg-[#241518]'
                              : 'border-[#2D3846] bg-[#141920]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div>
                                <span className="font-semibold text-[#F3F6FA]">
                                  {getLocalizedWellDisplayName(well, lang)}
                                </span>
                                {well.efficiencyBonusPct > 0 && (
                                  <span className="ml-2 font-mono text-[#44B872]">
                                    {interpolate(dict.worldMap.wellBonusTag, {
                                      pct: well.efficiencyBonusPct,
                                    })}
                                  </span>
                                )}
                              </div>
                              {isAffectedByCrisis && (
                                <div className="flex items-center gap-1 text-[11px] font-medium text-[#F87171]">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span>{crisisImpactText}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`font-mono tabular-nums ${
                                  isAffectedByCrisis
                                    ? 'text-[#F87171] font-semibold'
                                    : 'text-[#E59A24]'
                                }`}
                              >
                                {formatBarrelsI18n(estOutput, lang)}
                                {dict.units.perMonth}
                              </span>
                              {well.status !== 'DEPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => onToggleWellStatus(well.id)}
                                  className="retro-button flex items-center gap-1 bg-[#232B35] px-2 py-1 text-[11px] font-medium text-[#CBD5E1] hover:bg-[#2F3A48] whitespace-nowrap cursor-pointer"
                                >
                                  {well.status === 'ACTIVE' ? (
                                    <>
                                      <Pause className="h-3 w-3" />
                                      <span>{dict.worldMap.pauseTooltip}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3 text-[#44B872]" />
                                      <span>{dict.worldMap.resumeTooltip}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {well.status !== 'DEPLETED' ? (
                            <div className="flex items-center gap-3">
                              <label
                                htmlFor={`quota_${well.id}`}
                                className="text-[#8D9CAD] font-mono tabular-nums whitespace-nowrap"
                              >
                                {interpolate(dict.worldMap.quotaLabel, {
                                  pct: well.productionQuotaPct,
                                })}
                              </label>
                              <input
                                id={`quota_${well.id}`}
                                type="range"
                                min={0}
                                max={100}
                                step={10}
                                value={well.productionQuotaPct}
                                onChange={(e) =>
                                  onAdjustWellQuota(
                                    well.id,
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full accent-[#E59A24] cursor-pointer"
                              />
                            </div>
                          ) : (
                            <div className="text-[#E8665A]">
                              {dict.worldMap.statusDepleted}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#8D9CAD]">
                    {dict.worldMap.noWellsHint}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Government System Hack & Concession Sabotage (Owned by Player or Rival) */}
          {selectedOwner &&
            (() => {
              const selectedDir: SabotageEffectDirection =
                hackDirectionByRegion[selectedStatic.id] ??
                (selectedOwner.isPlayer ? 'BOOST' : 'SABOTAGE');
              const boostCfg = getSabotageEffectConfig(state.difficulty, 'BOOST');
              const sabCfg = getSabotageEffectConfig(
                state.difficulty,
                'SABOTAGE'
              );
              const lockdownTurns = selectedRuntime.sabotageLockdownTurns ?? 0;
              const roomsCount = getStealthRoomCount(state.difficulty);

              return (
                <div className="space-y-3 border-t border-[#2D3846] pt-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-[#E6ECF2]">
                      <Terminal className="h-3.5 w-3.5 text-[#E59A24]" />
                      <span>{dict.worldMap.sabotageSectionTitle}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-[#8D9CAD]">
                      {interpolate(dict.worldMap.sabotageRoomsUnit, {
                        count: roomsCount,
                      })}
                    </span>
                  </div>

                  {lockdownTurns > 0 ? (
                    <div className="border border-[#E59A24]/45 bg-[#231D14] px-3 py-2.5 text-xs text-[#F9D697]">
                      {interpolate(dict.worldMap.lockdownNotice, {
                        turns: lockdownTurns,
                      })}
                    </div>
                  ) : (
                    <>
                      {/* Free Choice Direction Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setHackDirectionByRegion((prev) => ({
                              ...prev,
                              [selectedStatic.id]: 'BOOST',
                            }))
                          }
                          className={`border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                            selectedDir === 'BOOST'
                              ? 'border-[#2E9E5B] bg-[#16291E] text-[#F8FAFC]'
                              : 'border-[#2D3846] bg-[#141920] text-[#9FB0C2] hover:border-[#475569]'
                          }`}
                        >
                          <div className="font-bold text-[#44B872]">
                            {interpolate(dict.worldMap.boostTab, {
                              pct: Math.round(
                                (boostCfg.outputMultiplier - 1) * 100
                              ),
                            })}
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-[#CBD5E1] mt-0.5">
                            {interpolate(dict.worldMap.boostSummary, {
                              pct: Math.round(
                                (boostCfg.outputMultiplier - 1) * 100
                              ),
                              months: boostCfg.durationMonths,
                            })}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setHackDirectionByRegion((prev) => ({
                              ...prev,
                              [selectedStatic.id]: 'SABOTAGE',
                            }))
                          }
                          className={`border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                            selectedDir === 'SABOTAGE'
                              ? 'border-[#D94436] bg-[#2D1819] text-[#F8FAFC]'
                              : 'border-[#2D3846] bg-[#141920] text-[#9FB0C2] hover:border-[#475569]'
                          }`}
                        >
                          <div className="font-bold text-[#E8665A]">
                            {interpolate(dict.worldMap.sabotageTab, {
                              pct: Math.round(
                                (sabCfg.outputMultiplier - 1) * 100
                              ),
                            })}
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-[#CBD5E1] mt-0.5">
                            {interpolate(dict.worldMap.sabotageSummary, {
                              pct: Math.round(
                                (sabCfg.outputMultiplier - 1) * 100
                              ),
                              months: sabCfg.durationMonths,
                              fine: formatCurrencyI18n(sabCfg.ownerFine, lang),
                            })}
                          </div>
                        </button>
                      </div>

                      {/* Execution Method: Stealth Mode vs External Crew */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={player.cash < SABOTAGE_MINIGAME_COST}
                          onClick={() =>
                            onStartSabotageMinigame(
                              selectedStatic.id,
                              selectedDir
                            )
                          }
                          className="retro-button flex flex-col items-start gap-0.5 bg-[#E59A24] px-3.5 py-2.5 text-left text-[#12161B] hover:bg-[#F0A938] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                            <Terminal className="h-3.5 w-3.5" />
                            <span>{dict.worldMap.manualInfiltrationButton}</span>
                          </span>
                          <span className="font-mono text-[11px] tabular-nums font-medium">
                            {interpolate(dict.worldMap.manualInfiltrationDesc, {
                              cost: formatCurrencyI18n(
                                SABOTAGE_MINIGAME_COST,
                                lang
                              ),
                              rooms: roomsCount,
                              fine: formatCurrencyI18n(
                                SABOTAGE_CAUGHT_FINE,
                                lang
                              ),
                            })}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={
                            player.cash < getSabotageContractorCost(state.difficulty)
                          }
                          onClick={() =>
                            onHireExternalHacker(selectedStatic.id, selectedDir)
                          }
                          className="retro-button flex flex-col items-start gap-0.5 bg-[#25303C] px-3.5 py-2.5 text-left text-[#F3F6FA] hover:bg-[#313F4F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                            <Shield className="h-3.5 w-3.5 text-[#E59A24]" />
                            <span>{dict.worldMap.externalHackersButton}</span>
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-[#B4C1CF]">
                            {interpolate(dict.worldMap.externalHackersDesc, {
                              cost: formatCurrencyI18n(
                                getSabotageContractorCost(state.difficulty),
                                lang
                              ),
                            })}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
};
