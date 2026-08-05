/**
 * Athlete figure renderer — stylized poster treatment.
 *
 * Figures are authored as pose keyframes (joint coordinates in a normalized
 * 0..1 box, y-down) and drawn as round-capped strokes over a solid torso
 * path, then cel-shaded through a silhouette composite. This mirrors real
 * card construction: a crisp figure cutout floated over a printed backdrop.
 *
 * Determinism: everything derives from (appearanceSeed, poseId, team colors).
 */

import { Rng } from '../engine/rng';
import type { Sport } from '../engine/world/teams';
import { shade, withAlpha, mixHex } from './color';
import {
  drawFootballHelmet, drawBattingHelmet, drawCap, drawGlove, drawMitt,
  drawCleat, drawKneePad, drawBand,
} from './equipment';

interface Pt { x: number; y: number }

export interface PoseSpec {
  id: string;
  sport: Sport;
  /** Which way the figure is "moving" — streaks + shading direction. */
  motion: Pt;
  head: Pt;
  neck: Pt;
  pelvis: Pt;
  shoulderNear: Pt; elbowNear: Pt; wristNear: Pt;
  shoulderFar: Pt; elbowFar: Pt; wristFar: Pt;
  hipNear: Pt; kneeNear: Pt; ankleNear: Pt; toeNear: Pt;
  hipFar: Pt; kneeFar: Pt; ankleFar: Pt; toeFar: Pt;
  /** Prop anchor (ball / bat / glove) + orientation in radians. */
  prop?: { kind: 'football' | 'baseball' | 'bat' | 'glove'; at: Pt; angle: number };
}

const SKIN_TONES = ['#8d5524', '#a9744f', '#c68642', '#e0ac69', '#f1c27d', '#6b4226', '#3b2a1e'];

// ---------------------------------------------------------------------------
// Pose library. Coordinates hand-tuned in a 0..1 box (x right, y down).
// Anatomy sanity: shoulders sit ~0.06 below neck level and ~0.07 either side
// of the spine; hips ~0.045 either side of the pelvis.
// ---------------------------------------------------------------------------

