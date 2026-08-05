/**
 * Equipment — drawn with real geometry, not suggestion.
 *
 * The single biggest tell between "programmer art" and a card that reads as
 * a card is whether the gear is actually constructed: a facemask with real
 * bars, a chinstrap that attaches somewhere, knee pads that sit on the knee.
 * Every helper here draws in local coordinates around an anchor point so
 * callers can place and rotate them freely.
 */

import { shade, withAlpha, mixHex } from './color';

/**
 * A face that reads as a face at 40px and at 400px: brow shadow, almond
 * eyes with a glint, a nose plane, and a mouth line — no emoji dots.
 * `dir` is facing (+1 right, -1 left); r is the head radius scale.
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, dir: number, skin: string,
  opts: { eyeBlack?: boolean; intensity?: number } = {},
): void {
  const dark = shade(skin, -0.28);

  // Brow ridge shadow — one soft bar, sets the eye line.
  ctx.fillStyle = withAlpha(dark, 0.32);
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.1, cy - r * 0.14, r * 0.52, r * 0.13, dir * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Eye black smudges under the eyes (game-day war paint).
  if (opts.eyeBlack) {
    ctx.fillStyle = 'rgba(16, 12, 12, 0.75)';
    for (const ex of [0.42, -0.02]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * r * ex, cy + r * 0.22, r * 0.14, r * 0.05, dir * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Almond eyes: dark lid line + iris + glint. Far eye slightly smaller.
  for (const [ex, s] of [[0.4, 1], [-0.03, 0.85]] as const) {
    const eyeX = cx + dir * r * ex, eyeY = cy + r * 0.02;
    ctx.fillStyle = 'rgba(20, 12, 8, 0.9)';
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, r * 0.11 * s, r * 0.052 * s, dir * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(eyeX + dir * r * 0.03, eyeY - r * 0.015, r * 0.018 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose: a shadow plane on the off-light side, not an outline.
  ctx.fillStyle = withAlpha(dark, 0.3);
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 0.5, cy + r * 0.02);
  ctx.quadraticCurveTo(cx + dir * r * 0.62, cy + r * 0.3, cx + dir * r * 0.46, cy + r * 0.36);
  ctx.quadraticCurveTo(cx + dir * r * 0.5, cy + r * 0.2, cx + dir * r * 0.42, cy + r * 0.08);
  ctx.closePath();
  ctx.fill();

  // Mouth: set line with a hint of a lower-lip shadow. Game face.
  ctx.strokeStyle = withAlpha(dark, 0.6);
  ctx.lineWidth = r * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 0.2, cy + r * 0.55);
  ctx.quadraticCurveTo(cx + dir * r * 0.4, cy + r * 0.6, cx + dir * r * 0.56, cy + r * 0.54);
  ctx.stroke();

  // Cheekbone catch-light keeps the face volumetric.
  ctx.fillStyle = withAlpha('#ffffff', 0.14 * (opts.intensity ?? 1));
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.5, cy + r * 0.3, r * 0.14, r * 0.2, dir * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Football helmet. `dir` is the facing direction (+1 right, -1 left).
 *
 * Construction order matters and mirrors how the object actually reads:
 * shell behind → face (or visor) in the opening → jaw shadow → facemask in
 * front. That avoids destination-out compositing, which would punch through
 * whatever the figure is standing on.
 */
