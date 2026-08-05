/**
 * Athlete figure renderer — stylized poster treatment.
 *
 * Figures are authored as pose keyframes (joint coordinates in a normalized
 * 0..1 box, y-down) and built from tapered muscle VOLUMES rather than
 * uniform tubes — a limb swells over the belly and necks into the joint,
 * which is the difference between an athlete and a mannequin. The torso is
 * a single closed silhouette with deltoids, a waist and hips.
 *
 * Every volume is lit by a single directional key light (opposite the
 * motion vector), shaded as a cylinder with a core shadow and reflected
 * light, so the figure reads as painted rather than flat-filled. The whole
 * figure is then cut out behind a slim die-cut keyline, mirroring real card
 * construction: a crisp cutout floated over a printed backdrop.
 *
 * Determinism: everything derives from (appearanceSeed, poseId, team colors).
 */

import { Rng } from '../engine/rng';
import type { Sport } from '../engine/world/teams';
import { shade, withAlpha, mixHex } from './color';
import {
  drawFootballHelmet, drawBattingHelmet, drawCap, drawGlove, drawMitt,
  drawCleat, drawKneePad, drawBand, drawFace,
} from './equipment';
import {
  volume, torsoPath, shoulderPad, neckColumn, jointShadow, deltoidCap,
  SPINDLE, TAPER_IN, BELLY, FLAT as FLATW, type Light,
} from './anatomy';

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
    // QB, deep pass. Wide forward stride with the back foot up on its toes;
    // chest twisting downfield; throwing elbow ABOVE the shoulder line with
    // the hand back by the ear; off arm pulled tight to the chest to speed
    // the rotation up.
    id: 'qb-deep', sport: 'football', motion: { x: -0.75, y: -0.12 },
    head: { x: 0.455, y: 0.145 }, neck: { x: 0.475, y: 0.225 }, pelvis: { x: 0.505, y: 0.505 },
    shoulderNear: { x: 0.575, y: 0.285 }, elbowNear: { x: 0.655, y: 0.215 }, wristNear: { x: 0.565, y: 0.125 },
    shoulderFar: { x: 0.395, y: 0.29 }, elbowFar: { x: 0.335, y: 0.375 }, wristFar: { x: 0.45, y: 0.415 },
    hipNear: { x: 0.535, y: 0.505 }, kneeNear: { x: 0.625, y: 0.645 }, ankleNear: { x: 0.665, y: 0.815 }, toeNear: { x: 0.725, y: 0.865 },
    hipFar: { x: 0.472, y: 0.505 }, kneeFar: { x: 0.355, y: 0.635 }, ankleFar: { x: 0.275, y: 0.805 }, toeFar: { x: 0.205, y: 0.845 },
    prop: { kind: 'football', at: { x: 0.585, y: 0.10 }, angle: -1.1 },
  },
  {
    // RB, the hard cut. One leg planted at a severe angle carrying all the
    // weight, the other lifted high into the new direction. Center of
    // gravity low, torso leaning out over the plant. Ball clamped to the
    // ribs, free arm flung out horizontally for balance.
    id: 'rb-cut', sport: 'football', motion: { x: -0.95, y: -0.05 },
    head: { x: 0.395, y: 0.195 }, neck: { x: 0.435, y: 0.275 }, pelvis: { x: 0.525, y: 0.545 },
    shoulderNear: { x: 0.525, y: 0.315 }, elbowNear: { x: 0.495, y: 0.44 }, wristNear: { x: 0.40, y: 0.418 },
    shoulderFar: { x: 0.405, y: 0.32 }, elbowFar: { x: 0.555, y: 0.37 }, wristFar: { x: 0.675, y: 0.44 },
    hipNear: { x: 0.552, y: 0.545 }, kneeNear: { x: 0.665, y: 0.675 }, ankleNear: { x: 0.735, y: 0.835 }, toeNear: { x: 0.795, y: 0.86 },
    hipFar: { x: 0.495, y: 0.55 }, kneeFar: { x: 0.355, y: 0.585 }, ankleFar: { x: 0.30, y: 0.705 }, toeFar: { x: 0.235, y: 0.735 },
    prop: { kind: 'football', at: { x: 0.405, y: 0.40 }, angle: 1.15 },
  },
  {
    // Receiver at full extension for the grab — hands out past the helmet,
    // body stretched, both feet off the turf.
    id: 'wr-catch', sport: 'football', motion: { x: -0.3, y: -0.85 },
    head: { x: 0.50, y: 0.185 }, neck: { x: 0.50, y: 0.265 }, pelvis: { x: 0.50, y: 0.525 },
    shoulderNear: { x: 0.572, y: 0.30 }, elbowNear: { x: 0.62, y: 0.20 }, wristNear: { x: 0.60, y: 0.09 },
    shoulderFar: { x: 0.428, y: 0.30 }, elbowFar: { x: 0.38, y: 0.20 }, wristFar: { x: 0.42, y: 0.09 },
    hipNear: { x: 0.532, y: 0.525 }, kneeNear: { x: 0.60, y: 0.655 }, ankleNear: { x: 0.555, y: 0.79 }, toeNear: { x: 0.59, y: 0.845 },
    hipFar: { x: 0.468, y: 0.525 }, kneeFar: { x: 0.395, y: 0.64 }, ankleFar: { x: 0.43, y: 0.785 }, toeFar: { x: 0.385, y: 0.835 },
    prop: { kind: 'football', at: { x: 0.51, y: 0.055 }, angle: 0.25 },
  },
  {
    // RB hurdling a would-be tackler: both knees driven high, ball locked to
    // the chest, free arm thrown up and back for balance. Airborne.
    id: 'rb-hurdle', sport: 'football', motion: { x: -0.6, y: -0.6 },
    head: { x: 0.475, y: 0.16 }, neck: { x: 0.49, y: 0.24 }, pelvis: { x: 0.50, y: 0.50 },
    shoulderNear: { x: 0.565, y: 0.295 }, elbowNear: { x: 0.625, y: 0.40 }, wristNear: { x: 0.545, y: 0.445 },
    shoulderFar: { x: 0.425, y: 0.295 }, elbowFar: { x: 0.335, y: 0.235 }, wristFar: { x: 0.26, y: 0.135 },
    hipNear: { x: 0.535, y: 0.50 }, kneeNear: { x: 0.645, y: 0.565 }, ankleNear: { x: 0.60, y: 0.70 }, toeNear: { x: 0.655, y: 0.735 },
    hipFar: { x: 0.465, y: 0.50 }, kneeFar: { x: 0.35, y: 0.59 }, ankleFar: { x: 0.375, y: 0.735 }, toeFar: { x: 0.325, y: 0.785 },
    prop: { kind: 'football', at: { x: 0.525, y: 0.435 }, angle: 0.9 },
  },
  {
    // Ball carrier throwing a stiff-arm: far arm rammed straight out into
    // the defender's space, ball high and tight on the near side, full
    // sprint stride underneath.
    id: 'stiff-arm', sport: 'football', motion: { x: -0.9, y: 0 },
    head: { x: 0.465, y: 0.17 }, neck: { x: 0.485, y: 0.25 }, pelvis: { x: 0.52, y: 0.52 },
    shoulderNear: { x: 0.575, y: 0.30 }, elbowNear: { x: 0.625, y: 0.405 }, wristNear: { x: 0.525, y: 0.44 },
    shoulderFar: { x: 0.42, y: 0.30 }, elbowFar: { x: 0.315, y: 0.375 }, wristFar: { x: 0.215, y: 0.45 },
    hipNear: { x: 0.552, y: 0.52 }, kneeNear: { x: 0.445, y: 0.635 }, ankleNear: { x: 0.40, y: 0.795 }, toeNear: { x: 0.33, y: 0.835 },
    hipFar: { x: 0.488, y: 0.52 }, kneeFar: { x: 0.60, y: 0.645 }, ankleFar: { x: 0.70, y: 0.765 }, toeFar: { x: 0.775, y: 0.815 },
    prop: { kind: 'football', at: { x: 0.505, y: 0.43 }, angle: 1.0 },
  },
  {
    // Batter at the contact point. Back foot pivoted with the heel to the
    // sky, front leg completely straight and rigid as a block, hips fully
    // open, back shoulder noticeably lower than the front, both hands
    // driving the barrel through in a hard V.
    id: 'batter-contact', sport: 'baseball', motion: { x: -0.85, y: -0.18 },
    head: { x: 0.435, y: 0.185 }, neck: { x: 0.455, y: 0.265 }, pelvis: { x: 0.50, y: 0.53 },
    shoulderNear: { x: 0.558, y: 0.315 }, elbowNear: { x: 0.605, y: 0.365 }, wristNear: { x: 0.665, y: 0.305 },
    shoulderFar: { x: 0.418, y: 0.285 }, elbowFar: { x: 0.55, y: 0.35 }, wristFar: { x: 0.648, y: 0.31 },
    hipNear: { x: 0.535, y: 0.53 }, kneeNear: { x: 0.625, y: 0.675 }, ankleNear: { x: 0.665, y: 0.80 }, toeNear: { x: 0.615, y: 0.868 },
    hipFar: { x: 0.468, y: 0.53 }, kneeFar: { x: 0.40, y: 0.69 }, ankleFar: { x: 0.355, y: 0.855 }, toeFar: { x: 0.295, y: 0.875 },
    prop: { kind: 'bat', at: { x: 0.672, y: 0.30 }, angle: -0.5 },
  },
  {
    // Pitcher mid-delivery. Front leg braced and planted, back leg trailing
    // far behind with the toe scraping, hips square to the plate while the
    // chest stays closed, throwing forearm laid back near-parallel to the
    // ground, glove tucked hard into the ribcage.
    id: 'pitcher-delivery', sport: 'baseball', motion: { x: -0.8, y: 0.08 },
    head: { x: 0.455, y: 0.165 }, neck: { x: 0.47, y: 0.245 }, pelvis: { x: 0.50, y: 0.515 },
    shoulderNear: { x: 0.572, y: 0.285 }, elbowNear: { x: 0.685, y: 0.265 }, wristNear: { x: 0.795, y: 0.235 },
    shoulderFar: { x: 0.398, y: 0.295 }, elbowFar: { x: 0.365, y: 0.405 }, wristFar: { x: 0.46, y: 0.44 },
    hipNear: { x: 0.535, y: 0.515 }, kneeNear: { x: 0.685, y: 0.60 }, ankleNear: { x: 0.80, y: 0.715 }, toeNear: { x: 0.865, y: 0.755 },
    hipFar: { x: 0.468, y: 0.515 }, kneeFar: { x: 0.365, y: 0.665 }, ankleFar: { x: 0.305, y: 0.835 }, toeFar: { x: 0.245, y: 0.862 },
    prop: { kind: 'baseball', at: { x: 0.828, y: 0.222 }, angle: 0 },
  },
  {
    // Infielder firing across the diamond: crow hop into a sidearm release,
    // glove hand trailing back for counterbalance.
    id: 'fielder-throw', sport: 'baseball', motion: { x: -0.55, y: -0.28 },
    head: { x: 0.475, y: 0.16 }, neck: { x: 0.49, y: 0.24 }, pelvis: { x: 0.50, y: 0.515 },
    shoulderNear: { x: 0.572, y: 0.28 }, elbowNear: { x: 0.655, y: 0.225 }, wristNear: { x: 0.735, y: 0.175 },
    shoulderFar: { x: 0.412, y: 0.285 }, elbowFar: { x: 0.34, y: 0.255 }, wristFar: { x: 0.26, y: 0.19 },
    hipNear: { x: 0.535, y: 0.515 }, kneeNear: { x: 0.60, y: 0.665 }, ankleNear: { x: 0.545, y: 0.835 }, toeNear: { x: 0.60, y: 0.868 },
    hipFar: { x: 0.468, y: 0.515 }, kneeFar: { x: 0.375, y: 0.655 }, ankleFar: { x: 0.335, y: 0.82 }, toeFar: { x: 0.275, y: 0.848 },
    prop: { kind: 'glove', at: { x: 0.245, y: 0.175 }, angle: -0.5 },
  },
  {
    // The home-run walk-off finish: bat wrapped behind the lead shoulder on
    // the follow-through, chin up, watching it leave. Front leg locked.
    id: 'hr-watch', sport: 'baseball', motion: { x: -0.35, y: -0.3 },
    head: { x: 0.475, y: 0.17 }, neck: { x: 0.49, y: 0.25 }, pelvis: { x: 0.50, y: 0.53 },
    shoulderNear: { x: 0.57, y: 0.30 }, elbowNear: { x: 0.635, y: 0.225 }, wristNear: { x: 0.575, y: 0.155 },
    shoulderFar: { x: 0.43, y: 0.30 }, elbowFar: { x: 0.395, y: 0.21 }, wristFar: { x: 0.52, y: 0.165 },
    hipNear: { x: 0.533, y: 0.53 }, kneeNear: { x: 0.595, y: 0.685 }, ankleNear: { x: 0.625, y: 0.835 }, toeNear: { x: 0.685, y: 0.862 },
    hipFar: { x: 0.467, y: 0.53 }, kneeFar: { x: 0.425, y: 0.70 }, ankleFar: { x: 0.405, y: 0.855 }, toeFar: { x: 0.345, y: 0.875 },
    prop: { kind: 'bat', at: { x: 0.578, y: 0.158 }, angle: -2.2 },
  },
  {
    // Center fielder robbing a homer at the wall — glove arm at full
    // vertical stretch, body long, both feet off the grass.
    id: 'wall-robbery', sport: 'baseball', motion: { x: -0.2, y: -0.9 },
    head: { x: 0.49, y: 0.20 }, neck: { x: 0.50, y: 0.275 }, pelvis: { x: 0.50, y: 0.55 },
    shoulderNear: { x: 0.565, y: 0.315 }, elbowNear: { x: 0.60, y: 0.205 }, wristNear: { x: 0.615, y: 0.10 },
    shoulderFar: { x: 0.435, y: 0.315 }, elbowFar: { x: 0.385, y: 0.42 }, wristFar: { x: 0.335, y: 0.50 },
    hipNear: { x: 0.53, y: 0.55 }, kneeNear: { x: 0.575, y: 0.70 }, ankleNear: { x: 0.545, y: 0.83 }, toeNear: { x: 0.578, y: 0.872 },
    hipFar: { x: 0.47, y: 0.55 }, kneeFar: { x: 0.40, y: 0.67 }, ankleFar: { x: 0.43, y: 0.80 }, toeFar: { x: 0.395, y: 0.85 },
    prop: { kind: 'glove', at: { x: 0.625, y: 0.075 }, angle: 0.35 },
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
  /** Mirrored visor on football helmets — the money look. */
  visor: boolean;
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
    visor: sport === 'football' && rng.chance(0.4),
  };
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
    // Head pulled 20% toward the neck: athletes in pads have almost no
    // visible neck — the helmet sits ON the collar.
    head: S({
      x: pose.head.x + (pose.neck.x - pose.head.x) * 0.2,
      y: pose.head.y + (pose.neck.y - pose.head.y) * 0.2,
    }),
    neck: S(pose.neck), pelvis: S(pose.pelvis),
    sN: S(pose.shoulderNear), eN: S(pose.elbowNear), wN: S(pose.wristNear),
    sF: S(pose.shoulderFar), eF: S(pose.elbowFar), wF: S(pose.wristFar),
    hN: S(pose.hipNear), kN: S(pose.kneeNear), aN: S(pose.ankleNear), tN: S(pose.toeNear),
    hF: S(pose.hipFar), kF: S(pose.kneeFar), aF: S(pose.ankleFar), tF: S(pose.toeFar),
  };
  const u = Math.min(w, h);
  // Football-player mass, not track-runner mass.
  const bulk = style.sport === 'football' ? 1.0 : 0.88;
  const armW = 0.075 * u * bulk, foreW = 0.058 * u * bulk;
  const legW = 0.105 * u * bulk, calfW = 0.075 * u * bulk;
  const skinDark = shade(style.skin, -0.08);
  const jerseyDark = shade(style.jersey, -0.12);
  const pantsDark = shade(style.pants, -0.1);
  // Far limbs recede with a soft darken — strong tints read as a different
  // material and make the limb look pasted on.
  const far = (c: string) => mixHex(shade(c, -0.07), '#3c4452', 0.1);

  // One key light for the whole figure, opposite the motion vector.
  const mlen = Math.hypot(pose.motion.x, pose.motion.y) || 1;
  const light: Light = { x: -pose.motion.x / mlen, y: -pose.motion.y / mlen };

  // --- FAR limbs (painter's order, and dimmed for depth) ---
  volume(ctx, P.sF, P.eF, armW * 0.95, TAPER_IN, far(jerseyDark), 0.06, light);
  volume(ctx, P.eF, P.wF, foreW * 0.95, BELLY, far(skinDark), -0.05, light);
  jointShadow(ctx, P.eF, foreW * 0.75, 0.14);
  const farArmAngle = Math.atan2(P.wF.y - P.eF.y, P.wF.x - P.eF.x);
  if (style.sport === 'football') {
    drawGlove(ctx, P.wF.x, P.wF.y, foreW * 1.1, farArmAngle,
      far(shade(style.jersey, -0.18)), far(shade(style.trim, -0.1)));
  } else {
    ctx.beginPath();
    ctx.arc(P.wF.x, P.wF.y, foreW * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = far(skinDark);
    ctx.fill();
  }
  volume(ctx, P.hF, P.kF, legW * 0.98, SPINDLE, far(pantsDark), 0.05, light);
  volume(ctx, P.kF, P.aF, calfW * 1.0, BELLY, far(pantsDark), -0.04, light);
  jointShadow(ctx, P.kF, calfW * 0.85, 0.14);
  if (style.sport === 'baseball') {
    const midF = { x: (P.kF.x + P.aF.x) / 2, y: (P.kF.y + P.aF.y) / 2 };
    volume(ctx, midF, P.aF, calfW * 0.88, TAPER_IN, far(style.jersey), 0, light);
  }
  drawCleat(ctx, P.aF.x, P.aF.y, P.tF.x, P.tF.y, calfW * 1.05, '#26262c', far(style.trim));
  if (style.sport === 'football') {
    drawKneePad(ctx, P.kF.x, P.kF.y, legW * 0.82,
      Math.atan2(P.aF.y - P.hF.y, P.aF.x - P.hF.x) + Math.PI / 2,
      far(shade(style.pants, -0.07)));
  }

  // --- Neck, then torso silhouette ---
  neckColumn(ctx, P.neck, { x: P.head.x, y: P.head.y + 0.03 * u }, u, skinDark, light);
  if (style.sport === 'football') {
    // Padded collar riding up the neck — shortens the bare-skin column and
    // reads as the jersey meeting the helmet, the way pads actually sit.
    const collarMid = {
      x: P.neck.x + (P.head.x - P.neck.x) * 0.42,
      y: P.neck.y + (P.head.y - P.neck.y) * 0.42,
    };
    volume(ctx, P.neck, collarMid, u * 0.088, TAPER_IN, shade(style.jersey, -0.06), 0, light);
  }

  torsoPath(ctx, P.neck, P.sN, P.sF, P.hN, P.hF, u);
  ctx.fillStyle = style.jersey;
  ctx.fill();

  // Torso detail, clipped to the silhouette.
  ctx.save();
  torsoPath(ctx, P.neck, P.sN, P.sF, P.hN, P.hF, u);
  ctx.clip();

  // Form shading: the chest plane facing the light burns bright, the flanks
  // roll away through a core shadow with a reflected kick at the far edge.
  const shoulderW = Math.hypot(P.sN.x - P.sF.x, P.sN.y - P.sF.y);
  const chestSpan = Math.max(shoulderW, u * 0.2);
  const torsoMid = {
    x: (P.neck.x + P.pelvis.x) / 2,
    y: (P.neck.y + P.pelvis.y) / 2,
  };
  const bodyGrad = ctx.createLinearGradient(
    torsoMid.x + light.x * chestSpan * 0.8, torsoMid.y - chestSpan * 0.3,
    torsoMid.x - light.x * chestSpan * 0.8, torsoMid.y + chestSpan * 0.3,
  );
  bodyGrad.addColorStop(0, withAlpha('#ffffff', 0.2));
  bodyGrad.addColorStop(0.3, withAlpha('#ffffff', 0.05));
  bodyGrad.addColorStop(0.62, withAlpha('#000014', 0.16));
  bodyGrad.addColorStop(0.88, withAlpha('#000014', 0.38));
  bodyGrad.addColorStop(1, withAlpha('#000014', 0.22));
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, w, h);

  // Fabric folds gathering at the waist — cheap, and reads as cloth.
  ctx.strokeStyle = withAlpha(shade(style.jersey, -0.26), 0.4);
  ctx.lineWidth = 0.006 * u;
  const waist = { x: (P.hN.x + P.hF.x) / 2, y: (P.hN.y + P.hF.y) / 2 };
  for (const off of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(waist.x + off * shoulderW * 0.5, waist.y - 0.02 * u);
    ctx.quadraticCurveTo(
      waist.x + off * shoulderW * 0.3, waist.y - 0.075 * u,
      waist.x + off * shoulderW * 0.55, waist.y - 0.12 * u,
    );
    ctx.stroke();
  }
  // Shadow pooling where the jersey tucks into the pants.
  const tuck = ctx.createRadialGradient(waist.x, waist.y, 0, waist.x, waist.y, shoulderW * 0.8);
  tuck.addColorStop(0, withAlpha('#000014', 0.22));
  tuck.addColorStop(1, withAlpha('#000014', 0));
  ctx.fillStyle = tuck;
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
    // Side panels ride the flanks of the spine, not the shoulder joints —
    // in a rotated pose the joints sit inside the body and the stripes would
    // cut straight across the chest.
    const spineTop = { x: (P.sN.x + P.sF.x) / 2, y: (P.sN.y + P.sF.y) / 2 };
    const spineBot = { x: (P.hN.x + P.hF.x) / 2, y: (P.hN.y + P.hF.y) / 2 };
    const sdx = spineBot.x - spineTop.x, sdy = spineBot.y - spineTop.y;
    const slen = Math.hypot(sdx, sdy) || 1;
    const flank = 0.088 * u;
    ctx.strokeStyle = withAlpha(style.trim, 0.85);
    ctx.lineWidth = 0.018 * u;
    for (const side of [1, -1]) {
      const ox = (-sdy / slen) * side * flank;
      const oy = (sdx / slen) * side * flank;
      ctx.beginPath();
      ctx.moveTo(spineTop.x + ox, spineTop.y + oy);
      ctx.lineTo(spineBot.x + ox * 0.78, spineBot.y + oy * 0.78);
      ctx.stroke();
    }
  }

  // Collar + yoke.
  ctx.strokeStyle = style.trim;
  ctx.lineWidth = 0.016 * u;
  ctx.beginPath();
  ctx.moveTo(P.neck.x - 0.045 * u, P.neck.y + 0.008 * u);
  ctx.lineTo(P.neck.x, P.neck.y + 0.05 * u);
  ctx.lineTo(P.neck.x + 0.045 * u, P.neck.y + 0.008 * u);
  ctx.stroke();

  // Wordmark + number on the chest.
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

  if (style.sport === 'baseball') {
    ctx.strokeStyle = shade(style.trim, -0.15);
    ctx.lineWidth = 0.018 * u;
    ctx.beginPath();
    ctx.moveTo(P.hF.x - 0.02 * u, P.hF.y - 0.005 * u);
    ctx.lineTo(P.hN.x + 0.02 * u, P.hN.y - 0.005 * u);
    ctx.stroke();
  }
  ctx.restore();

  // Far shoulder pad sits over the jersey (the near one is drawn after the
  // near arm so the pad caps the deltoid, welding arm and torso together).
  if (style.sport === 'football') {
    shoulderPad(ctx, P.sF, P.neck, u, far(shade(style.jersey, -0.08)), 1.05);
  }

  // Pants yoke: the hips belong to the pants. One shape over both hip
  // joints welds the legs into the body instead of pinning them on.
  {
    const hipDx = P.hN.x - P.hF.x, hipDy = P.hN.y - P.hF.y;
    const hipLen = Math.hypot(hipDx, hipDy) || 1;
    ctx.save();
    ctx.translate(P.pelvis.x, P.pelvis.y + 0.012 * u);
    ctx.rotate(Math.atan2(hipDy, hipDx));
    const yokeRx = hipLen / 2 + legW * 0.6;
    const yokeRy = 0.078 * u;
    const yg = ctx.createLinearGradient(0, -yokeRy, 0, yokeRy);
    yg.addColorStop(0, shade(style.pants, 0.08));
    yg.addColorStop(0.6, style.pants);
    yg.addColorStop(1, shade(style.pants, -0.14));
    ctx.beginPath();
    ctx.ellipse(0, 0, yokeRx, yokeRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = yg;
    ctx.fill();
    // Belt.
    ctx.beginPath();
    ctx.ellipse(0, -yokeRy * 0.62, yokeRx * 0.94, yokeRy * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(style.trim, -0.2);
    ctx.fill();
    ctx.restore();
  }

  // --- NEAR leg ---
  volume(ctx, P.hN, P.kN, legW * 1.06, SPINDLE, style.pants, 0.05, light);
  volume(ctx, P.kN, P.aN, calfW * 1.05, BELLY, style.pants, -0.05, light);
  jointShadow(ctx, P.kN, calfW * 0.9, 0.15);
  if (style.sport === 'baseball') {
    const mid = { x: (P.kN.x + P.aN.x) / 2, y: (P.kN.y + P.aN.y) / 2 };
    volume(ctx, mid, P.aN, calfW * 0.92, TAPER_IN, style.jersey, 0, light);
    const quarter = { x: (mid.x + P.kN.x) / 2, y: (mid.y + P.kN.y) / 2 };
    volume(ctx, quarter, mid, calfW * 0.96, FLATW, style.trim);
  }
  drawCleat(ctx, P.aN.x, P.aN.y, P.tN.x, P.tN.y, calfW * 1.15, '#2b2b31', style.trim);
  if (style.sport === 'football') {
    drawKneePad(ctx, P.kN.x, P.kN.y, legW * 0.86,
      Math.atan2(P.aN.y - P.hN.y, P.aN.x - P.hN.x) + Math.PI / 2,
      shade(style.pants, -0.06));
  }

  // --- Head + headgear ---
  const headR = 0.055 * u;
  const dir = pose.motion.x >= 0 ? 1 : -1;
  if (style.sport === 'football') {
    // Seated slightly low so the shell overlaps the neck — no bare gap.
    drawFootballHelmet(
      ctx, P.head.x, P.head.y + 0.012 * u, headR, dir,
      style.jersey, style.trim, style.skin, style.visor,
    );
  } else {
    ctx.beginPath();
    ctx.ellipse(P.head.x, P.head.y, headR * 0.9, headR * 0.98, 0, 0, Math.PI * 2);
    const hg = ctx.createRadialGradient(
      P.head.x + dir * headR * 0.35, P.head.y - headR * 0.2, headR * 0.1,
      P.head.x, P.head.y, headR * 1.2,
    );
    hg.addColorStop(0, shade(style.skin, 0.08));
    hg.addColorStop(0.6, style.skin);
    hg.addColorStop(1, shade(style.skin, -0.16));
    ctx.fillStyle = hg;
    ctx.fill();
    // Jawline shadow so the head has a front and a side.
    ctx.beginPath();
    ctx.ellipse(P.head.x - dir * headR * 0.42, P.head.y + headR * 0.16,
      headR * 0.5, headR * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(shade(style.skin, -0.3), 0.35);
    ctx.fill();
    if (pose.prop?.kind === 'bat') {
      drawBattingHelmet(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim, style.skin);
    } else {
      drawCap(ctx, P.head.x, P.head.y, headR, dir, style.jersey, style.trim);
    }
    drawFace(ctx, P.head.x + dir * headR * 0.12, P.head.y + headR * 0.12, headR * 0.85, dir, style.skin);
  }

  // --- NEAR arm, over everything ---
  volume(ctx, P.sN, P.eN, armW * 1.06, TAPER_IN, style.jersey, 0.07, light);
  // Deltoid grows the arm out of the torso; the pad then caps the seam.
  // Skipped when the arm is raised — the deltoid folds INTO the shoulder
  // there, and a cap would read as a pasted-on blob.
  const armRaised = P.eN.y < P.sN.y - 0.015 * u;
  if (!armRaised) {
    deltoidCap(ctx, P.sN, P.eN, u * (style.sport === 'football' ? 1 : 0.82), shade(style.jersey, 0.03), light);
  }
  if (style.sport === 'football') {
    shoulderPad(ctx, P.sN, P.neck, u, shade(style.jersey, 0.05), 1.2);
  }
  // Sleeve cuff: a trim ring ACROSS the arm, not a blob on it.
  const armAngle = Math.atan2(P.eN.y - P.sN.y, P.eN.x - P.sN.x);
  drawBand(
    ctx,
    P.sN.x + (P.eN.x - P.sN.x) * 0.52, P.sN.y + (P.eN.y - P.sN.y) * 0.52,
    armW * 0.98, armAngle + Math.PI / 2, style.trim,
  );
  volume(ctx, P.eN, P.wN, foreW * 1.02, BELLY, style.skin, -0.06, light);
  jointShadow(ctx, P.eN, foreW * 0.8, 0.14);
  const nearArmAngle = Math.atan2(P.wN.y - P.eN.y, P.wN.x - P.eN.x);
  drawBand(
    ctx,
    P.wN.x - Math.cos(nearArmAngle) * foreW * 0.85,
    P.wN.y - Math.sin(nearArmAngle) * foreW * 0.85,
    foreW * 1.05, nearArmAngle + Math.PI / 2, '#f0ede4',
  );
  if (style.sport === 'football') {
    drawGlove(ctx, P.wN.x, P.wN.y, foreW * 1.25, nearArmAngle,
      shade(style.jersey, -0.14), style.trim);
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
        const bg = ctx.createLinearGradient(0, -rh, 0, rh);
        bg.addColorStop(0, '#8a4a26');
        bg.addColorStop(0.5, '#6b3a1f');
        bg.addColorStop(1, '#4a2715');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = withAlpha('#3d2113', 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
        // Laces: a spine with cross-stitches, not a bare line.
        ctx.strokeStyle = '#f0ede4';
        ctx.lineWidth = rh * 0.1;
        ctx.beginPath();
        ctx.moveTo(-rw * 0.4, -rh * 0.35);
        ctx.lineTo(rw * 0.4, -rh * 0.35);
        ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * rw * 0.16, -rh * 0.52);
          ctx.lineTo(i * rw * 0.16, -rh * 0.18);
          ctx.stroke();
        }
        // Sheen along the top panel.
        ctx.beginPath();
        ctx.ellipse(0, rh * 0.28, rw * 0.62, rh * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha('#ffffff', 0.12);
        ctx.fill();
        break;
      }
      case 'baseball': {
        const r = 0.026 * u;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        const sg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.3);
        sg.addColorStop(0, '#ffffff');
        sg.addColorStop(0.7, '#f3f1e8');
        sg.addColorStop(1, '#cfccc0');
        ctx.fillStyle = sg;
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
        // Handle.
        ctx.strokeStyle = '#a3763c';
        ctx.lineWidth = 0.024 * u;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bl * 0.35, 0);
        ctx.stroke();
        // Knob.
        ctx.beginPath();
        ctx.arc(-0.004 * u, 0, 0.018 * u, 0, Math.PI * 2);
        ctx.fillStyle = '#8a6232';
        ctx.fill();
        // Barrel with a wood-grain gradient along its length.
        const wg = ctx.createLinearGradient(bl * 0.35, -0.02 * u, bl, 0.02 * u);
        wg.addColorStop(0, '#c89a58');
        wg.addColorStop(0.5, '#b98a4a');
        wg.addColorStop(1, '#95692f');
        ctx.strokeStyle = wg;
        ctx.lineWidth = 0.042 * u;
        ctx.beginPath();
        ctx.moveTo(bl * 0.35, 0);
        ctx.lineTo(bl, 0);
        ctx.stroke();
        // Barrel sheen.
        ctx.strokeStyle = withAlpha('#ffffff', 0.3);
        ctx.lineWidth = 0.008 * u;
        ctx.beginPath();
        ctx.moveTo(bl * 0.45, -0.012 * u);
        ctx.lineTo(bl * 0.95, -0.012 * u);
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
 * Full figure layer with painted lighting + rim light, rendered offscreen
 * and blitted with a cutout drop shadow. Motion streaks and a ground
 * contact shadow go behind the figure.
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

  // Global light wash composited into the silhouette — unifies every part
  // under one key light without flattening the per-limb shading.
  ctx.globalCompositeOperation = 'source-atop';
  const mx = pose.motion.x, my = pose.motion.y;
  const len = Math.hypot(mx, my) || 1;
  const lx = -mx / len, ly = -my / len; // light from opposite the motion
  const cx = w / 2, cy = h / 2, r = Math.max(w, h) * 0.62;
  const shadeGrad = ctx.createLinearGradient(cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
  shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,20,0.26)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Ground contact shadow: anchors the figure to the card instead of
  // letting it float. Sits under the lowest foot.
  const footXs = [pose.ankleNear, pose.toeNear, pose.ankleFar, pose.toeFar];
  const lowY = Math.max(...footXs.map(p => p.y));
  const midX = (pose.ankleNear.x + pose.ankleFar.x) / 2;
  const gx = x + midX * w, gy = y + (lowY + 0.012) * h;
  const grx = w * 0.2, gry = h * 0.022;
  const ground = target.createRadialGradient(gx, gy, 0, gx, gy, grx);
  ground.addColorStop(0, 'rgba(4, 4, 12, 0.4)');
  ground.addColorStop(0.7, 'rgba(4, 4, 12, 0.16)');
  ground.addColorStop(1, 'rgba(4, 4, 12, 0)');
  target.save();
  target.translate(gx, gy);
  target.scale(1, gry / grx);
  target.translate(-gx, -gy);
  target.fillStyle = ground;
  target.beginPath();
  target.arc(gx, gy, grx, 0, Math.PI * 2);
  target.fill();
  target.restore();

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
  rctx.drawImage(off, lx * w * 0.012, ly * h * 0.012);

  // Die-cut keyline. Premium inserts photoshop a white sticker outline
  // around the cutout — it separates the figure from any background — but
  // drawn heavy it reads as a toy. A slim keyline plus a tight dark contour
  // keeps the cutout crisp and lets the painted figure carry the card.
  const keyline = (radius: number, color: string): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = off.width;
    c.height = off.height;
    const kctx = c.getContext('2d')!;
    // 9 dilation samples, not 16 — at a 2-4px radius the difference is
    // invisible and this loop is the hottest part of the whole figure pass
    // (each sample redraws the full figure canvas).
    for (let a = 0; a < 9; a++) {
      const ang = (a / 9) * Math.PI * 2;
      kctx.drawImage(off, Math.cos(ang) * radius, Math.sin(ang) * radius);
    }
    kctx.globalCompositeOperation = 'source-in';
    kctx.fillStyle = color;
    kctx.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const kr = Math.max(1.5, w * 0.0045);
  const outline = keyline(kr * 1.8, 'rgba(14,14,22,0.6)');
  const sticker = keyline(kr, '#f7f5ef');

  // Blit: shadow → dark edge → white sticker → figure → rim.
  target.save();
  target.shadowColor = 'rgba(0,0,0,0.5)';
  target.shadowBlur = Math.max(8, w * 0.035);
  target.shadowOffsetX = w * 0.012 * (mx >= 0 ? -1 : 1);
  target.shadowOffsetY = h * 0.018;
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