export const POSES: PoseSpec[] = [
  {
    // Quarterback mid-throw, chest slightly open, ball high behind.
    id: 'qb-throw', sport: 'football', motion: { x: -0.6, y: -0.1 },
    head: { x: 0.46, y: 0.14 }, neck: { x: 0.47, y: 0.225 }, pelvis: { x: 0.5, y: 0.5 },
    shoulderNear: { x: 0.545, y: 0.27 }, elbowNear: { x: 0.64, y: 0.20 }, wristNear: { x: 0.70, y: 0.10 },
    shoulderFar: { x: 0.40, y: 0.275 }, elbowFar: { x: 0.30, y: 0.33 }, wristFar: { x: 0.21, y: 0.29 },
    hipNear: { x: 0.545, y: 0.50 }, kneeNear: { x: 0.60, y: 0.66 }, ankleNear: { x: 0.575, y: 0.83 }, toeNear: { x: 0.63, y: 0.865 },
    hipFar: { x: 0.455, y: 0.50 }, kneeFar: { x: 0.385, y: 0.645 }, ankleFar: { x: 0.305, y: 0.80 }, toeFar: { x: 0.25, y: 0.835 },
    prop: { kind: 'football', at: { x: 0.72, y: 0.085 }, angle: -0.7 },
  },
  {
    // Runner leaning hard, ball tucked, opposite arm driving.
    id: 'rb-run', sport: 'football', motion: { x: -0.9, y: 0 },
    head: { x: 0.40, y: 0.185 }, neck: { x: 0.425, y: 0.265 }, pelvis: { x: 0.52, y: 0.51 },
    shoulderNear: { x: 0.475, y: 0.30 }, elbowNear: { x: 0.415, y: 0.42 }, wristNear: { x: 0.36, y: 0.345 },
    shoulderFar: { x: 0.43, y: 0.305 }, elbowFar: { x: 0.545, y: 0.40 }, wristFar: { x: 0.615, y: 0.50 },
    hipNear: { x: 0.545, y: 0.51 }, kneeNear: { x: 0.43, y: 0.615 }, ankleNear: { x: 0.455, y: 0.79 }, toeNear: { x: 0.39, y: 0.83 },
    hipFar: { x: 0.50, y: 0.515 }, kneeFar: { x: 0.615, y: 0.65 }, ankleFar: { x: 0.675, y: 0.825 }, toeFar: { x: 0.74, y: 0.85 },
    prop: { kind: 'football', at: { x: 0.365, y: 0.375 }, angle: 0.9 },
  },
  {
    // Receiver fully extended for the grab.
    id: 'wr-catch', sport: 'football', motion: { x: -0.3, y: -0.8 },
    head: { x: 0.50, y: 0.165 }, neck: { x: 0.50, y: 0.245 }, pelvis: { x: 0.50, y: 0.515 },
    shoulderNear: { x: 0.555, y: 0.285 }, elbowNear: { x: 0.615, y: 0.185 }, wristNear: { x: 0.595, y: 0.075 },
    shoulderFar: { x: 0.445, y: 0.285 }, elbowFar: { x: 0.385, y: 0.185 }, wristFar: { x: 0.425, y: 0.075 },
    hipNear: { x: 0.535, y: 0.515 }, kneeNear: { x: 0.585, y: 0.655 }, ankleNear: { x: 0.53, y: 0.79 }, toeNear: { x: 0.555, y: 0.845 },
    hipFar: { x: 0.465, y: 0.515 }, kneeFar: { x: 0.405, y: 0.64 }, ankleFar: { x: 0.435, y: 0.785 }, toeFar: { x: 0.395, y: 0.84 },
    prop: { kind: 'football', at: { x: 0.51, y: 0.032 }, angle: 0.2 },
  },
  {
    // Batter at contact, hips rotated, bat through the zone.
    id: 'batter-swing', sport: 'baseball', motion: { x: -0.8, y: -0.2 },
    head: { x: 0.435, y: 0.185 }, neck: { x: 0.455, y: 0.26 }, pelvis: { x: 0.50, y: 0.525 },
    shoulderNear: { x: 0.515, y: 0.295 }, elbowNear: { x: 0.60, y: 0.355 }, wristNear: { x: 0.665, y: 0.29 },
    shoulderFar: { x: 0.44, y: 0.30 }, elbowFar: { x: 0.545, y: 0.375 }, wristFar: { x: 0.65, y: 0.305 },
    hipNear: { x: 0.545, y: 0.525 }, kneeNear: { x: 0.60, y: 0.675 }, ankleNear: { x: 0.60, y: 0.845 }, toeNear: { x: 0.655, y: 0.87 },
    hipFar: { x: 0.455, y: 0.525 }, kneeFar: { x: 0.385, y: 0.655 }, ankleFar: { x: 0.31, y: 0.825 }, toeFar: { x: 0.25, y: 0.855 },
    prop: { kind: 'bat', at: { x: 0.658, y: 0.295 }, angle: -0.55 },
  },
  {
    // Pitcher driving off the mound, arm slot high.
    id: 'pitcher-drive', sport: 'baseball', motion: { x: -0.7, y: 0.1 },
    head: { x: 0.445, y: 0.165 }, neck: { x: 0.465, y: 0.24 }, pelvis: { x: 0.50, y: 0.505 },
    shoulderNear: { x: 0.53, y: 0.275 }, elbowNear: { x: 0.645, y: 0.235 }, wristNear: { x: 0.735, y: 0.15 },
    shoulderFar: { x: 0.435, y: 0.28 }, elbowFar: { x: 0.325, y: 0.345 }, wristFar: { x: 0.235, y: 0.415 },
    hipNear: { x: 0.545, y: 0.505 }, kneeNear: { x: 0.63, y: 0.625 }, ankleNear: { x: 0.66, y: 0.815 }, toeNear: { x: 0.72, y: 0.84 },
    hipFar: { x: 0.455, y: 0.505 }, kneeFar: { x: 0.35, y: 0.60 }, ankleFar: { x: 0.235, y: 0.755 }, toeFar: { x: 0.175, y: 0.785 },
    prop: { kind: 'baseball', at: { x: 0.765, y: 0.125 }, angle: 0 },
  },
  {
    // Infielder firing across the diamond.
    id: 'fielder-throw', sport: 'baseball', motion: { x: -0.5, y: -0.3 },
    head: { x: 0.475, y: 0.155 }, neck: { x: 0.485, y: 0.235 }, pelvis: { x: 0.50, y: 0.51 },
    shoulderNear: { x: 0.55, y: 0.275 }, elbowNear: { x: 0.635, y: 0.215 }, wristNear: { x: 0.72, y: 0.165 },
    shoulderFar: { x: 0.44, y: 0.28 }, elbowFar: { x: 0.35, y: 0.25 }, wristFar: { x: 0.275, y: 0.185 },
    hipNear: { x: 0.54, y: 0.51 }, kneeNear: { x: 0.575, y: 0.665 }, ankleNear: { x: 0.535, y: 0.83 }, toeNear: { x: 0.585, y: 0.865 },
    hipFar: { x: 0.46, y: 0.51 }, kneeFar: { x: 0.395, y: 0.65 }, ankleFar: { x: 0.355, y: 0.815 }, toeFar: { x: 0.30, y: 0.845 },
    prop: { kind: 'glove', at: { x: 0.26, y: 0.175 }, angle: -0.4 },
  },
];

