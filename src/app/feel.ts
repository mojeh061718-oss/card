/**
 * Haptics and audio — the feel layer.
 *
 * Haptics on iOS are a moving target: there has never been a Vibration API,
 * and the `<input type="checkbox" switch>` trick that worked from iOS 17.4
 * was patched in 26.5. So haptics are strictly progressive enhancement —
 * detected once, never depended on, and always paired with visual and audio
 * feedback that carries the moment on its own.
 *
 * Audio is synthesized with Web Audio (no asset downloads), unlocked on the
 * first user gesture as iOS requires. The hardware mute switch silences it
 * entirely, so nothing the player needs to know is ever audio-only.
 */

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

let hapticEl: HTMLLabelElement | null = null;
let hapticInput: HTMLInputElement | null = null;

function ensureHapticEl(): void {
  if (hapticEl) return;
  const input = document.createElement('input');
  input.type = 'checkbox';
  // The `switch` attribute is what Safari attaches the haptic to.
  input.setAttribute('switch', '');
  input.id = 'haptic-switch';
  input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
  const label = document.createElement('label');
  label.htmlFor = 'haptic-switch';
  label.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
  document.body.append(input, label);
  hapticEl = label;
  hapticInput = input;
}

export type HapticStrength = 'light' | 'medium' | 'heavy';

/** Fire a haptic if the platform offers one. Silent no-op otherwise. */
export function haptic(strength: HapticStrength = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(strength === 'heavy' ? 28 : strength === 'medium' ? 16 : 8);
      return;
    }
    ensureHapticEl();
    const pulses = strength === 'heavy' ? 3 : strength === 'medium' ? 2 : 1;
    for (let i = 0; i < pulses; i++) {
      setTimeout(() => hapticEl?.click(), i * 45);
    }
    // Keep the checkbox state from drifting.
    setTimeout(() => { if (hapticInput) hapticInput.checked = false; }, pulses * 45 + 20);
  } catch {
    // Feel is a bonus, never a failure mode.
  }
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from the first user gesture — iOS won't start audio without one. */
export function unlockAudio(): void {
  audio();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.32;
}

export function isMuted(): boolean {
  return muted;
}

/** Filtered noise burst — the basis of paper, foil, and shuffle sounds. */
function noise(
  duration: number, filterHz: number, q: number, gain: number, type: BiquadFilterType = 'bandpass',
): void {
  const ac = audio();
  if (!ac || muted || !master) return;
  const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying noise so bursts read as impacts, not hiss.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 1.6);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterHz;
  filter.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start();
}

function tone(
  freq: number, duration: number, gain: number,
  type: OscillatorType = 'sine', slideTo?: number,
): void {
  const ac = audio();
  if (!ac || muted || !master) return;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + duration);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, ac.currentTime);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.02);
}

export const sfx = {
  /** Foil wrapper tearing — bright crinkle. */
  tear(): void {
    noise(0.13, 4200, 0.7, 0.5, 'highpass');
    haptic('light');
  },
  /** A card sliding off the stack. */
  cardSlide(): void {
    noise(0.09, 2600, 1.2, 0.28);
  },
  /** Card flipping face-up. */
  flip(): void {
    noise(0.07, 3400, 1.6, 0.34);
    haptic('light');
  },
  /** Rising stinger before a hit lands. Tier 1-3. */
  riser(tier: 1 | 2 | 3): void {
    const base = 220;
    const dur = tier === 3 ? 1.1 : tier === 2 ? 0.7 : 0.45;
    tone(base, dur, 0.10, 'sawtooth', base * (tier === 3 ? 6 : tier === 2 ? 4 : 2.5));
    haptic(tier === 3 ? 'medium' : 'light');
  },
  /** The hit lands. */
  hit(tier: 1 | 2 | 3): void {
    if (tier >= 3) {
      // Grail fanfare: a bright major triad over a low swell.
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        setTimeout(() => tone(f, 1.5, 0.16, 'triangle'), i * 90));
      tone(130.81, 1.8, 0.1, 'sine');
      haptic('heavy');
    } else if (tier === 2) {
      [440, 554.37, 659.25].forEach((f, i) =>
        setTimeout(() => tone(f, 0.7, 0.13, 'triangle'), i * 70));
      haptic('medium');
    } else {
      tone(587.33, 0.35, 0.12, 'triangle');
      haptic('light');
    }
  },
  /** Slab snapping shut. */
  slab(): void {
    noise(0.05, 1800, 2.5, 0.4);
    tone(180, 0.12, 0.1, 'square');
    haptic('medium');
  },
  /** Cash register / sale confirmed. */
  cash(): void {
    tone(880, 0.1, 0.11, 'triangle');
    setTimeout(() => tone(1318.5, 0.22, 0.1, 'triangle'), 70);
    haptic('light');
  },
  /** Auction gavel. */
  gavel(): void {
    noise(0.06, 900, 1.4, 0.45, 'lowpass');
    setTimeout(() => noise(0.08, 700, 1.2, 0.35, 'lowpass'), 110);
    haptic('medium');
  },
  /** Riffling through a bulk box. */
  riffle(): void {
    noise(0.035, 3000, 2.2, 0.16);
  },
  /** Generic UI tap. */
  tap(): void {
    tone(660, 0.05, 0.05, 'sine');
  },
};

/** Map a card's heat rank to an escalation tier. */
export function heatTier(heat: number): 0 | 1 | 2 | 3 {
  if (heat >= 11) return 3;
  if (heat >= 7) return 2;
  if (heat >= 4) return 1;
  return 0;
}
