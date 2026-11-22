/**
 * Top-down 2D maritime inertia navigation operation (Lunar-Lander physics on stormy water).
 * Player steers a damaged oil tanker through reefs, drifting debris, and cross-currents
 * into the safe harbor buoy zone before the countdown expires.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Compass,
  Navigation,
  RotateCcw,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import { REGIONS_BY_ID } from '../data/regionsData';
import {
  TankerCurrentZoneSpec,
  TankerMinigameSession,
} from '../engine/gameTypes';
import {
  formatCurrencyI18n,
  getLocalizedEvent,
  getLocalizedRegion,
  getLocalizedTankerCurrentLabel,
  interpolate,
} from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { soundFx } from '../utils/soundFx';

interface TankerSpillMinigameModalProps {
  session: TankerMinigameSession;
  onFinishOperation: (outcome: 'SUCCESS' | 'FAILED') => void;
}

interface ActiveCurrentInfo {
  directionKey?: TankerCurrentZoneSpec['directionKey'];
  label: string;
}

interface ShipPhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hullHp: number;
  invulnTimer: number;
  timeLeft: number;
  activeCurrent: ActiveCurrentInfo | null;
}

interface WakeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export const TankerSpillMinigameModal: React.FC<
  TankerSpillMinigameModalProps
> = ({ session, onFinishOperation }) => {
  const { dict, lang } = useI18n();
  const dictRef = useRef(dict);
  dictRef.current = dict;

  const regionStatic = REGIONS_BY_ID[session.regionId];
  const regionTrans = getLocalizedRegion(session.regionId, lang);
  const localizedEventTitle = getLocalizedEvent(
    {
      id: session.eventId,
      templateId: session.templateId,
      title: session.eventTitle,
      description: '',
      affectedRegionId: session.regionId,
    },
    lang
  ).title;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<'READY' | 'PLAYING' | 'SUCCESS' | 'FAILED'>(
    'READY'
  );
  const [failReasonKind, setFailReasonKind] = useState<'HULL' | 'TIMEOUT' | null>(
    null
  );
  const [hudState, setHudState] = useState({
    timeLeft: session.timeLimitSec,
    hullHp: session.maxHullHp,
    speedKnots: 0,
    activeCurrent: null as ActiveCurrentInfo | null,
    distancePct: 0,
  });

  const controlsRef = useRef({
    thrust: false,
    reverse: false,
    left: false,
    right: false,
  });

  const shipRef = useRef<ShipPhysicsState>({
    x: session.startX,
    y: session.startY,
    vx: 0,
    vy: 0,
    angle: 0,
    hullHp: session.maxHullHp,
    invulnTimer: 0,
    timeLeft: session.timeLimitSec,
    activeCurrent: null,
  });

  const hazardsRef = useRef(session.hazards.map((h) => ({ ...h })));
  const particlesRef = useRef<WakeParticle[]>([]);

  // Draw current scene onto Canvas (used in both READY preview and PLAYING loop)
  const renderScene = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = session.worldWidth;
      const H = session.worldHeight;
      const ship = shipRef.current;

      // Deep ocean radar canvas background
      ctx.fillStyle = '#0B1826';
      ctx.fillRect(0, 0, W, H);

      // Subtle maritime sonar grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 60; gx < W; gx += 60) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 55; gy < H; gy += 55) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Northern and Southern coastal shallow shoal banks
      ctx.fillStyle = '#182430';
      ctx.fillRect(0, 0, W, 24);
      ctx.fillRect(0, H - 24, W, 24);
      ctx.strokeStyle = '#E59A24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(W, 24);
      ctx.moveTo(0, H - 24);
      ctx.lineTo(W, H - 24);
      ctx.stroke();

      // Storm cross-current zones with animated vector chevrons
      for (const curr of session.currents) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
        ctx.fillRect(curr.xStart, 25, curr.xEnd - curr.xStart, H - 50);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(curr.xStart, 25, curr.xEnd - curr.xStart, H - 50);
        ctx.setLineDash([]);

        const dir = curr.forceY >= 0 ? 1 : -1;
        const offset = ((timeSec * 36 * dir) % 48 + 48) % 48;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 2;
        for (let cx = curr.xStart + 35; cx < curr.xEnd - 15; cx += 52) {
          for (let cy = 54 + offset; cy < H - 50; cy += 56) {
            ctx.beginPath();
            ctx.moveTo(cx - 7, cy - 5 * dir);
            ctx.lineTo(cx, cy + 5 * dir);
            ctx.lineTo(cx + 7, cy - 5 * dir);
            ctx.stroke();
          }
        }
      }

      // Safe Harbor Buoy Zone (MENTŐÖBÖL)
      const pulse = 0.72 + Math.sin(timeSec * 4.5) * 0.28;
      ctx.save();
      ctx.fillStyle = `rgba(46, 158, 91, ${0.14 * pulse})`;
      ctx.beginPath();
      ctx.arc(session.harborX, session.harborY, session.harborRadius + 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(46, 158, 91, 0.24)';
      ctx.strokeStyle = '#44B872';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(session.harborX, session.harborY, session.harborRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Harbor inner buoy ring & label
      const tModal = dictRef.current.tankerModal;
      ctx.fillStyle = '#A2E4BC';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tModal.canvasHarborTitle, session.harborX, session.harborY - 6);
      ctx.fillStyle = '#44B872';
      ctx.font = '10px monospace';
      ctx.fillText(tModal.canvasHarborSub, session.harborX, session.harborY + 10);
      ctx.restore();

      // Reefs & Drifting Debris
      for (const h of hazardsRef.current) {
        if (h.kind === 'REEF') {
          // Outer shallow danger halo
          ctx.fillStyle = 'rgba(217, 68, 54, 0.16)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.radius + 5, 0, Math.PI * 2);
          ctx.fill();

          // Jagged rock polygon
          ctx.fillStyle = '#473335';
          ctx.strokeStyle = '#D94436';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const sides = 7;
          for (let s = 0; s < sides; s++) {
            const ang = (s / sides) * Math.PI * 2 + (h.x % 3);
            const rJitter = h.radius * (s % 2 === 0 ? 0.98 : 0.76);
            const px = h.x + Math.cos(ang) * rJitter;
            const py = h.y + Math.sin(ang) * rJitter;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#F87171';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dictRef.current.tankerModal.canvasReefLabel, h.x, h.y + 3);
        } else {
          // Drifting storm container / debris
          ctx.save();
          ctx.translate(h.x, h.y);
          ctx.fillStyle = '#E59A24';
          ctx.strokeStyle = '#FDE68A';
          ctx.lineWidth = 1.5;
          ctx.fillRect(-h.radius * 0.85, -h.radius * 0.65, h.radius * 1.7, h.radius * 1.3);
          ctx.strokeRect(-h.radius * 0.85, -h.radius * 0.65, h.radius * 1.7, h.radius * 1.3);
          ctx.restore();
        }
      }

      // Wake & thruster foam particles
      for (const p of particlesRef.current) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = `rgba(186, 230, 253, ${alpha * 0.7})`;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }

      // Heading guide dotted line toward harbor
      ctx.save();
      ctx.strokeStyle = 'rgba(68, 184, 114, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(session.harborX, session.harborY);
      ctx.stroke();
      ctx.restore();

      // Player Oil Tanker Vessel
      const blinkHide =
        ship.invulnTimer > 0 && Math.floor(ship.invulnTimer * 14) % 2 === 0;
      if (!blinkHide) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);

        // Thruster flame/wake jet when engine active
        if (controlsRef.current.thrust && phase === 'PLAYING') {
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.moveTo(-21, -4);
          ctx.lineTo(-33 - Math.random() * 8, 0);
          ctx.lineTo(-21, 4);
          ctx.closePath();
          ctx.fill();
        }

        // Tanker hull silhouette
        ctx.fillStyle = ship.invulnTimer > 0 ? '#FCA5A5' : '#E6ECF2';
        ctx.strokeStyle = '#E59A24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(22, 0); // Bow
        ctx.lineTo(10, -10);
        ctx.lineTo(-20, -10);
        ctx.lineTo(-20, 10);
        ctx.lineTo(10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Oil cargo deck hatches & stern bridge
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(-6, -6, 15, 12);
        ctx.fillStyle = '#D94436';
        ctx.fillRect(-17, -7, 7, 14);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(10, -3, 5, 6);

        ctx.restore();
      }
    },
    [phase, session]
  );

  // Initial static render on mount and whenever language dictionary changes
  useEffect(() => {
    renderScene(0);
  }, [renderScene, lang, dict]);

  // Keyboard bindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        controlsRef.current.thrust = true;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        e.preventDefault();
        controlsRef.current.reverse = true;
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        e.preventDefault();
        controlsRef.current.left = true;
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        e.preventDefault();
        controlsRef.current.right = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') {
        controlsRef.current.thrust = false;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        controlsRef.current.reverse = false;
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        controlsRef.current.left = false;
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        controlsRef.current.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main 60 FPS Lunar-Lander Physics Loop
  useEffect(() => {
    if (phase !== 'PLAYING') return;

    let rafId = 0;
    let lastTimestamp = performance.now();
    let elapsedTotal = 0;
    let hudAccumulator = 0;

    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;
      elapsedTotal += dt;

      const ship = shipRef.current;
      const ctrl = controlsRef.current;

      // Countdown timer
      ship.timeLeft = Math.max(0, ship.timeLeft - dt);
      if (ship.invulnTimer > 0) {
        ship.invulnTimer = Math.max(0, ship.invulnTimer - dt);
      }

      // Steering rotation
      const turnRate = 2.75; // rad/s
      if (ctrl.left) ship.angle -= turnRate * dt;
      if (ctrl.right) ship.angle += turnRate * dt;

      // Forward / reverse engine thrust
      const forwardAccel = 185;
      const reverseAccel = 100;
      if (ctrl.thrust) {
        ship.vx += Math.cos(ship.angle) * forwardAccel * dt;
        ship.vy += Math.sin(ship.angle) * forwardAccel * dt;
        if (Math.random() < 0.65) {
          particlesRef.current.push({
            x: ship.x - Math.cos(ship.angle) * 20,
            y: ship.y - Math.sin(ship.angle) * 20,
            vx: -Math.cos(ship.angle) * 45 + (Math.random() - 0.5) * 22,
            vy: -Math.sin(ship.angle) * 45 + (Math.random() - 0.5) * 22,
            life: 0.45,
            maxLife: 0.45,
          });
        }
      }
      if (ctrl.reverse) {
        ship.vx -= Math.cos(ship.angle) * reverseAccel * dt;
        ship.vy -= Math.sin(ship.angle) * reverseAccel * dt;
      }

      // Check active storm cross-current zone
      let activeCurrent: ActiveCurrentInfo | null = null;
      for (const curr of session.currents) {
        if (ship.x >= curr.xStart && ship.x <= curr.xEnd) {
          ship.vy += curr.forceY * dt;
          activeCurrent = {
            directionKey: curr.directionKey,
            label: curr.label,
          };
        }
      }
      ship.activeCurrent = activeCurrent;

      // Hydrodynamic drag (preserves inertia/drift feel)
      const drag = Math.exp(-0.92 * dt);
      ship.vx *= drag;
      ship.vy *= drag;

      // Clamp max velocity
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > 215) {
        const s = 215 / speed;
        ship.vx *= s;
        ship.vy *= s;
      }

      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;

      // Strait west/east boundary clamping
      ship.x = Math.max(24, Math.min(session.worldWidth - 24, ship.x));

      // Coastal north/south shoal collisions
      let collidedThisFrame = false;
      if (ship.y < 36) {
        ship.y = 38;
        ship.vy = Math.abs(ship.vy) * 0.5 + 18;
        collidedThisFrame = true;
      } else if (ship.y > session.worldHeight - 36) {
        ship.y = session.worldHeight - 38;
        ship.vy = -Math.abs(ship.vy) * 0.5 - 18;
        collidedThisFrame = true;
      }

      // Move drifting debris & check reef/debris collisions
      const shipCollisionRadius = 14;
      for (const h of hazardsRef.current) {
        if (h.kind === 'DEBRIS') {
          h.y += h.vy * dt;
          if (h.minY !== undefined && h.y < h.minY) {
            h.y = h.minY;
            h.vy = Math.abs(h.vy);
          } else if (h.maxY !== undefined && h.y > h.maxY) {
            h.y = h.maxY;
            h.vy = -Math.abs(h.vy);
          }
        }

        const dist = Math.hypot(ship.x - h.x, ship.y - h.y);
        const minAllowed = shipCollisionRadius + h.radius;
        if (dist < minAllowed) {
          // Push ship smoothly outside the hazard perimeter
          const nx = dist > 0.01 ? (ship.x - h.x) / dist : -1;
          const ny = dist > 0.01 ? (ship.y - h.y) / dist : 0;
          ship.x = h.x + nx * (minAllowed + 2);
          ship.y = h.y + ny * (minAllowed + 2);
          ship.vx = nx * 42;
          ship.vy = ny * 42;
          collidedThisFrame = true;
        }
      }

      if (collidedThisFrame && ship.invulnTimer <= 0) {
        ship.hullHp = Math.max(0, ship.hullHp - 1);
        ship.invulnTimer = 1.15;
        soundFx.shipHullImpact();
      }

      // Update wake particles
      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          life: p.life - dt,
        }))
        .filter((p) => p.life > 0);

      // Render canvas frame
      renderScene(elapsedTotal);

      // Check win / lose conditions
      const distToHarbor = Math.hypot(
        ship.x - session.harborX,
        ship.y - session.harborY
      );
      if (distToHarbor <= session.harborRadius + 6) {
        soundFx.harborDocked();
        setHudState({
          timeLeft: ship.timeLeft,
          hullHp: ship.hullHp,
          speedKnots: Math.round(Math.hypot(ship.vx, ship.vy) * 0.14),
          activeCurrent: null,
          distancePct: 100,
        });
        setPhase('SUCCESS');
        return;
      }

      if (ship.hullHp <= 0) {
        soundFx.alarmTriggered();
        setFailReasonKind('HULL');
        setHudState((prev) => ({ ...prev, hullHp: 0 }));
        setPhase('FAILED');
        return;
      }

      if (ship.timeLeft <= 0) {
        soundFx.alarmTriggered();
        setFailReasonKind('TIMEOUT');
        setHudState((prev) => ({ ...prev, timeLeft: 0 }));
        setPhase('FAILED');
        return;
      }

      // Throttled HUD readout refresh (~15 Hz)
      hudAccumulator += dt;
      if (hudAccumulator >= 0.065) {
        hudAccumulator = 0;
        const totalSpan = Math.max(1, session.harborX - session.startX);
        const progress = Math.max(
          0,
          Math.min(100, Math.round(((ship.x - session.startX) / totalSpan) * 100))
        );
        setHudState({
          timeLeft: ship.timeLeft,
          hullHp: ship.hullHp,
          speedKnots: Math.round(Math.hypot(ship.vx, ship.vy) * 0.14),
          activeCurrent: ship.activeCurrent,
          distancePct: progress,
        });
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [phase, renderScene, session]);

  const setHelm = (
    key: 'thrust' | 'reverse' | 'left' | 'right',
    active: boolean
  ) => {
    controlsRef.current[key] = active;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tanker-operation-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E12]/90 p-3 sm:p-4 overflow-y-auto"
    >
      <div className="retro-panel w-full max-w-[960px] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#354150] bg-[#161C24] px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <Anchor className="h-5 w-5 shrink-0 text-[#38BDF8]" />
            <div className="min-w-0">
              <h2
                id="tanker-operation-title"
                className="font-display text-base sm:text-lg font-bold text-[#F8FAFC] truncate"
              >
                {interpolate(dict.tankerModal.titlePrefix, {
                  name: regionTrans.name,
                  code: regionStatic.shortCode,
                })}
              </h2>
              <p className="text-xs text-[#9FB0C2] truncate">
                {interpolate(dict.tankerModal.subtitleGuide, {
                  eventTitle: localizedEventTitle,
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={phase === 'SUCCESS' || phase === 'FAILED'}
            onClick={() => onFinishOperation('FAILED')}
            className="retro-button bg-[#2C1819] border border-[#D94436]/70 px-3 py-1.5 text-xs font-semibold text-[#F4A59D] hover:bg-[#3A1E20] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {interpolate(dict.tankerModal.surrenderButton, {
              mult: session.failMultiplier,
            })}
          </button>
        </div>

        {/* Telemetry HUD Strip (Strictly OUTSIDE Playfield) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-[#2D3846] bg-[#13181F] px-4 sm:px-6 py-2.5 text-xs">
          <div>
            <div className="text-[#8D9CAD]">
              {dict.tankerModal.timeLeftLabel}
            </div>
            <div
              className={`font-mono text-sm font-bold tabular-nums ${
                hudState.timeLeft <= 8 ? 'text-[#E8665A]' : 'text-[#E59A24]'
              }`}
            >
              {hudState.timeLeft.toFixed(1)} {dict.tankerModal.secondsShort}
            </div>
          </div>

          <div>
            <div className="text-[#8D9CAD]">
              {dict.tankerModal.hullIntegrityLabel}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {Array.from({ length: session.maxHullHp }).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-3 w-5 border ${
                    idx < hudState.hullHp
                      ? 'border-[#44B872] bg-[#2E9E5B]'
                      : 'border-[#D94436]/60 bg-[#2C1819]'
                  }`}
                />
              ))}
              <span className="font-mono font-bold tabular-nums text-[#E6ECF2] ml-1">
                {hudState.hullHp}/{session.maxHullHp}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[#8D9CAD]">
              {dict.tankerModal.speedChannelLabel}
            </div>
            <div className="font-mono font-semibold tabular-nums text-[#38BDF8]">
              {hudState.speedKnots} {dict.tankerModal.knotsUnit} ·{' '}
              {hudState.distancePct}%
            </div>
          </div>

          <div>
            <div className="text-[#8D9CAD]">
              {dict.tankerModal.stakeAtRiskLabel}
            </div>
            <div className="font-mono font-semibold tabular-nums">
              <span className="text-[#44B872]">$0</span>
              <span className="text-[#6F7E8F]"> / </span>
              <span className="text-[#E8665A]">
                -
                {formatCurrencyI18n(
                  session.stakeBaseCost * session.failMultiplier,
                  lang
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Active Storm Current Banner (Outside Canvas) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#26303D] bg-[#10161D] px-4 sm:px-6 py-1.5 text-[11px]">
          <div className="flex items-center gap-2 text-[#9FB0C2]">
            <Compass className="h-3.5 w-3.5 text-[#38BDF8]" />
            <span>{dict.tankerModal.controlsSummary}</span>
          </div>
          {hudState.activeCurrent ? (
            <span className="font-mono font-bold text-[#38BDF8]">
              {interpolate(dict.tankerModal.alertCurrentPrefix, {
                label: getLocalizedTankerCurrentLabel(
                  hudState.activeCurrent.directionKey,
                  hudState.activeCurrent.label,
                  lang
                ),
              })}
            </span>
          ) : (
            <span className="font-mono text-[#8D9CAD]">
              {interpolate(dict.tankerModal.recoverySuccessNote, {
                pct: Math.round(session.recoveryRatio * 100),
              })}
            </span>
          )}
        </div>

        {/* 2D Maritime Radar Canvas */}
        <div className="relative bg-[#081018] p-2 sm:p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            width={session.worldWidth}
            height={session.worldHeight}
            className="w-full max-w-[840px] h-auto border border-[#313C4A] block"
          />

          {/* Ready Start Overlay */}
          {phase === 'READY' && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E12]/78 p-4">
              <div className="retro-panel max-w-[460px] w-full p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2.5 text-[#38BDF8] font-bold text-sm">
                  <Navigation className="h-4 w-4 shrink-0" />
                  <span>{dict.tankerModal.readyTitle}</span>
                </div>
                <p className="text-[#CBD5E1] leading-relaxed">
                  {dict.tankerModal.readyDesc}
                </p>
                <div className="grid grid-cols-2 gap-2 border border-[#2D3846] bg-[#13181F] p-3 font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[#8D9CAD]">
                      {dict.tankerModal.rewardTitle}
                    </div>
                    <div className="text-[#44B872] font-bold mt-0.5">
                      {interpolate(dict.tankerModal.rewardDesc, {
                        pct: Math.round(session.recoveryRatio * 100),
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[#8D9CAD]">
                      {dict.tankerModal.failStakeTitle}
                    </div>
                    <div className="text-[#E8665A] font-bold mt-0.5">
                      {session.failMultiplier}× (
                      {formatCurrencyI18n(
                        session.stakeBaseCost * session.failMultiplier,
                        lang
                      )}
                      )
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.click();
                    setPhase('PLAYING');
                  }}
                  className="retro-button w-full bg-[#E59A24] px-4 py-3 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] cursor-pointer"
                >
                  {dict.tankerModal.startManeuverButton}
                </button>
              </div>
            </div>
          )}

          {/* Completion Outcome Overlay */}
          {(phase === 'SUCCESS' || phase === 'FAILED') && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0E12]/82 p-4">
              <div className="retro-panel max-w-[460px] w-full p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2.5">
                  {phase === 'SUCCESS' ? (
                    <Anchor className="h-5 w-5 text-[#44B872] shrink-0" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-[#E8665A] shrink-0" />
                  )}
                  <h3
                    className={`font-display text-base font-bold ${
                      phase === 'SUCCESS' ? 'text-[#44B872]' : 'text-[#E8665A]'
                    }`}
                  >
                    {phase === 'SUCCESS'
                      ? dict.tankerModal.winTitle
                      : failReasonKind === 'HULL'
                        ? dict.tankerModal.failTitleSunk
                        : dict.tankerModal.failTitleTimeout}
                  </h3>
                </div>

                <p className="text-[#CBD5E1] leading-relaxed">
                  {phase === 'SUCCESS'
                    ? interpolate(dict.tankerModal.winDesc, {
                        pct: Math.round(session.recoveryRatio * 100),
                      })
                    : `${
                        failReasonKind === 'HULL'
                          ? dict.tankerModal.failHullReason
                          : dict.tankerModal.failTimeReason
                      } ${interpolate(dict.tankerModal.failDesc, {
                        mult: session.failMultiplier,
                        excess: formatCurrencyI18n(
                          session.failExtraPenaltyCost,
                          lang
                        ),
                      })}`}
                </p>

                <div className="border border-[#2D3846] bg-[#13181F] p-3 font-mono tabular-nums space-y-1">
                  {phase === 'SUCCESS' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="font-sans text-[#8D9CAD]">
                          {dict.tankerModal.successCreditsLabel}
                        </span>
                        <span className="text-[#44B872] font-bold">
                          +{formatCurrencyI18n(session.baseEventRepairCost, lang)}{' '}
                          {dict.tankerModal.netZeroTag}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-sans text-[#8D9CAD]">
                          {dict.tankerModal.successReductionLabel}
                        </span>
                        <span className="text-[#44B872] font-bold">
                          {Math.round(session.recoveryRatio * 100)}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="font-sans text-[#8D9CAD]">
                        {dict.tankerModal.failFineAppliedLabel}
                      </span>
                      <span className="text-[#E8665A] font-bold">
                        -{formatCurrencyI18n(session.failExtraPenaltyCost, lang)}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onFinishOperation(phase)}
                  className={`retro-button w-full px-4 py-3 text-xs font-bold cursor-pointer ${
                    phase === 'SUCCESS'
                      ? 'bg-[#2E9E5B] text-white hover:bg-[#36B56A]'
                      : 'bg-[#D94436] text-white hover:bg-[#E8584B]'
                  }`}
                >
                  {dict.tankerModal.closeReportButton}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Touch / Mouse Helm Controls Strip (min 48x48px, outside playfield) */}
        <div className="border-t border-[#2D3846] bg-[#161C24] px-4 py-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={phase !== 'PLAYING'}
            onPointerDown={() => setHelm('left', true)}
            onPointerUp={() => setHelm('left', false)}
            onPointerLeave={() => setHelm('left', false)}
            onPointerCancel={() => setHelm('left', false)}
            className="retro-button min-h-[48px] min-w-[100px] flex items-center justify-center gap-1.5 bg-[#232B35] px-4 py-2 text-xs font-bold text-[#F3F6FA] hover:bg-[#313F4F] active:bg-[#E59A24] active:text-[#12161B] disabled:opacity-40 touch-none select-none cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{dict.tankerModal.btnLeft}</span>
          </button>

          <button
            type="button"
            disabled={phase !== 'PLAYING'}
            onPointerDown={() => setHelm('thrust', true)}
            onPointerUp={() => setHelm('thrust', false)}
            onPointerLeave={() => setHelm('thrust', false)}
            onPointerCancel={() => setHelm('thrust', false)}
            className="retro-button min-h-[48px] min-w-[160px] flex items-center justify-center gap-2 bg-[#E59A24] px-5 py-2 text-xs font-bold text-[#12161B] hover:bg-[#F0A938] active:bg-[#FBBF24] disabled:opacity-40 touch-none select-none cursor-pointer"
          >
            <Navigation className="h-4 w-4 rotate-90" />
            <span>{dict.tankerModal.btnThrust}</span>
          </button>

          <button
            type="button"
            disabled={phase !== 'PLAYING'}
            onPointerDown={() => setHelm('reverse', true)}
            onPointerUp={() => setHelm('reverse', false)}
            onPointerLeave={() => setHelm('reverse', false)}
            onPointerCancel={() => setHelm('reverse', false)}
            className="retro-button min-h-[48px] min-w-[105px] flex items-center justify-center gap-1.5 bg-[#232B35] px-4 py-2 text-xs font-bold text-[#CBD5E1] hover:bg-[#313F4F] active:bg-[#D94436] active:text-white disabled:opacity-40 touch-none select-none cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-[#E59A24]" />
            <span>{dict.tankerModal.btnBrake}</span>
          </button>

          <button
            type="button"
            disabled={phase !== 'PLAYING'}
            onPointerDown={() => setHelm('right', true)}
            onPointerUp={() => setHelm('right', false)}
            onPointerLeave={() => setHelm('right', false)}
            onPointerCancel={() => setHelm('right', false)}
            className="retro-button min-h-[48px] min-w-[100px] flex items-center justify-center gap-1.5 bg-[#232B35] px-4 py-2 text-xs font-bold text-[#F3F6FA] hover:bg-[#313F4F] active:bg-[#E59A24] active:text-[#12161B] disabled:opacity-40 touch-none select-none cursor-pointer"
          >
            <span>{dict.tankerModal.btnRight}</span>
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
