/**
 * Body construction — volumes, not tubes.
 *
 * The reason a stroked-polyline figure reads as a mannequin is that every
 * limb is the same width end to end and joints are just round caps. Real
 * limbs are *spindles*: they swell over the muscle belly and neck down at
 * the joint. An arm is two tapered spindles; a thigh is one big one.
 *
 * Everything here draws closed filled paths whose outline follows a width
 * profile along the limb, so the silhouette itself carries the anatomy —
 * which is what survives when the figure is 40px wide in a binder.
 */

import { withAlpha, shade } from './color';

export interface Pt { x: number; y: number }

/**
 * Width profile along a limb, sampled 0..1 from start to end.
 * Values multiply the base width.
 */
export type Profile = (t: number) => number;

/** Muscle belly: swells just past the start, tapers into the joint. */
export const SPINDLE: Profile = t =>
  0.88 + 0.3 * Math.sin(Math.PI * Math.pow(t, 0.8)) - 0.22 * t;

/** Upper arm / thigh: thick at the body, narrowing toward the joint. */
export const TAPER_IN: Profile = t => 1 - 0.28 * t;

/** Forearm / calf: bulges early (the belly), thin at wrist/ankle. */
export const BELLY: Profile = t =>
  0.92 + 0.26 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 0.34 * t * t;

