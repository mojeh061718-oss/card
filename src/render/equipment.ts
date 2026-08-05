/**
 * Equipment — drawn with real geometry, not suggestion.
 *
 * The single biggest tell between "programmer art" and a card that reads as
 * a card is whether the gear is actually constructed: a facemask with real
 * bars, a chinstrap that attaches somewhere, knee pads that sit on the knee.
 * Every helper here draws in local coordinates around an anchor point so
 * callers can place and rotate them freely.
 */

import { shade, withAlpha } from './color';

/**
 * Football helmet. `dir` is the facing direction (+1 right, -1 left).
 *
 * Construction order matters and mirrors how the object actually reads:
 * shell behind → face in the opening → jaw shadow → facemask in front.
 * That avoids destination-out compositing, which would punch through
 * whatever the figure is standing on.
 */
export function drawFootballHelmet(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, dir: number,
  shell: string, trim: string, skin: string,
): void {
  const dark = shade(shell, -0.16);
  const light = shade(shell, 0.12);

  // --- Shell: crown + back, tilted slightly toward the face ---
  ctx.beginPath();
  ctx.ellipse(cx - dir * r * 0.08, cy - r * 0.08, r * 1.26, r * 1.2, dir * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = shell;
  ctx.fill();

  // Shell shading: lit from above-front, dark at the back.
  const g = ctx.createLinearGradient(
    cx + dir * r, cy - r, cx - dir * r * 1.2, cy + r,
  );
  g.addColorStop(0, withAlpha(light, 0.55));
  g.addColorStop(0.45, withAlpha('#ffffff', 0));
  g.addColorStop(1, withAlpha('#000010', 0.32));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx - dir * r * 0.08, cy - r * 0.08, r * 1.26, r * 1.2, dir * 0.08, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);

  // Center stripe running front-to-back over the crown.
  ctx.strokeStyle = trim;
  ctx.lineWidth = r * 0.26;
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 1.1, cy - r * 0.42);
  ctx.quadraticCurveTo(cx, cy - r * 1.34, cx - dir * r * 1.05, cy - r * 0.34);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(shade(trim, -0.22), 0.8);
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 1.1, cy - r * 0.55);
  ctx.quadraticCurveTo(cx, cy - r * 1.47, cx - dir * r * 1.05, cy - r * 0.47);
  ctx.stroke();
  ctx.restore();

  // --- Face in the opening ---
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.56, cy + r * 0.26, r * 0.66, r * 0.7, dir * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = shade(skin, 0.04);
  ctx.fill();
  // Light bouncing into the opening keeps the face from going muddy against
  // a dark shell — without it the helmet reads as an empty hole.
  const faceLit = ctx.createRadialGradient(
    cx + dir * r * 0.78, cy + r * 0.18, r * 0.06,
    cx + dir * r * 0.5, cy + r * 0.3, r * 0.8,
  );
  faceLit.addColorStop(0, withAlpha('#ffffff', 0.34));
  faceLit.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = faceLit;
  ctx.fill();
  // Brow shadow from the shell overhang — light touch.
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.5, cy - r * 0.2, r * 0.6, r * 0.22, dir * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('#2a1a10', 0.18);
  ctx.fill();
  // Eyes + brow so there is a face to find.
  ctx.fillStyle = withAlpha('#1b1008', 0.8);
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.74, cy + r * 0.1, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.34, cy + r * 0.14, r * 0.09, r * 0.065, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Chinstrap: cups the jaw, anchors at the earhole ---
  ctx.strokeStyle = '#e6e3da';
  ctx.lineWidth = r * 0.11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dir * r * 0.42, cy + r * 0.34);
  ctx.quadraticCurveTo(
    cx + dir * r * 0.42, cy + r * 1.12,
    cx + dir * r * 0.98, cy + r * 0.62,
  );
  ctx.stroke();

  // --- Facemask: three horizontals + a center vertical, in front ---
  ctx.strokeStyle = '#cfd4dc';
  ctx.lineWidth = r * 0.085;
  ctx.lineJoin = 'round';
  const maskFront = cx + dir * r * 1.16;
  const maskBack = cx + dir * r * 0.08;
  for (const [yOff, bow] of [[0.34, 0.07], [0.74, 0.08]] as const) {
    ctx.beginPath();
    ctx.moveTo(maskFront, cy + r * (yOff - 0.08));
    ctx.quadraticCurveTo(
      (maskFront + maskBack) / 2, cy + r * (yOff + bow),
      maskBack, cy + r * (yOff + 0.04),
    );
    ctx.stroke();
  }
  // Vertical bar down the nose bridge.
  ctx.beginPath();
  ctx.moveTo(cx + dir * r * 1.12, cy + r * 0.1);
  ctx.lineTo(cx + dir * r * 1.06, cy + r * 0.86);
  ctx.stroke();
  // Mask highlight so the cage reads metallic.
  ctx.strokeStyle = withAlpha('#ffffff', 0.55);
  ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  ctx.moveTo(maskFront, cy + r * 0.3);
  ctx.quadraticCurveTo((maskFront + maskBack) / 2, cy + r * 0.4, maskBack, cy + r * 0.36);
  ctx.stroke();

  // --- Earhole with a rim ---
  ctx.beginPath();
  ctx.arc(cx - dir * r * 0.46, cy + r * 0.16, r * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.strokeStyle = withAlpha('#000010', 0.45);
  ctx.lineWidth = r * 0.05;
  ctx.stroke();

  // Shell specular pop.
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * r * 0.18, cy - r * 0.74, r * 0.42, r * 0.16, dir * 0.5, 0, Math.PI * 2,
  );
  ctx.fillStyle = withAlpha('#ffffff', 0.3);
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

  // Dome.
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.16, r * 1.12, r * 1.02, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + r * 1.12, cy + r * 0.1);
  ctx.lineTo(cx - r * 1.12, cy + r * 0.1);
  ctx.closePath();
  ctx.fillStyle = shell;
  ctx.fill();

  // Ear flap over the front-facing ear.
  ctx.beginPath();
  ctx.ellipse(cx + dir * r * 0.62, cy + r * 0.2, r * 0.42, r * 0.52, dir * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = shade(shell, -0.06);
  ctx.fill();

  // Brim.
  ctx.beginPath();
  ctx.ellipse(
    cx + dir * r * 0.92, cy - r * 0.3, r * 0.78, r * 0.2, dir * 0.2, 0, Math.PI * 2,
  );
  ctx.fillStyle = shade(shell, -0.14);
  ctx.fill();

  // Gloss arc + trim button.
  ctx.beginPath();
  ctx.ellipse(cx - dir * r * 0.1, cy - r * 0.72, r * 0.5, r * 0.16, dir * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha('#ffffff', 0.28);
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
  ctx.fillStyle = shell;
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
  // Mitt.
  ctx.beginPath();
  ctx.roundRect(-size * 0.56, -size * 0.28, size * 1.12, size * 1.0, size * 0.34);
  ctx.fillStyle = body;
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
  ctx.fillStyle = '#8a5a2b';
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

  // Upper.
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
  ctx.fillStyle = upper;
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
  ctx.fillStyle = color;
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
