# Cardboard

A sports card treasure-hunting career game. Name a shop, set a bankroll, and
buy / rip / dig / grade / trade your way toward the cards everybody wants.

Built as an offline-first PWA for iPhone 16 Pro.

```bash
npm install
npm run dev          # play at localhost:5173
npm test             # 47 engine tests
npm run build
node tools/e2e.mjs   # full loop + frame timing + memory, headless
```

---

## The idea that everything hangs off

**Nothing is a loot table. The print run is real.**

A series declares an actual population — say 4,000,000 base cards, 19,800
Green /99s, and 200 Superfractors — and every pack pull anywhere in the world
draws from that finite pool *without replacement*. This one decision buys:

- **True serial numbers.** Only one `#1/99` exists, ever.
- **Population reports that mean something.** "3 of 200 have surfaced."
- **A Top 50 that answers the real question:** has anyone found it yet?
- **Emergent scarcity** as sets age and supply gets consumed.

Implemented without materializing millions of rows: a Fenwick tree over
remaining counts gives O(log n) weighted draw-and-decrement, and a keyed
Feistel permutation issues unique serials with zero stored state.

**Everything else is a seed.** One world seed derives leagues → teams →
players → series → design DNA → each card's artwork. Cards store ~40 bytes;
the art regenerates identically forever. That's what makes a vast card
universe fit inside iOS's storage limits.

---

## What's in it

**Ripping.** Procedurally designed foil wrappers, drag-to-tear with a jagged
tear path, card-back flips with a heat glow bleeding through. The escalation
is *honest* — the cue is a true function of the card underneath, so we're not
manufacturing constant fake near-misses. Hit a 1/1 and the app takes over.

**The hunt.** Unsearched shoeboxes, garage-sale boxes, estate collections,
storage units. The hidden variable is `pickedOver` — most boxes have had
their hits pulled, and you cannot tell from outside. Hold to rip through the
pile at ~14 cards/sec; the reel stops itself on anything worth a second look.

**Grading.** Condition is generated *with the card*, not rolled at grade time:
centering, per-corner wear, per-edge chipping, scratches, print lines. The
loupe lets you find the defect before you pay, because the defect was always
in the cardboard. Four houses with real personalities, weakest-link rollup —
which is how a legendary pull comes back a 9, honestly.

**Economy.** You never see intrinsic value; you see comps. Rare cards have
almost no comps, which is exactly when an auction is a gamble worth taking.
Auctions settle just above the *second*-highest willingness-to-pay, producing
both the two-whales bidding war that blows past comp and the dead-quiet
no-sale at reserve.

**The wire and the Top 50.** Procedural hobby journalism generated from real
events, and a board of the fifty most-wanted cards showing how many copies
have actually surfaced.

---

## Art pipeline

Cards are drawn, not shipped. Each series gets its own Design DNA — layout
archetype, pattern engine, palette, type pairing, foil behavior — so 2031
Chromium genuinely doesn't look like 2029 Chromium.

- **Athletes** are articulated figures: pose keyframes as joint angles, drawn
  as tapered limbs over a solid torso, cel-shaded with a rim light and a dark
  contour keyline, with jersey wordmarks, numbers, pinstripes, and equipment.
- **Foil** is one WebGL2 uber-shader covering nine finishes (refractor, prism,
  cracked ice, wave, pulsar, mojo, disco, shimmer, superfractor), driven by
  gyroscope or touch tilt. It's ink-gated by print luminance so the artwork
  stays dominant, the way a real chromium card reads.
- **Autographs** are generated per player as variable-width Bézier strokes —
  entry flourish decaying into scrawl — with a contrast halo so they read on
  any background. On-card vs. sticker autos are visibly different, as in the
  real hobby.
- **Defects render.** Off-center print exposes card stock, corners fray, edges
  chip, roller lines cross the surface. The loupe is a genuine visual test.

---

## iOS constraints this is built around

Researched up front; they shaped the architecture more than anything else.

| Constraint | What we do |
|---|---|
| Total canvas memory ≈ **256MB**, hard crash past it | One fixed-size scratch context for every still in the app. Measured at ~14MB in the e2e run. |
| Resizing a WebGL canvas **leaks GPU memory** ([WebKit 219780](https://bugs.webkit.org/show_bug.cgi?id=219780)) | The scratch canvas is allocated once and never resized; smaller cards render into a viewport corner and get copied out through a 2D canvas. |
| Context is **lost when Safari backgrounds** | `webglcontextlost` is `preventDefault`ed and every GPU object rebuilds on restore. Verified in the e2e run. |
| `requestAnimationFrame` is **capped at 60fps** | Designed for a locked 60. Measured p95 ≈ 16.8ms during pack rip and binder scroll. |
| IndexedDB quota is modest, and Safari evicts | Never store pixels. Cards are ~40-byte records; `navigator.storage.persist()` is requested at boot. |
| Vibration API has **never existed**, and the `<input switch>` haptic trick was **patched in iOS 26.5** | Haptics are feature-detected, try/caught, and never load-bearing. Audio and visuals carry every moment. |
| PWA push **cannot play a sound** | Nothing is gated on waiting; the calendar advances when you end a day. |

---

## Layout

```
src/
  engine/          pure TS, zero DOM, fully unit-testable
    rng.ts feistel.ts
    world/         names, teams, players
    cards/         series, parallels, populations, packs
    condition/     defects, press profiles, grading
    economy/       valuation, comps, auctions, lots
    news/          wire generators, Top 50
  render/          color (OKLCH), dna, athlete, signature, layers, glcard, slab, pack
  app/             screens, cardview, feel (audio + haptics)
  state/           world singleton + persisted collection
tools/             screenshot harnesses, icon generator, e2e run
```

## Verification

`npm test` covers the correctness spine: serial uniqueness across an entire
exhausted population, population conservation, draw-frequency fidelity,
save/restore round-trips, grading determinism and strictness ordering,
auction bounds, and a **calibration suite** that pins the economy's shape to
hobby intuition (commons under $2, star rookies in the tens, /99s in the
hundreds, a superfractor rookie auto above $50K).

`node tools/e2e.mjs` drives the real loop headlessly at iPhone 16 Pro
resolution — new career → rip → dig → grade → slab → auction → wire → reload
— while measuring frame timing, graphics memory, and context-loss recovery.

The `tools/*-shots.mjs` harnesses capture each screen at device resolution;
card art was iterated against those screenshots rather than shipped unexamined.
