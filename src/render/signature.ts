/**
 * Deterministic autograph synthesis.
 *
 * A player's signature is generated once from their signatureSeed and is
 * identical on every card they ever sign. Construction mimics how real
 * signatures read: a large entry flourish on each initial, decaying into
 * fast connected scrawl, with optional underline and jersey-number tag.
 * Strokes are variable-width Béziers so ink looks like ink, not a font.
 */

import { Rng } from '../engine/rng';

export type InkKind = 'blueSharpie' | 'blackSharpie' | 'silverPaint' | 'goldPaint';

export const INK_COLORS: Record<InkKind, string> = {
  blueSharpie: '#1a3fae',
  blackSharpie: '#181820',
  silverPaint: '#c8cdd6',
  goldPaint: '#d4af37',
};

interface Stroke {
  pts: { x: number; y: number }[];
  width: number;
}

export interface SignatureStyle {
  strokes: Stroke[];
  /** 0..1 — how bold/full vs lazy the signature is. Affects value. */
  quality: number;
  hasUnderline: boolean;
  hasJerseyTag: boolean;
}

/** Build signature geometry in a normalized 1×0.4 box. */
export function buildSignature(
  signatureSeed: bigint, first: string, last: string, jersey: number,
): SignatureStyle {
  const rng = new Rng(signatureSeed);
  const quality = 0.35 + rng.float() * 0.65;
  const strokes: Stroke[] = [];
  const slant = (rng.float() - 0.3) * 0.35; // rightward lean bias
  let cursor = 0.04;

  const letterCount = (word: string) =>
    Math.max(2, Math.round(word.length * (0.35 + quality * 0.5)));

  for (const [wi, word] of [first, last].entries()) {
    if (word.length === 0) continue;
    const n = letterCount(word);
    const wrng = new Rng(signatureSeed ^ BigInt(wi + 1));
    // Entry flourish for the initial: a tall loop.
    const initH = 0.30 + wrng.float() * 0.1;
    const baseY = 0.26 + wrng.float() * 0.05;
    const loopW = 0.06 + wrng.float() * 0.05;
    const pts: { x: number; y: number }[] = [];
    pts.push({ x: cursor, y: baseY + 0.06 });
    pts.push({ x: cursor + loopW * 0.4, y: baseY - initH });
    pts.push({ x: cursor + loopW, y: baseY - initH * (0.55 + wrng.float() * 0.3) });
    pts.push({ x: cursor + loopW * 0.7, y: baseY });
    cursor += loopW + 0.015;
    // Scrawl body: connected bumps shrinking in amplitude — lazier
    // signatures degrade into a flat line faster.
    for (let i = 0; i < n; i++) {
      const decay = Math.pow(1 - i / n, quality * 1.4);
      const amp = 0.085 * decay * (0.5 + wrng.float() * 0.8);
      const step = 0.018 + wrng.float() * 0.02 * (2 - quality);
      pts.push({
        x: cursor + step * 0.5 + slant * amp,
        y: baseY - amp + (wrng.float() - 0.5) * 0.02,
      });
      pts.push({
        x: cursor + step,
        y: baseY + amp * 0.3 + (wrng.float() - 0.5) * 0.02,
      });
      cursor += step;
    }
    strokes.push({ pts, width: 0.012 + quality * 0.006 });
    cursor += 0.05 + rng.float() * 0.03;
  }

  const hasUnderline = rng.chance(0.45);
  if (hasUnderline) {
    const y = 0.36;
    strokes.push({
      pts: [
        { x: 0.08, y: y + 0.01 },
        { x: cursor * 0.55, y: y - 0.02 },
        { x: Math.min(0.95, cursor), y },
      ],
      width: 0.01,
    });
  }
  const hasJerseyTag = rng.chance(0.3);
  if (hasJerseyTag) {
    // Small "#NN" squiggle after the name.
    const x0 = Math.min(0.88, cursor + 0.01);
    const digits = String(jersey);
    let dx = x0;
    for (const d of digits) {
      const drng = new Rng(signatureSeed ^ BigInt(100 + d.charCodeAt(0)));
      strokes.push({
        pts: [
          { x: dx, y: 0.3 },
          { x: dx + 0.012, y: 0.24 + drng.float() * 0.03 },
          { x: dx + 0.024, y: 0.3 },
          { x: dx + 0.012, y: 0.34 },
        ],
        width: 0.008,
      });
      dx += 0.03;
    }
  }
  return { strokes, quality, hasUnderline, hasJerseyTag };
}

/**
 * Render a signature into a rect. `onSticker` draws the clear label panel
 * behind it (sticker autos are visibly different from on-card ink).
 */
export function drawSignature(
  ctx: CanvasRenderingContext2D,
  sig: SignatureStyle,
  ink: InkKind,
  x: number, y: number, w: number, h: number,
  onSticker: boolean,
): void {
  if (onSticker) {
    ctx.save();
    ctx.fillStyle = 'rgba(250, 250, 246, 0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    const r = h * 0.12;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = INK_COLORS[ink];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (ink === 'silverPaint' || ink === 'goldPaint') {
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = 1.5;
  } else if (!onSticker) {
    // On-card ink sits under gloss: slightly soft, slightly absorbed.
    ctx.globalAlpha = 0.92;
  }
  const sx = (nx: number) => x + nx * w;
  const sy = (ny: number) => y + (ny / 0.4) * h;
  for (const stroke of sig.strokes) {
    const pts = stroke.pts;
    if (pts.length < 2) continue;
    // Variable width: taper in and out by splitting into segments.
    for (let i = 0; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1);
      const taper = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15));
      ctx.lineWidth = Math.max(0.8, stroke.width * w * taper);
      ctx.beginPath();
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1];
      const m1x = (p0.x + p1.x) / 2, m1y = (p0.y + p1.y) / 2;
      const m2x = (p1.x + p2.x) / 2, m2y = (p1.y + p2.y) / 2;
      ctx.moveTo(sx(m1x), sy(m1y));
      ctx.quadraticCurveTo(sx(p1.x), sy(p1.y), sx(m2x), sy(m2y));
      ctx.stroke();
    }
  }
  ctx.restore();
}
