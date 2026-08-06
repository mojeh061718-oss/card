/**
 * Haptics — the feel layer. The game is silent by design: feedback is
 * visual (glow, confetti, motion) plus a physical tap where the platform
 * offers one.
 *
 * Haptics on iOS are a moving target: there has never been a Vibration API,
 * and the `<input type="checkbox" switch>` trick that worked from iOS 17.4
 * was patched in 26.5. So haptics are strictly progressive enhancement —
 * detected once, never depended on, and always paired with visual feedback
 * that carries the moment on its own.
 */

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

/** Kept as a first-gesture hook for callers; audio is gone, so it's a no-op. */
export function unlockAudio(): void {}

/**
 * The old sound effects, reduced to their haptic component. The names keep
 * every call site honest about which moment it is marking.
 */
export const sfx = {
  tear(): void { haptic('light'); },
  cardSlide(): void {},
  flip(): void { haptic('light'); },
  riser(tier: 1 | 2 | 3): void { haptic(tier === 3 ? 'medium' : 'light'); },
  hit(tier: 1 | 2 | 3): void {
    haptic(tier >= 3 ? 'heavy' : tier === 2 ? 'medium' : 'light');
  },
  slab(): void { haptic('medium'); },
  cash(): void { haptic('light'); },
  gavel(): void { haptic('medium'); },
  riffle(): void {},
  tap(): void {},
};

/** Map a card's heat rank to an escalation tier. */
export function heatTier(heat: number): 0 | 1 | 2 | 3 {
  if (heat >= 11) return 3;
  if (heat >= 7) return 2;
  if (heat >= 4) return 1;
  return 0;
}
