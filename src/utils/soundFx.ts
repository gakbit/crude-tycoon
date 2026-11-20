/**
 * Lightweight Web Audio API retro 90s sound synthesizer for tactile UI and drilling feedback.
 * Requires zero external audio assets and respects the user's mute toggle.
 */

class RetroSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'square',
    gainPeak = 0.06,
    freqEnd?: number
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        now + durationSec
      );
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public click(): void {
    this.playTone(520, 0.045, 'triangle', 0.045, 340);
  }

  public cash(): void {
    this.playTone(740, 0.07, 'square', 0.04);
    setTimeout(() => this.playTone(1046, 0.14, 'square', 0.04), 65);
  }

  public barLock(accuracyPct: number): void {
    const baseFreq = 320 + (accuracyPct / 100) * 480;
    this.playTone(baseFreq, 0.09, 'triangle', 0.065);
  }

  public layerBreakthrough(): void {
    this.playTone(220, 0.08, 'sawtooth', 0.05, 440);
    setTimeout(() => this.playTone(587, 0.14, 'triangle', 0.06), 75);
  }

  public drillFailure(): void {
    this.playTone(190, 0.18, 'sawtooth', 0.06, 95);
  }

  public turnAdvance(): void {
    this.playTone(440, 0.06, 'triangle', 0.045);
    setTimeout(() => this.playTone(554, 0.08, 'triangle', 0.045), 60);
  }

  public footstep(): void {
    this.playTone(150, 0.035, 'triangle', 0.025, 95);
  }

  public hackPulse(): void {
    this.playTone(880, 0.045, 'square', 0.028, 1240);
  }

  public alarmTriggered(): void {
    this.playTone(620, 0.14, 'sawtooth', 0.07, 410);
    setTimeout(() => this.playTone(620, 0.16, 'sawtooth', 0.07, 360), 150);
  }

  public shipHullImpact(): void {
    this.playTone(135, 0.18, 'sawtooth', 0.08, 58);
  }

  public harborDocked(): void {
    this.playTone(440, 0.1, 'triangle', 0.055);
    setTimeout(() => this.playTone(554, 0.1, 'triangle', 0.055), 85);
    setTimeout(() => this.playTone(659, 0.18, 'triangle', 0.06), 170);
  }

  public sampleSwap(): void {
    this.playTone(390, 0.045, 'triangle', 0.04, 490);
  }

  public labVerifySuccess(): void {
    this.playTone(587, 0.08, 'triangle', 0.05);
    setTimeout(() => this.playTone(880, 0.16, 'triangle', 0.06), 80);
  }

  public labVerifyError(): void {
    this.playTone(260, 0.14, 'square', 0.05, 160);
  }
}

export const soundFx = new RetroSoundEngine();