export function drawFootballHelmet(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, dir: number,
  shell: string, trim: string, skin: string,
  visor = false,
): void {
  const dark = shade(shell, -0.16);
  const light = shade(shell, 0.12);

  // --- Shell: ONE closed silhouette a football fan would recognize —
  // rounded crown, brow ledge over the face opening, jaw guard sweeping to
  // the chin, back edge cut in toward the neck. Not stacked ellipses.
  const D = dir;
  const shellPath = () => {
    ctx.beginPath();
    // Back-bottom, behind the ear — kept high so the shell doesn't grow a
    // pointed tail off the back of the neck.
    ctx.moveTo(cx - D * r * 0.92, cy + r * 0.38);
    // Up the back of the shell and over the crown.
    ctx.bezierCurveTo(
      cx - D * r * 1.28, cy - r * 0.28,
      cx - D * r * 0.85, cy - r * 1.25,
      cx + D * r * 0.1, cy - r * 1.18,
    );
    // Down the forehead to the brow ledge.
    ctx.bezierCurveTo(
      cx + D * r * 0.75, cy - r * 1.1,
      cx + D * r * 1.12, cy - r * 0.6,
      cx + D * r * 1.1, cy - r * 0.18,
    );
    // Face opening: the front edge steps IN — this notch is what makes it
    // read as a helmet instead of a ball.
    ctx.quadraticCurveTo(cx + D * r * 0.98, cy - r * 0.02, cx + D * r * 0.92, cy + r * 0.24);
    // Jaw guard out and down to the chin.
    ctx.bezierCurveTo(
      cx + D * r * 0.88, cy + r * 0.66,
      cx + D * r * 0.52, cy + r * 0.94,
      cx + D * r * 0.05, cy + r * 0.96,
    );
    // Bottom edge back toward the neck.
    ctx.quadraticCurveTo(cx - D * r * 0.62, cy + r * 0.88, cx - D * r * 0.92, cy + r * 0.38);
    ctx.closePath();
  };
  shellPath();
  ctx.fillStyle = shell;
  ctx.fill();

  // Shell shading: a hot rim toward the light, deep falloff at the back.
  ctx.save();
  shellPath();
  ctx.clip();
  const g = ctx.createRadialGradient(
    cx + dir * r * 0.7, cy - r * 0.75, r * 0.1,
    cx - dir * r * 0.15, cy, r * 1.9,
  );
  g.addColorStop(0, withAlpha(light, 0.75));
  g.addColorStop(0.4, withAlpha('#ffffff', 0));
  g.addColorStop(1, withAlpha('#000010', 0.42));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);

  // Center stripe running front-to-back over the crown.
  ctx.strokeStyle = trim;
  ctx.lineWidth = r * 0.24;
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 1.06, cy - r * 0.44);
  ctx.quadraticCurveTo(cx, cy - r * 1.3, cx - dir * r * 1.0, cy - r * 0.36);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(shade(trim, -0.22), 0.8);
  ctx.lineWidth = r * 0.045;
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 1.06, cy - r * 0.57);
  ctx.quadraticCurveTo(cx, cy - r * 1.43, cx - dir * r * 1.0, cy - r * 0.49);
  ctx.stroke();

  // Vent slots along the crown — modern shells all carry them.
  ctx.fillStyle = withAlpha('#000010', 0.4);
  for (const [vx, vy, va] of [[-0.32, -0.78, 0.5], [-0.58, -0.6, 0.75], [0.14, -0.86, 0.25]] as const) {
    ctx.save();
    ctx.translate(cx + dir * r * vx, cy + r * vy);
    ctx.rotate(dir * va);
    ctx.beginPath();
    ctx.roundRect(-r * 0.11, -r * 0.028, r * 0.22, r * 0.056, r * 0.028);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // --- Face (or visor) in the opening ---
  const faceCx = cx + dir * r * 0.56, faceCy = cy + r * 0.2;
  ctx.beginPath();
  ctx.ellipse(faceCx, faceCy, r * 0.55, r * 0.6, dir * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = shade(skin, 0.04);
  ctx.fill();
  if (visor) {
    // Mirrored visor: dark smoke base with a diagonal sky reflection.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(faceCx, faceCy - r * 0.06, r * 0.64, r * 0.52, dir * 0.1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#101018';
    ctx.fillRect(faceCx - r, faceCy - r, r * 2, r * 2);
    const vg = ctx.createLinearGradient(
      faceCx - r * 0.5, faceCy - r * 0.5, faceCx + r * 0.5, faceCy + r * 0.4,
    );
    vg.addColorStop(0, withAlpha(mixHex(trim, '#8fd0ff', 0.6), 0.75));
    vg.addColorStop(0.45, withAlpha('#ffffff', 0.12));
    vg.addColorStop(0.55, withAlpha('#ffffff', 0));
    vg.addColorStop(1, withAlpha(mixHex(shell, '#2a2a55', 0.5), 0.5));
    ctx.fillStyle = vg;
    ctx.fillRect(faceCx - r, faceCy - r, r * 2, r * 2);
    // Hard reflection streak.
    ctx.strokeStyle = withAlpha('#ffffff', 0.55);
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(faceCx - dir * r * 0.4, faceCy - r * 0.26);
    ctx.quadraticCurveTo(faceCx, faceCy - r * 0.05, faceCx + dir * r * 0.42, faceCy + r * 0.05);
    ctx.stroke();
    ctx.restore();
    // Chin exposed under the visor.
    ctx.beginPath();
    ctx.ellipse(faceCx + dir * r * 0.05, faceCy + r * 0.5, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(skin, -0.02);
    ctx.fill();
  } else {
    // Light bouncing into the opening keeps the face from going muddy
    // against a dark shell — without it the helmet reads as an empty hole.
    const faceLit = ctx.createRadialGradient(
      faceCx + dir * r * 0.24, faceCy - r * 0.06, r * 0.06,
      faceCx, faceCy + r * 0.06, r * 0.8,
    );
    faceLit.addColorStop(0, withAlpha('#ffffff', 0.3));
    faceLit.addColorStop(1, withAlpha('#ffffff', 0));
    ctx.beginPath();
    ctx.ellipse(faceCx, faceCy, r * 0.62, r * 0.68, dir * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = faceLit;
    ctx.fill();
    // Brow shadow from the shell overhang.
    ctx.beginPath();
    ctx.ellipse(cx + dir * r * 0.5, cy - r * 0.22, r * 0.58, r * 0.2, dir * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha('#2a1a10', 0.22);
    ctx.fill();
    drawFace(ctx, faceCx, faceCy - r * 0.06, r * 0.55, dir, skin, { eyeBlack: true });
  }

  // Jaw-guard seam: a shadow line where the chin bar meets the shell (the
  // white strap is gone — the integrated jaw guard covers the chin now).
  ctx.strokeStyle = withAlpha('#000010', 0.3);
  ctx.lineWidth = r * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dir * r * 0.35, cy + r * 0.62);
  ctx.quadraticCurveTo(
    cx + dir * r * 0.3, cy + r * 0.82,
    cx + dir * r * 0.8, cy + r * 0.55,
  );
  ctx.stroke();

  // --- Facemask: metallic cage that visibly JUTS FORWARD of the brow, the
  // single most recognizable trait of the silhouette.
  const maskFront = cx + dir * r * 1.34;
  const maskBack = cx + dir * r * 0.3;
  const barGrad = ctx.createLinearGradient(cx, cy, cx, cy + r);
  barGrad.addColorStop(0, '#e8ecf2');
  barGrad.addColorStop(0.5, '#aeb6c2');
  barGrad.addColorStop(1, '#7e8694');
  ctx.strokeStyle = barGrad;
  ctx.lineWidth = r * 0.085;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Top bar anchors at the brow ledge and runs out past the face.
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 0.95, cy - r * 0.12);
  ctx.lineTo(maskFront, cy - r * 0.06);
  ctx.stroke();
  for (const [yOff, bow] of [[0.24, 0.05], [0.52, 0.07], [0.8, 0.08]] as const) {
    ctx.beginPath();
    ctx.moveTo(maskFront - dir * r * 0.02, cy + r * (yOff - 0.1));
    ctx.quadraticCurveTo(
      (maskFront + maskBack) / 2, cy + r * (yOff + bow),
      maskBack, cy + r * (yOff + 0.04),
    );
    ctx.stroke();
  }
  // Verticals: front cage bar + cheek bar tying into the jaw guard.
  for (const [x0, x1] of [[1.32, 1.22], [0.86, 0.78]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * r * x0, cy - r * 0.08);
    ctx.lineTo(cx + dir * r * x1, cy + r * 0.84);
    ctx.stroke();
  }
  // Mask highlight so the cage reads metallic.
  ctx.strokeStyle = withAlpha('#ffffff', 0.6);
  ctx.lineWidth = r * 0.03;
  ctx.beginPath();
  ctx.moveTo(maskFront, cy + r * 0.16);
  ctx.quadraticCurveTo((maskFront + maskBack) / 2, cy + r * 0.24, maskBack, cy + r * 0.22);
  ctx.stroke();

  // --- Earhole with a rim ---
  ctx.beginPath();
  ctx.arc(cx - dir * r * 0.32, cy + r * 0.24, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.strokeStyle = withAlpha('#000010', 0.45);
  ctx.lineWidth = r * 0.045;
  ctx.stroke();

  // Shell specular pop.
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * r * 0.16, cy - r * 0.78, r * 0.42, r * 0.15, dir * 0.42, 0, Math.PI * 2,
  );
  ctx.fillStyle = withAlpha('#ffffff', 0.35);
  ctx.fill();
}

/** Baseball batting helmet — ear flap on the facing side. */
export function drawBattingHelmet(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, dir: number,
  shell: string, trim: string, skin: string,
): void {
  // Face first.
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.16, cy + r * 0.14, r * 0.78, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();

  // Dome with a gloss gradient — batting lids are shiny plastic.
  const domePath = () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.16, r * 1.12, r * 1.02, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(cx + r * 1.12, cy + r * 0.1);
    ctx.lineTo(cx - r * 1.12, cy + r * 0.1);
    ctx.closePath();
  };
  domePath();
  const dg = ctx.createLinearGradient(cx - r, cy - r * 1.2, cx + r * 0.6, cy + r * 0.2);
  dg.addColorStop(0, shade(shell, 0.14));
  dg.addColorStop(0.5, shell);
  dg.addColorStop(1, shade(shell, -0.18));
  ctx.fillStyle = dg;
  ctx.fill();

  // Ear flap over the front-facing ear.
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.62, cy + r * 0.2, r * 0.42, r * 0.52, dir * 0.18, 0, Math.PI * 2);
  const fg = ctx.createLinearGradient(cx, cy - r * 0.3, cx, cy + r * 0.7);
  fg.addColorStop(0, shade(shell, 0.02));
  fg.addColorStop(1, shade(shell, -0.16));
  ctx.fillStyle = fg;
  ctx.fill();

  // Brim.
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * r * 0.92, cy - r * 0.3, r * 0.78, r * 0.2, dir * 0.2, 0, Math.PI * 2,
  );
  ctx.fillStyle = shade(shell, -0.14);
  ctx.fill();
  // Brim underside catch-light.
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * r * 0.98, cy - r * 0.24, r * 0.62, r * 0.09, dir * 0.2, 0, Math.PI * 2,
  );
  ctx.fillStyle = withAlpha('#ffffff', 0.16);
  ctx.fill();

  // Gloss arc + trim button.
  ctx.beginPath();
  ctx.ellipse(cx - dir * r * 0.1, cy - r * 0.72, r * 0.5, r * 0.16, dir * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('#ffffff', 0.34);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 1.06, r * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = trim;
  ctx.fill();
}