export function posesFor(sport: Sport): PoseSpec[] {
  return POSES.filter(p => p.sport === sport);
}

// ---------------------------------------------------------------------------
// Figure rendering
// ---------------------------------------------------------------------------

export interface AthleteStyle {
  jersey: string;      // team primary
  trim: string;        // team secondary
  pants: string;
  skin: string;
  jerseyNumber: number;
  sport: Sport;
  /** Nickname wordmark across the chest. */
  wordmark: string;
  pinstripes: boolean; // baseball whites
}

export function athleteStyle(
  appearanceSeed: bigint, jerseyNumber: number, sport: Sport,
  primary: string, secondary: string, wordmark = '',
): AthleteStyle {
  const rng = new Rng(appearanceSeed);
  const pantsWhite = rng.chance(0.5);
  return {
    jersey: primary,
    trim: secondary,
    pants: pantsWhite ? '#e8e6df' : shade(primary, -0.12),
    skin: rng.pick(SKIN_TONES),
    jerseyNumber,
    sport,
    wordmark,
    pinstripes: sport === 'baseball' && pantsWhite && rng.chance(0.5),
  };
}

/** Stroke a limb chain with tapered round-capped segments — solid, smooth. */
function limb(
  ctx: CanvasRenderingContext2D,
  pts: Pt[], w0: number, w1: number, color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const segs = pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    ctx.lineWidth = w0 + (w1 - w0) * (t0 + t1) / 2;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    if (i + 2 <= segs) {
      // Smooth through the joint.
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      void mx; void my;
    }
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
}

/**
 * Draw the athlete into `ctx` filling the rect (x, y, w, h).
 * The caller composites this layer over the card background.
 */
