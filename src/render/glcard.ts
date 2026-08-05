/**
 * WebGL2 foil compositor — one shared context for the whole app.
 *
 * Input: the rasterized `print` and `foilMask` layers plus tilt (gyro or
 * touch) and time. Output: the living card — ink over animated foil board.
 * All finish variants live in one uber-shader keyed by uFinish so the whole
 * rainbow costs a single program.
 */

import { finishId } from './dna';
import type { FoilFinish } from '../engine/cards/parallels';
import { hexToRgb } from './color';

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrint;
uniform sampler2D uFoil;
uniform int uFinish;
uniform vec2 uTilt;      // -1..1 device tilt / touch parallax
uniform float uTime;
uniform vec3 uTint;      // parallel color tint (1,1,1 = spectral)
uniform float uAspect;   // h/w of the card

// --- helpers ---------------------------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p), hash21(p + 17.17));
}
// Iridescent spectral palette (cosine palette).
vec3 spectral(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}
// Voronoi: returns (edgeDist, cellId)
vec3 voronoi(vec2 p) {
  vec2 g = floor(p), f = fract(p);
  float md = 8.0; vec2 mc = vec2(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = hash22(g + o);
    float d = length(o + c - f);
    if (d < md) { md = d; mc = g + o + c; }
  }
  return vec3(md, mc);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * (hash21(floor(p)) * 0.5 +
              hash21(floor(p) + 1.0) * 0.5);
    p = p * 2.03 + 11.3;
    a *= 0.5;
  }
  return v;
}
// Smooth value noise for superfractor swirl.
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec4 print = texture(uPrint, vUv);
  float mask = texture(uFoil, vUv).r;
  vec2 uv = vec2(vUv.x, vUv.y * uAspect);
  vec2 tilt = uTilt;
  float view = tilt.x * 1.4 + tilt.y * 0.9; // scalar view angle proxy

  vec3 foil = vec3(0.0);
  float gloss = 0.0;

  if (uFinish == 0) {
    // Plain stock: just a soft sheen band if the mask allows.
    gloss = 0.5;
  } else if (uFinish == 1) {
    // Refractor: smooth diagonal rainbow sweeping with tilt.
    float t = dot(uv, normalize(vec2(0.8, 0.6))) * 1.2 + view * 0.9;
    foil = spectral(t);
    gloss = 1.0;
  } else if (uFinish == 2) {
    // Prism: geometric facets, each cell catches a different hue.
    vec3 v = voronoi(uv * 7.0);
    float t = hash21(v.yz) + view * 1.3;
    foil = spectral(t) * (0.75 + 0.25 * smoothstep(0.05, 0.2, v.x));
    gloss = 1.0;
  } else if (uFinish == 3) {
    // Cracked ice: shard edges blaze, interiors shift subtly.
    vec3 v = voronoi(uv * 9.0);
    float edge = 1.0 - smoothstep(0.0, 0.09, v.x);
    float t = hash21(v.yz) * 0.35 + view;
    foil = spectral(t) * (0.35 + 0.65 * edge) + vec3(edge * 0.5);
    gloss = 1.0;
  } else if (uFinish == 4) {
    // Wave: flowing interference bands.
    float t = sin((uv.y + sin(uv.x * 6.0 + view * 2.0) * 0.15) * 14.0) * 0.5 + view;
    foil = spectral(t * 0.35 + uv.x * 0.3);
    gloss = 1.0;
  } else if (uFinish == 5) {
    // Pulsar: radial starburst from center.
    vec2 c = uv - vec2(0.5, 0.5 * uAspect);
    float ang = atan(c.y, c.x);
    float t = ang * 3.82 + view * 1.5; // ~24 spokes
    foil = spectral(fract(t) * 0.6 + length(c) * 0.4);
    gloss = 1.0;
  } else if (uFinish == 6) {
    // Mojo: bold vertical streak refractor.
    float streak = fract(uv.x * 9.0 + sin(uv.y * 3.0) * 0.12);
    foil = spectral(streak * 0.4 + view + uv.y * 0.15);
    foil *= 0.7 + 0.6 * pow(abs(sin(uv.x * 28.0)), 3.0);
    gloss = 1.0;
  } else if (uFinish == 7) {
    // Disco: dense glitter — dots pop on/off with tilt.
    vec2 g = floor(uv * 90.0);
    float sparkle = step(0.93, fract(hash21(g) + view * 2.0 + uTime * 0.05));
    float t = hash21(g + 5.0) + view;
    foil = spectral(t) * 0.45 + vec3(sparkle) * 1.2;
    gloss = 1.0;
  } else if (uFinish == 8) {
    // Shimmer: fine anisotropic brushed foil.
    float band = vnoise(vec2(uv.x * 3.0, uv.y * 60.0));
    foil = spectral(band * 0.25 + view + 0.1) * (0.6 + 0.4 * band);
    gloss = 1.0;
  } else if (uFinish == 9) {
    // Superfractor: huge swirling plates of gold-dominant foil.
    vec2 p = uv * 3.0;
    float sw = vnoise(p + vnoise(p * 1.7 + view) * 1.8 + view * 0.8);
    float t = sw * 0.85 + view * 0.5;
    foil = spectral(t) * 0.55 + vec3(1.0, 0.82, 0.35) * (0.45 + 0.4 * sw);
    gloss = 1.4;
  }

  // Parallel color tint pulls the spectral field toward the rung color.
  foil = mix(foil, foil * uTint * 1.6, step(0.001, distance(uTint, vec3(1.0))) * 0.65);

  // Specular sweep — the glare band that travels as you tilt.
  vec2 sweepDir = normalize(vec2(0.6, 1.0));
  float sweepPos = dot(uv, sweepDir) - 0.5 * (1.0 + uAspect) - (tilt.x + tilt.y) * 0.55;
  float sweep = exp(-sweepPos * sweepPos * 40.0);
  vec3 glossCol = vec3(1.0) * sweep * gloss * 0.5;

  // Composite: ink over foil board. Real chromium reads ink-first — the
  // rainbow lives in the lighter print areas and dark ink blocks it, so foil
  // strength is gated by print luminance. Superfractor burns hotter.
  float luma = dot(print.rgb, vec3(0.299, 0.587, 0.114));
  float inkGate = 0.30 + 0.70 * smoothstep(0.04, 0.5, luma);
  float strength = uFinish == 9 ? 0.62 : 0.52;
  float foilAmt = mask * strength * inkGate * (uFinish == 0 ? 0.0 : 1.0);
  vec3 base = print.rgb;
  vec3 screened = 1.0 - (1.0 - base) * (1.0 - foil * foilAmt);
  // Slight saturation lift where foil is active so color pops, then gloss.
  vec3 col = mix(base, screened, 0.85) + glossCol * max(mask, 0.12) * (0.4 + 0.6 * inkGate);

  outColor = vec4(col, print.a);
}`;

export interface CardGL {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  draw(opts: {
    print: TexImageSource;
    foilMask: TexImageSource;
    finish: FoilFinish;
    tintHex: string | null;
    tiltX: number;
    tiltY: number;
    timeSec: number;
    aspect: number; // h/w
  }): void;
  /** Re-upload layer textures only when the card changes. */
  setLayers(print: TexImageSource, foilMask: TexImageSource): void;
  /**
   * Draw using the caller's already-set gl.viewport instead of the full
   * canvas, and without clearing. Lets one fixed-size context serve stills
   * at many sizes — resizing a WebGL canvas leaks on iOS Safari.
   */
  drawInViewport(opts: Parameters<CardGL['draw']>[0]): void;
  /** True while the GPU context is gone; draws are no-ops until restored. */
  isLost(): boolean;
  destroy(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

/**
 * Build a card compositor bound to `canvas`.
 *
 * iOS Safari drops the WebGL context whenever the app is backgrounded, so
 * every GPU object here is rebuilt from scratch on `webglcontextrestored`.
 * Between loss and restore, draws are no-ops rather than throws — the card
 * simply holds its last painted frame until the GPU comes back.
 */
export function createCardGL(canvas: HTMLCanvasElement): CardGL {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  interface GpuState {
    prog: WebGLProgram;
    quad: WebGLBuffer;
    printTex: WebGLTexture;
    foilTex: WebGLTexture;
    u: Record<string, WebGLUniformLocation | null>;
  }
  let gpu: GpuState | null = null;
  let lost = false;

  let layersDirty = true;
  let pendingPrint: TexImageSource | null = null;
  let pendingFoil: TexImageSource | null = null;

  function makeTex(unit: number): WebGLTexture {
    const tex = gl!.createTexture()!;
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return tex;
  }

  function buildGpu(): GpuState {
    const prog = gl!.createProgram()!;
    gl!.attachShader(prog, compile(gl!, gl!.VERTEX_SHADER, VERT));
    gl!.attachShader(prog, compile(gl!, gl!.FRAGMENT_SHADER, FRAG));
    gl!.linkProgram(prog);
    if (!gl!.getProgramParameter(prog, gl!.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl!.getProgramInfoLog(prog)}`);
    }
    gl!.useProgram(prog);

    const quad = gl!.createBuffer()!;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl!.STATIC_DRAW);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);

    const u = {
      print: gl!.getUniformLocation(prog, 'uPrint'),
      foil: gl!.getUniformLocation(prog, 'uFoil'),
      finish: gl!.getUniformLocation(prog, 'uFinish'),
      tilt: gl!.getUniformLocation(prog, 'uTilt'),
      time: gl!.getUniformLocation(prog, 'uTime'),
      tint: gl!.getUniformLocation(prog, 'uTint'),
      aspect: gl!.getUniformLocation(prog, 'uAspect'),
    };
    gl!.uniform1i(u.print, 0);
    gl!.uniform1i(u.foil, 1);

    return { prog, quad, printTex: makeTex(0), foilTex: makeTex(1), u };
  }

  gpu = buildGpu();

  // preventDefault on loss is what makes the browser fire a restore at all.
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    gpu = null;
  };
  const onRestored = () => {
    gpu = buildGpu();
    lost = false;
    // Textures died with the context; re-upload on the next draw.
    layersDirty = true;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function upload(unit: number, tex: WebGLTexture, src: TexImageSource): void {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, src);
  }

  return {
    canvas,
    gl,
    setLayers(print, foilMask) {
      pendingPrint = print;
      pendingFoil = foilMask;
      layersDirty = true;
    },
    isLost() {
      return lost || gl.isContextLost();
    },
    draw(opts) {
      if (lost || !gpu) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawInViewport(opts);
    },
    drawInViewport({ print, foilMask, finish, tintHex, tiltX, tiltY, timeSec, aspect }) {
      if (lost || !gpu) return;
      const { u, printTex, foilTex } = gpu;
      if (layersDirty || pendingPrint !== print) {
        upload(0, printTex, print);
        upload(1, foilTex, foilMask);
        pendingPrint = print;
        pendingFoil = foilMask;
        layersDirty = false;
      }
      void pendingFoil;
      gl.uniform1i(u.finish, finishId(finish));
      gl.uniform2f(u.tilt, tiltX, tiltY);
      gl.uniform1f(u.time, timeSec);
      const tint = tintHex ? hexToRgb(tintHex) : [1, 1, 1];
      gl.uniform3f(u.tint, tint[0], tint[1], tint[2]);
      gl.uniform1f(u.aspect, aspect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (gpu) {
        gl.deleteTexture(gpu.printTex);
        gl.deleteTexture(gpu.foilTex);
        gl.deleteBuffer(gpu.quad);
        gl.deleteProgram(gpu.prog);
        gpu = null;
      }
      // Release the context NOW rather than at GC — browsers cap live WebGL
      // contexts (~16, fewer on iOS) and evict the oldest, which is how the
      // shared snapshot context gets killed under LiveCard churn.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