/** Even width — used for straps and bands. */
export const FLAT: Profile = () => 1;

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Quadratic point along a 3-point chain, giving limbs a natural curve. */
function bendPoint(a: Pt, b: Pt, c: Pt, t: number): Pt {
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

/**
 * Fill a tapered volume between two points, optionally bowed through a
 * control point so the limb curves like muscle rather than kinking.
 */
export function volume(
  ctx: CanvasRenderingContext2D,
  from: Pt, to: Pt, baseWidth: number, profile: Profile, color: string,
  bow = 0,
): void {
  const steps = 14;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Bow the midpoint perpendicular to the limb for a natural curve.
  const mid: Pt = {
    x: (from.x + to.x) / 2 - (dy / len) * bow * len,
    y: (from.y + to.y) / 2 + (dx / len) * bow * len,
  };

  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = bendPoint(from, mid, to, t);
    const q = bendPoint(from, mid, to, Math.min(1, t + 0.02));
    const tx = q.x - p.x, ty = q.y - p.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;
    const w = (baseWidth * profile(t)) / 2;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }

  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  ctx.lineTo(right[right.length - 1].x, right[right.length - 1].y);
  for (let i = right.length - 2; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // Round both joints so consecutive volumes blend instead of showing a seam.
  for (const [pt, t] of [[from, 0], [to, 1]] as const) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, (baseWidth * profile(t)) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft shading down one side of a limb, clipped to the shape just filled. */
export function limbShade(
  ctx: CanvasRenderingContext2D,
  from: Pt, to: Pt, baseWidth: number, lightX: number, lightY: number,
): void {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const w = baseWidth * 0.6;
  const g = ctx.createLinearGradient(
    (from.x + to.x) / 2 + nx * w, (from.y + to.y) / 2 + ny * w,
    (from.x + to.x) / 2 - nx * w, (from.y + to.y) / 2 - ny * w,
  );
  // Light direction decides which flank catches highlight.
  const flip = nx * lightX + ny * lightY < 0;
  g.addColorStop(0, withAlpha(flip ? '#000012' : '#ffffff', flip ? 0.26 : 0.18));
  g.addColorStop(0.55, withAlpha('#ffffff', 0));
  g.addColorStop(1, withAlpha(flip ? '#ffffff' : '#000012', flip ? 0.16 : 0.24));
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Torso as a closed silhouette, built on the spine axis.
 *
 * Width comes from the figure's scale, NOT from the distance between the
 * two shoulder joints — in a heavily rotated pose (a batter at contact, a
 * back mid-cut) the shoulders nearly overlap in 2D, and deriving width from
 * their separation collapses the torso to a sliver. The joints set the
 * spine's angle and lean; `unit` sets how big the body is.
 */
export function torsoPath(
  ctx: CanvasRenderingContext2D,
  neck: Pt, shoulderNear: Pt, shoulderFar: Pt, hipNear: Pt, hipFar: Pt,
  unit: number,
): void {
  const shoulderMid = lerp(shoulderNear, shoulderFar, 0.5);
  const hipMid = lerp(hipNear, hipFar, 0.5);

  // Spine axis and its perpendicular.
  const sx = hipMid.x - shoulderMid.x, sy = hipMid.y - shoulderMid.y;
  const slen = Math.hypot(sx, sy) || 1;
  const px = -sy / slen, py = sx / slen;

  // How square-on the body is: shoulders far apart means we see the chest,
  // shoulders stacked means we see the flank and the body reads narrower.
  const spread = Math.hypot(shoulderNear.x - shoulderFar.x, shoulderNear.y - shoulderFar.y);
  const openness = Math.min(1, spread / (unit * 0.13));
  const breadth = 0.8 + 0.2 * openness;

  const shoulderHalf = unit * 0.118 * breadth;
  const waistHalf = unit * 0.086 * breadth;
  const hipHalf = unit * 0.098 * breadth;

  const at = (along: number, side: number, half: number): Pt => ({
    x: shoulderMid.x + sx * along + px * side * half,
    y: shoulderMid.y + sy * along + py * side * half,
  });

  // Which side is "near" — the lit, forward flank.
  const nearSide = Math.sign(
    (shoulderNear.x - shoulderMid.x) * px + (shoulderNear.y - shoulderMid.y) * py,
  ) || 1;

  const neckTop = { x: neck.x, y: neck.y - unit * 0.008 };
  const sNear = at(-0.04, nearSide, shoulderHalf);
  const wNear = at(0.55, nearSide, waistHalf);
  const hNear = at(1.04, nearSide, hipHalf);
  const hFar = at(1.04, -nearSide, hipHalf);
  const wFar = at(0.55, -nearSide, waistHalf);
  const sFar = at(-0.04, -nearSide, shoulderHalf);

  ctx.beginPath();
  ctx.moveTo(neckTop.x, neckTop.y);
  // Trapezius out to the near deltoid.
  ctx.quadraticCurveTo(
    lerp(neckTop, sNear, 0.55).x, lerp(neckTop, sNear, 0.55).y - unit * 0.022,
    sNear.x, sNear.y,
  );
  // Lat sweeping in to the waist.
  ctx.quadraticCurveTo(
    at(0.24, nearSide, shoulderHalf * 1.02).x, at(0.24, nearSide, shoulderHalf * 1.02).y,
    wNear.x, wNear.y,
  );
  // Waist flaring back out into the hip.
  ctx.quadraticCurveTo(
    at(0.82, nearSide, waistHalf * 1.05).x, at(0.82, nearSide, waistHalf * 1.05).y,
    hNear.x, hNear.y,
  );
  // Across the pelvis.
  ctx.quadraticCurveTo(
    at(1.12, 0, 0).x, at(1.12, 0, 0).y,
    hFar.x, hFar.y,
  );
  // Mirror back up the far side.
  ctx.quadraticCurveTo(
    at(0.82, -nearSide, waistHalf * 1.05).x, at(0.82, -nearSide, waistHalf * 1.05).y,
    wFar.x, wFar.y,
  );
  ctx.quadraticCurveTo(
    at(0.24, -nearSide, shoulderHalf * 1.02).x, at(0.24, -nearSide, shoulderHalf * 1.02).y,
    sFar.x, sFar.y,
  );
  ctx.quadraticCurveTo(
    lerp(neckTop, sFar, 0.55).x, lerp(neckTop, sFar, 0.55).y - unit * 0.022,
    neckTop.x, neckTop.y,
  );
  ctx.closePath();
}

/** Shoulder pad cap — the shelf that gives football figures their silhouette. */
export function shoulderPad(
  ctx: CanvasRenderingContext2D,
  shoulder: Pt, neck: Pt, unit: number, color: string, outward: number,
): void {
  const dx = shoulder.x - neck.x, dy = shoulder.y - neck.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  ctx.save();
  ctx.translate(shoulder.x + ux * unit * 0.012, shoulder.y + uy * unit * 0.012);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.beginPath();
  ctx.ellipse(0, 0, unit * 0.042 * outward, unit * 0.032, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Pad edge catches light along the top.
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.008, unit * 0.034 * outward, unit * 0.014, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  ctx.fill();
  ctx.restore();
}

/** Neck with a sternocleidomastoid hint, so the head connects to something. */
export function neckColumn(
  ctx: CanvasRenderingContext2D,
  neck: Pt, headBase: Pt, unit: number, skin: string,
): void {
  volume(ctx, neck, headBase, unit * 0.052, TAPER_IN, skin);
  ctx.beginPath();
  ctx.moveTo(neck.x - unit * 0.018, neck.y);
  ctx.quadraticCurveTo(
    (neck.x + headBase.x) / 2, (neck.y + headBase.y) / 2,
    headBase.x - unit * 0.01, headBase.y,
  );
  ctx.strokeStyle = withAlpha(shade(skin, -0.22), 0.5);
  ctx.lineWidth = unit * 0.008;
  ctx.stroke();
}
