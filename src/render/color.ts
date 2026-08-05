/**
 * OKLCH-based palette machinery. Team colors come in as sRGB hex; all
 * derivation (tints, shades, accents, foil ramps) happens in OKLab space so
 * lightness steps are perceptually even and hue rotations don't go muddy.
 */

export interface Oklch { l: number; c: number; h: number }

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function rgbToOklch(r: number, g: number, b: number): Oklch {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const bb = c * Math.sin(hr);
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * bb, 3);
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * bb, 3);
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * bb, 3);
  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  return rgbToOklch(r, g, b);
}

export function oklchToHex(o: Oklch): string {
  const [r, g, b] = oklchToRgb(o);
  return rgbToHex(r, g, b);
}

/** Lightness-adjusted variant, chroma preserved where gamut allows. */
export function shade(hex: string, dl: number, dc = 0): string {
  const o = hexToOklch(hex);
  return oklchToHex({ l: Math.max(0, Math.min(1, o.l + dl)), c: Math.max(0, o.c + dc), h: o.h });
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

/** Perceptual mix in OKLab (via LCH round trip; fine for near hues). */
export function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexToOklch(hexA), b = hexToOklch(hexB);
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return oklchToHex({
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: (a.h + dh * t + 360) % 360,
  });
}

/** Readable ink (near-white or near-black) against a background. */
export function inkOn(hex: string): string {
  return hexToOklch(hex).l > 0.6 ? '#16161a' : '#f4f2ec';
}
