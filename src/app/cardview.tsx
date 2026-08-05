/**
 * Shared card presentation helpers: still snapshots through a module-scoped
 * scratch GL context (one context, reused for every snapshot in the app) and
 * a LiveCard component that animates foil under rAF + pointer/gyro tilt.
 */

import { useEffect, useRef } from 'react';
import { renderCardLayers, type CardRenderSpec } from '../render/layers';
import { createCardGL, type CardGL } from '../render/glcard';

let scratchGL: CardGL | null = null;

/** Render a card to a data-URL still at the given width. */
export function snapshotCard(spec: CardRenderSpec, widthPx = 600, tiltX = 0.18, tiltY = -0.08): string {
  const layers = renderCardLayers(spec, widthPx);
  if (!scratchGL) {
    const c = document.createElement('canvas');
    scratchGL = createCardGL(c);
  }
  const gl = scratchGL;
  gl.canvas.width = layers.widthPx;
  gl.canvas.height = layers.heightPx;
  gl.setLayers(layers.print, layers.foilMask);
  gl.draw({
    print: layers.print, foilMask: layers.foilMask,
    finish: spec.parallel.finish, tintHex: spec.parallel.colorHex,
    tiltX, tiltY, timeSec: 0,
    aspect: layers.heightPx / layers.widthPx,
  });
  return gl.canvas.toDataURL('image/png');
}

/** Live animated card — owns a private GL context while mounted. */
export function LiveCard({ spec, width, className }: {
  spec: CardRenderSpec; width: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tilt = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const layers = renderCardLayers(spec, Math.min(900, width * dpr));
    canvas.width = layers.widthPx;
    canvas.height = layers.heightPx;
    const gl = createCardGL(canvas);
    gl.setLayers(layers.print, layers.foilMask);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const auto = tilt.current.active ? 0 : 1;
      gl.draw({
        print: layers.print, foilMask: layers.foilMask,
        finish: spec.parallel.finish, tintHex: spec.parallel.colorHex,
        tiltX: tilt.current.x + auto * Math.sin(t * 0.8) * 0.4,
        tiltY: tilt.current.y + auto * Math.cos(t * 0.6) * 0.25,
        timeSec: t,
        aspect: layers.heightPx / layers.widthPx,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.current = {
        x: Math.max(-1, Math.min(1, e.gamma / 28)),
        y: Math.max(-1, Math.min(1, (e.beta - 45) / 28)),
        active: true,
      };
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tilt.current = {
        x: ((e.clientX - r.left) / r.width - 0.5) * 2,
        y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        active: true,
      };
    };
    const onUp = () => { tilt.current.active = false; };
    window.addEventListener('deviceorientation', onOrient);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      gl.destroy();
      window.removeEventListener('deviceorientation', onOrient);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [spec, width]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, touchAction: 'none', borderRadius: width * 0.04 }}
    />
  );
}