/** Ball cap for fielders. */
export function drawCap(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, dir: number,
  shell: string, trim: string,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.2, r * 1.04, r * 0.96, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  const cg = ctx.createLinearGradient(cx - r, cy - r * 1.1, cx + r * 0.7, cy);
  cg.addColorStop(0, shade(shell, 0.1));
  cg.addColorStop(0.55, shell);
  cg.addColorStop(1, shade(shell, -0.14));
  ctx.fillStyle = cg;
  ctx.fill();
  // Brim.
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.86, cy - r * 0.4, r * 0.74, r * 0.2, dir * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = shade(shell, -0.1);
  ctx.fill();
  // Panel seam + button.
  ctx.strokeStyle = withAlpha(shade(shell, -0.24), 0.85);
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.12);
  ctx.quadraticCurveTo(cx + dir * r * 0.34, cy - r * 0.76, cx + dir * r * 0.44, cy - r * 0.34);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 1.14, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = trim;
  ctx.fill();
}

/** Receiver/lineman glove: cuff band plus a mitt with finger seams. */
export function drawGlove(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, angle: number,
  body: string, cuff: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Cuff strap at the wrist.
  ctx.beginPath();
  ctx.roundRect(-size * 0.52, -size * 0.62, size * 1.04, size * 0.42, size * 0.12);
  ctx.fillStyle = cuff;
  ctx.fill();
  // Mitt with a knuckle-side highlight.
  ctx.beginPath();
  ctx.roundRect(-size * 0.56, -size * 0.28, size * 1.12, size * 1.0, size * 0.34);
  const mg = ctx.createLinearGradient(0, -size * 0.28, 0, size * 0.72);
  mg.addColorStop(0, shade(body, 0.1));
  mg.addColorStop(0.5, body);
  mg.addColorStop(1, shade(body, -0.16));
  ctx.fillStyle = mg;
  ctx.fill();
  // Finger seams.
  ctx.strokeStyle = withAlpha(shade(body, -0.28), 0.75);
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  for (const fx of [-0.2, 0.1, 0.38]) {
    ctx.beginPath();
    ctx.moveTo(size * fx, -size * 0.12);
    ctx.lineTo(size * fx, size * 0.6);
    ctx.stroke();
  }
  // Palm highlight.
  ctx.beginPath();
  ctx.ellipse(-size * 0.12, size * 0.18, size * 0.26, size * 0.4, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('#ffffff', 0.14);
  ctx.fill();
  ctx.restore();
}

/** Fielder's mitt — webbed, much larger than a batting glove. */
export function drawMitt(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, angle: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 1.05, size * 1.2, 0, 0, Math.PI * 2);
  const lg = ctx.createLinearGradient(-size, -size, size, size);
  lg.addColorStop(0, '#a06a35');
  lg.addColorStop(0.5, '#8a5a2b');
  lg.addColorStop(1, '#6e4520');
  ctx.fillStyle = lg;
  ctx.fill();
  // Thumb + web wedge.
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 1.1);
  ctx.quadraticCurveTo(size * 0.9, -size * 1.05, size * 0.72, -size * 0.1);
  ctx.quadraticCurveTo(size * 0.3, -size * 0.5, -size * 0.2, -size * 1.1);
  ctx.closePath();
  ctx.fillStyle = '#9c6a35';
  ctx.fill();
  // Lacing.
  ctx.strokeStyle = '#e8d9b8';
  ctx.lineWidth = size * 0.09;
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(size * (0.1 + i * 0.16), -size * 0.86);
    ctx.lineTo(size * (0.22 + i * 0.16), -size * 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha('#5e3c1c', 0.6);
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.18, size * 0.66, size * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Cleat: wedge upper, sole plate, studs. `dir` points the toe. */
export function drawCleat(
  ctx: CanvasRenderingContext2D,
  ankleX: number, ankleY: number, toeX: number, toeY: number,
  size: number, upper: string, accent: string,
): void {
  const dx = toeX - ankleX, dy = toeY - ankleY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const w = size * 0.52;

  // Upper, shaded top-to-sole so the shoe has a lit crown.
  ctx.beginPath();
  ctx.moveTo(ankleX + nx * w, ankleY + ny * w);
  ctx.quadraticCurveTo(
    ankleX + ux * len * 0.55 + nx * w * 1.05,
    ankleY + uy * len * 0.55 + ny * w * 1.05,
    toeX + nx * w * 0.5, toeY + ny * w * 0.5,
  );
  ctx.lineTo(toeX - nx * w * 0.62, toeY - ny * w * 0.62);
  ctx.lineTo(ankleX - nx * w, ankleY - ny * w);
  ctx.closePath();
  const ug = ctx.createLinearGradient(
    ankleX + nx * w, ankleY + ny * w, ankleX - nx * w, ankleY - ny * w,
  );
  ug.addColorStop(0, shade(upper, 0.12));
  ug.addColorStop(0.55, upper);
  ug.addColorStop(1, shade(upper, -0.1));
  ctx.fillStyle = ug;
  ctx.fill();

  // Swoosh-ish accent stripe along the side.
  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.17;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ankleX + ux * len * 0.2 - nx * w * 0.1, ankleY + uy * len * 0.2 - ny * w * 0.1);
  ctx.quadraticCurveTo(
    ankleX + ux * len * 0.62, ankleY + uy * len * 0.62,
    toeX - ux * len * 0.1 + nx * w * 0.2, toeY - uy * len * 0.1 + ny * w * 0.2,
  );
  ctx.stroke();

  // Sole plate.
  ctx.strokeStyle = '#f0eee6';
  ctx.lineWidth = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(ankleX - nx * w * 0.92, ankleY - ny * w * 0.92);
  ctx.lineTo(toeX - nx * w * 0.58, toeY - ny * w * 0.58);
  ctx.stroke();
  // Studs.
  ctx.fillStyle = '#d8d5cb';
  for (const t of [0.25, 0.6, 0.9]) {
    ctx.beginPath();
    ctx.arc(
      ankleX + ux * len * t - nx * w * 1.05,
      ankleY + uy * len * t - ny * w * 1.05,
      size * 0.09, 0, Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Knee pad sitting on a joint, oriented along the limb. */
export function drawKneePad(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, angle: number, color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-size * 0.5, -size * 0.42, size, size * 0.84, size * 0.3);
  const g = ctx.createLinearGradient(0, -size * 0.42, 0, size * 0.42);
  g.addColorStop(0, shade(color, 0.08));
  g.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = withAlpha(shade(color, -0.3), 0.55);
  ctx.lineWidth = size * 0.05;
  ctx.stroke();
  // Quilting.
  ctx.strokeStyle = withAlpha(shade(color, -0.24), 0.5);
  ctx.lineWidth = size * 0.045;
  for (const oy of [-0.14, 0.14]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.34, size * oy);
    ctx.lineTo(size * 0.34, size * oy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Wristband / arm sleeve band. */
export function drawBand(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, angle: number, color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-size * 0.5, -size * 0.3, size, size * 0.6, size * 0.16);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