export function drawAthlete(
  ctx: CanvasRenderingContext2D,
  pose: PoseSpec,
  style: AthleteStyle,
  x: number, y: number, w: number, h: number,
  appearanceSeed: bigint,
): void {
  const rng = new Rng(appearanceSeed);
  const jx = (rng.float() - 0.5) * 0.01, jy = (rng.float() - 0.5) * 0.01;
  const S = (p: Pt): Pt => ({ x: x + (p.x + jx) * w, y: y + (p.y + jy) * h });
  const P = {
    head: S(pose.head), neck: S(pose.neck), pelvis: S(pose.pelvis),
    sN: S(pose.shoulderNear), eN: S(pose.elbowNear), wN: S(pose.wristNear),
    sF: S(pose.shoulderFar), eF: S(pose.elbowFar), wF: S(pose.wristFar),
    hN: S(pose.hipNear), kN: S(pose.kneeNear), aN: S(pose.ankleNear), tN: S(pose.toeNear),
    hF: S(pose.hipFar), kF: S(pose.kneeFar), aF: S(pose.ankleFar), tF: S(pose.toeFar),
  };
  const u = Math.min(w, h);
  const armW = 0.058 * u, foreW = 0.044 * u, legW = 0.085 * u, calfW = 0.06 * u;
  const skinDark = shade(style.skin, -0.08);
  const jerseyDark = shade(style.jersey, -0.12);
  const pantsDark = shade(style.pants, -0.1);
  const far = (c: string) => shade(c, -0.1);

  // --- FAR limbs (painter's order) ---
  limb(ctx, [P.sF, P.eF], armW * 1.05, armW * 0.85, far(jerseyDark));
  limb(ctx, [P.eF, P.wF], foreW, foreW * 0.8, far(skinDark));
  // Far hand: gloved for football, bare for baseball unless holding a mitt.
  const farArmAngle = Math.atan2(P.wF.y - P.eF.y, P.wF.x - P.eF.x);
  if (style.sport === 'football') {
    drawGlove(
      ctx, P.wF.x, P.wF.y, foreW * 1.15, farArmAngle,
      far(shade(style.jersey, -0.18)), far(shade(style.trim, -0.1)),
    );
  } else {
    ctx.beginPath();
    ctx.arc(P.wF.x, P.wF.y, foreW * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = far(skinDark);
    ctx.fill();
  }
  limb(ctx, [P.hF, P.kF], legW, legW * 0.85, far(pantsDark));
  limb(ctx, [P.kF, P.aF], calfW, calfW * 0.75, far(pantsDark));
  if (style.sport === 'baseball') {
    const midF = { x: (P.kF.x + P.aF.x) / 2, y: (P.kF.y + P.aF.y) / 2 };
    limb(ctx, [midF, P.aF], calfW * 0.86, calfW * 0.7, far(style.jersey));
  }
  drawCleat(ctx, P.aF.x, P.aF.y, P.tF.x, P.tF.y, calfW * 1.05, '#26262c', far(style.trim));
  if (style.sport === 'football') {
    drawKneePad(
      ctx, P.kF.x, P.kF.y, legW * 0.82,
      Math.atan2(P.aF.y - P.hF.y, P.aF.x - P.hF.x) + Math.PI / 2,
      far(shade(style.pants, -0.07)),
    );
  }

  // --- Torso: solid closed path neck→shoulders→hips ---
  const shoulderW = Math.hypot(P.sN.x - P.sF.x, P.sN.y - P.sF.y);
  ctx.beginPath();
  ctx.moveTo(P.neck.x, P.neck.y - 0.01 * u);
  ctx.quadraticCurveTo(
    P.sN.x + (P.sN.x - P.neck.x) * 0.45, P.sN.y - 0.03 * u,
    P.sN.x + (P.sN.x - P.neck.x) * 0.35, P.sN.y + 0.02 * u,
  );
  ctx.quadraticCurveTo(
    (P.sN.x + P.hN.x) / 2 + shoulderW * 0.16, (P.sN.y + P.hN.y) / 2,
    P.hN.x + 0.02 * u, P.hN.y + 0.015 * u,
  );
  ctx.lineTo(P.hF.x - 0.02 * u, P.hF.y + 0.015 * u);
  ctx.quadraticCurveTo(
    (P.sF.x + P.hF.x) / 2 - shoulderW * 0.16, (P.sF.y + P.hF.y) / 2,
    P.sF.x - (P.neck.x - P.sF.x) * 0.35, P.sF.y + 0.02 * u,
  );
  ctx.quadraticCurveTo(
    P.sF.x - (P.neck.x - P.sF.x) * 0.45, P.sF.y - 0.03 * u,
    P.neck.x, P.neck.y - 0.01 * u,
  );
  ctx.closePath();
  ctx.fillStyle = style.jersey;
  ctx.fill();

  // Torso detail inside the silhouette: fabric shading, pinstripes or side
  // panels, collar, yoke, wordmark, number, belt.
  ctx.save();
  ctx.clip();
  const grad = ctx.createLinearGradient(P.sF.x - 0.1 * u, P.sF.y, P.sN.x + 0.12 * u, P.hN.y);
  grad.addColorStop(0, withAlpha('#000010', 0.28));
  grad.addColorStop(0.5, withAlpha('#000000', 0));
  grad.addColorStop(1, withAlpha('#ffffff', 0.08));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  const lean = Math.atan2(P.pelvis.x - P.neck.x, P.pelvis.y - P.neck.y);
  if (style.pinstripes) {
    ctx.strokeStyle = withAlpha(shade(style.jersey, -0.22), 0.55);
    ctx.lineWidth = 0.005 * u;
    for (let sx = -6; sx <= 6; sx++) {
      const px = P.neck.x + sx * 0.022 * u;
      ctx.beginPath();
      ctx.moveTo(px + Math.tan(lean) * -0.1 * u, P.neck.y - 0.05 * u);
      ctx.lineTo(px + Math.tan(lean) * 0.28 * u, P.pelvis.y + 0.06 * u);
      ctx.stroke();
    }
  } else {
    // Side panel stripes down both flanks in trim color.
    ctx.strokeStyle = withAlpha(style.trim, 0.85);
    ctx.lineWidth = 0.02 * u;
    ctx.beginPath();
    ctx.moveTo(P.sN.x + 0.012 * u, P.sN.y + 0.03 * u);
    ctx.quadraticCurveTo(
      (P.sN.x + P.hN.x) / 2 + shoulderW * 0.14, (P.sN.y + P.hN.y) / 2,
      P.hN.x + 0.01 * u, P.hN.y,
    );
    ctx.moveTo(P.sF.x - 0.012 * u, P.sF.y + 0.03 * u);
    ctx.quadraticCurveTo(
      (P.sF.x + P.hF.x) / 2 - shoulderW * 0.14, (P.sF.y + P.hF.y) / 2,
      P.hF.x - 0.01 * u, P.hF.y,
    );
    ctx.stroke();
  }

  // Collar V at the neck.
  ctx.strokeStyle = style.trim;
  ctx.lineWidth = 0.016 * u;
  ctx.beginPath();
  ctx.moveTo(P.neck.x - 0.045 * u, P.neck.y + 0.008 * u);
  ctx.lineTo(P.neck.x, P.neck.y + 0.05 * u);
  ctx.lineTo(P.neck.x + 0.045 * u, P.neck.y + 0.008 * u);
  ctx.stroke();
  // Yoke seam.
  ctx.lineWidth = 0.008 * u;
  ctx.strokeStyle = withAlpha(shade(style.jersey, -0.2), 0.7);
  ctx.beginPath();
  ctx.moveTo(P.sF.x, P.sF.y + 0.045 * u);
  ctx.quadraticCurveTo(P.neck.x, P.neck.y + 0.085 * u, P.sN.x, P.sN.y + 0.045 * u);
  ctx.stroke();

  // Wordmark arc + number, rotated with the torso lean.
  const chest = { x: (P.neck.x + P.pelvis.x) / 2, y: P.neck.y + (P.pelvis.y - P.neck.y) * 0.40 };
  ctx.translate(chest.x, chest.y);
  ctx.rotate(-lean * 0.6);
  if (style.wordmark) {
    const word = style.wordmark.toUpperCase();
    let px = 0.033 * u;
    ctx.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    const maxW = 0.145 * u;
    const measured = ctx.measureText(word).width;
    if (measured > maxW) px *= maxW / measured;
    ctx.font = `700 ${px}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = shade(style.trim, -0.25);
    ctx.strokeText(word, 0, -0.075 * u);
    ctx.fillStyle = style.trim;
    ctx.fillText(word, 0, -0.075 * u);
  }
  const numSize = 0.098 * u;
  ctx.font = `900 ${numSize}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = numSize * 0.18;
  ctx.strokeStyle = shade(style.trim, -0.24);
  ctx.strokeText(String(style.jerseyNumber), 0, 0.02 * u);
  ctx.fillStyle = style.trim;
  ctx.fillText(String(style.jerseyNumber), 0, 0.02 * u);
  ctx.rotate(lean * 0.6);
  ctx.translate(-chest.x, -chest.y);

  // Belt line for baseball.
  if (style.sport === 'baseball') {
    ctx.strokeStyle = shade(style.trim, -0.15);
    ctx.lineWidth = 0.018 * u;
    ctx.beginPath();
    ctx.moveTo(P.hF.x - 0.02 * u, P.hF.y - 0.005 * u);
    ctx.lineTo(P.hN.x + 0.02 * u, P.hN.y - 0.005 * u);
    ctx.stroke();
  }
  ctx.restore();

  // Neck.
  limb(ctx, [P.neck, { x: P.head.x, y: P.head.y + 0.04 * u }], 0.05 * u, 0.045 * u, style.skin);

  // --- NEAR leg ---
  limb(ctx, [P.hN, P.kN], legW * 1.05, legW * 0.9, style.pants);
  limb(ctx, [P.kN, P.aN], calfW * 1.05, calfW * 0.8, style.pants);
  if (style.sport === 'baseball') {
    // Stirrup sock over the pant leg, in the team's color.
    const mid = { x: (P.kN.x + P.aN.x) / 2, y: (P.kN.y + P.aN.y) / 2 };
    limb(ctx, [mid, P.aN], calfW * 0.9, calfW * 0.72, style.jersey);
    limb(
      ctx,
      [{ x: mid.x * 0.5 + P.kN.x * 0.5, y: mid.y * 0.5 + P.kN.y * 0.5 }, mid],
      calfW * 0.94, calfW * 0.9, style.trim,
    );
  }
  drawCleat(ctx, P.aN.x, P.aN.y, P.tN.x, P.tN.y, calfW * 1.15, '#2b2b31', style.trim);
  if (style.sport === 'football') {
    drawKneePad(
      ctx, P.kN.x, P.kN.y, legW * 0.86,
      Math.atan2(P.aN.y - P.hN.y, P.aN.x - P.hN.x) + Math.PI / 2,
      shade(style.pants, -0.06),
    );
  }

  // --- Head + headgear ---
  const headR = 0.062 * u;
  const dir = pose.motion.x >= 0 ? 1 : -1;
  if (style.sport === 'football') {
    drawFootballHelmet(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim, style.skin);
  } else {
    // Bare head first, then the lid — batters wear flaps, fielders wear caps.
    ctx.beginPath();
    ctx.arc(P.head.x, P.head.y, headR * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = style.skin;
    ctx.fill();
    if (pose.prop?.kind === 'bat') {
      drawBattingHelmet(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim, style.skin);
    } else {
      drawCap(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim);
    }
    // Eyes, then eye black smudged beneath them.
    ctx.fillStyle = 'rgba(27, 16, 8, 0.82)';
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.44, P.head.y + headR * 0.1, headR * 0.1, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.02, P.head.y + headR * 0.14, headR * 0.09, headR * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 20, 16, 0.42)';
    ctx.beginPath();
    ctx.ellipse(P.head.x + dir * headR * 0.44, P.head.y + headR * 0.3, headR * 0.16, headR * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- NEAR arm (over everything) ---
  limb(ctx, [P.sN, P.eN], armW * 1.1, armW * 0.9, style.jersey);
  // Sleeve trim ring at the cuff.
  const cuff = { x: P.sN.x + (P.eN.x - P.sN.x) * 0.5, y: P.sN.y + (P.eN.y - P.sN.y) * 0.5 };
  limb(
    ctx,
    [
      { x: cuff.x - (P.eN.x - P.sN.x) * 0.06, y: cuff.y - (P.eN.y - P.sN.y) * 0.06 },
      { x: cuff.x + (P.eN.x - P.sN.x) * 0.06, y: cuff.y + (P.eN.y - P.sN.y) * 0.06 },
    ],
    armW * 0.95, armW * 0.95, style.trim,
  );
  limb(ctx, [P.eN, P.wN], foreW * 1.05, foreW * 0.85, style.skin);
  const nearArmAngle = Math.atan2(P.wN.y - P.eN.y, P.wN.x - P.eN.x);
  // Wristband just up the forearm from the hand.
  drawBand(
    ctx,
    P.wN.x - Math.cos(nearArmAngle) * foreW * 0.9,
    P.wN.y - Math.sin(nearArmAngle) * foreW * 0.9,
    foreW * 1.05, nearArmAngle + Math.PI / 2, '#f0ede4',
  );
  if (style.sport === 'football') {
    drawGlove(
      ctx, P.wN.x, P.wN.y, foreW * 1.25, nearArmAngle,
      shade(style.jersey, -0.14), style.trim,
    );
  } else {
    ctx.beginPath();
    ctx.arc(P.wN.x, P.wN.y, foreW * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = style.skin;
    ctx.fill();
  }

  // --- Prop ---
  if (pose.prop) {
    const at = { x: x + pose.prop.at.x * w, y: y + pose.prop.at.y * h };
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(pose.prop.angle);
    switch (pose.prop.kind) {
      case 'football': {
        const rw = 0.062 * u, rh = 0.038 * u;
        ctx.beginPath();
        ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#6b3a1f';
        ctx.fill();
        ctx.strokeStyle = withAlpha('#3d2113', 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = '#f0ede4';
        ctx.lineWidth = rh * 0.13;
        ctx.beginPath();
        ctx.moveTo(-rw * 0.38, 0);
        ctx.lineTo(rw * 0.38, 0);
        ctx.stroke();
        break;
      }
      case 'baseball': {
        const r = 0.026 * u;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#f3f1e8';
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = r * 0.2;
        ctx.beginPath();
        ctx.arc(-r * 0.42, 0, r * 0.8, -1, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r * 0.42, 0, r * 0.8, Math.PI - 1, Math.PI + 1);
        ctx.stroke();
        break;
      }
      case 'bat': {
        const bl = 0.32 * u;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#b98a4a';
        ctx.lineWidth = 0.024 * u;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bl * 0.35, 0);
        ctx.stroke();
        ctx.lineWidth = 0.042 * u;
        ctx.beginPath();
        ctx.moveTo(bl * 0.35, 0);
        ctx.lineTo(bl, 0);
        ctx.stroke();
        break;
      }
      case 'glove': {
        ctx.rotate(-pose.prop.angle);
        drawMitt(ctx, 0, 0, 0.05 * u, pose.prop.angle);
        break;
      }
    }
    ctx.restore();
  }
}

/**
 * Full figure layer with cel shading + rim light, rendered offscreen and
 * blitted with a cutout drop shadow. Motion streaks go behind the figure.
 */
export function renderAthleteLayer(
  target: CanvasRenderingContext2D,
  pose: PoseSpec,
  style: AthleteStyle,
  x: number, y: number, w: number, h: number,
  appearanceSeed: bigint,
  accent: string,
): void {
  const off = document.createElement('canvas');
  off.width = Math.ceil(w);
  off.height = Math.ceil(h);
  const ctx = off.getContext('2d')!;

  drawAthlete(ctx, pose, style, 0, 0, w, h, appearanceSeed);

  // Cel shading composited into the silhouette.
  ctx.globalCompositeOperation = 'source-atop';
  const mx = pose.motion.x, my = pose.motion.y;
  const len = Math.hypot(mx, my) || 1;
  const lx = -mx / len, ly = -my / len; // light from opposite the motion
  const cx = w / 2, cy = h / 2, r = Math.max(w, h) * 0.62;
  const shadeGrad = ctx.createLinearGradient(cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
  shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,20,0.30)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Motion streaks behind the figure.
  target.save();
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const sy = y + h * (0.32 + t * 0.34);
    const sx = x + w * 0.5;
    const slen = w * (0.4 + t * 0.2);
    const sgrad = target.createLinearGradient(
      sx - mx * slen, sy - my * slen * 0.4, sx + mx * slen * 0.4, sy + my * slen * 0.15,
    );
    sgrad.addColorStop(0, withAlpha(accent, 0));
    sgrad.addColorStop(1, withAlpha(accent, 0.3 - t * 0.15));
    target.strokeStyle = sgrad;
    target.lineWidth = h * 0.01 * (1 + t);
    target.lineCap = 'round';
    target.beginPath();
    target.moveTo(sx - mx * slen, sy - my * slen * 0.4);
    target.quadraticCurveTo(sx, sy + h * 0.015, sx + mx * slen * 0.35, sy + my * slen * 0.12);
    target.stroke();
  }
  target.restore();

  // Rim light along the lit edge: tinted silhouette minus offset silhouette.
  const rim = document.createElement('canvas');
  rim.width = off.width;
  rim.height = off.height;
  const rctx = rim.getContext('2d')!;
  rctx.drawImage(off, 0, 0);
  rctx.globalCompositeOperation = 'source-in';
  rctx.fillStyle = mixHex(accent, '#ffffff', 0.7);
  rctx.fillRect(0, 0, w, h);
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(off, lx * w * 0.014, ly * h * 0.014);

  // Die-cut keyline. Premium inserts photoshop a thick WHITE sticker outline
  // around the cutout — it separates the figure from any background far more
  // aggressively than a dark line, and it's the single most recognizable
  // trait of the style. A thin dark line outside it keeps the edge defined.
  const keyline = (radius: number, color: string): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = off.width;
    c.height = off.height;
    const kctx = c.getContext('2d')!;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      kctx.drawImage(off, Math.cos(ang) * radius, Math.sin(ang) * radius);
    }
    kctx.globalCompositeOperation = 'source-in';
    kctx.fillStyle = color;
    kctx.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const kr = Math.max(2, w * 0.0075);
  const outline = keyline(kr * 1.5, 'rgba(18,18,26,0.55)');
  const sticker = keyline(kr, '#f7f5ef');

  // Blit: shadow → dark edge → white sticker → figure → rim.
  target.save();
  target.shadowColor = 'rgba(0,0,0,0.55)';
  target.shadowBlur = Math.max(8, w * 0.04);
  target.shadowOffsetX = w * 0.014 * (mx >= 0 ? -1 : 1);
  target.shadowOffsetY = h * 0.02;
  target.drawImage(outline, x, y);
  target.restore();
  target.drawImage(sticker, x, y);
  target.drawImage(off, x, y);
  target.save();
  target.globalAlpha = 0.65;
  target.globalCompositeOperation = 'lighter';
  target.drawImage(rim, x, y);
  target.restore();
}
