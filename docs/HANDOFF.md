# Cardboard — handoff

**Read-only reference.** This file and everything else in `docs/` is
documentation. It is not imported by the game, not part of the build, and not
covered by tests. Nothing in `src/`, `test/`, `tools/` or `presets/` depends on
it. Change the document freely; changing the game is a separate decision.

Written 2026-08-05, against commit `200a6c8` on `claude/sports-card-game-h5aiya`.

---

## 1. What this is

A sports card memorabilia treasure-hunting career game. You name a small
shop, start with an adjustable bankroll, and buy / rip / dig / grade / auction
your way toward the world's most sought-after cards. Two sports, football and
baseball. Everything is fictional and procedurally generated.

Target device: **one** device — iPhone 16 Pro (402×874pt @3x = 1206×2622px),
installed as a home-screen PWA, offline, no server. There is no desktop
layout and no responsive breakpoint story. If you widen the viewport, things
will look wrong; that is by design, not a bug to fix.

~9,500 lines of TypeScript across 42 files. 99 unit tests, 22 end-to-end
checks, all passing at time of writing.

### Running it

```bash
npm install
npm run dev                  # vite dev server
npm test                     # 99 vitest unit tests, ~3s
npx tsc --noEmit             # typecheck (strict, noUnusedLocals)
npx vite build               # required before any tools/ script
node tools/e2e.mjs           # 22 checks, ~2 min, needs a fresh build
node tools/make-presets.mjs  # regenerate presets/
```

Every `tools/*.mjs` script serves `dist/`, so **build first or you are testing
stale code**. Chromium is preinstalled at `/opt/pw-browsers/chromium`; the
scripts already point at it with swiftshader flags. Do not run
`playwright install`.

Useful URL flags: `?lab` opens the dev card gallery and bypasses career setup,
`?focus=N` in the lab isolates one card, `?seed-collection=N` rips N packs
into a fresh save for UI work.

---

## 2. The one idea everything hangs off

```
worldSeed → leagues → teams → players → series → design DNA → card art
```

Every derivation is a pure function of a seed (PCG32 + SplitMix64 mixer, in
`src/engine/rng.ts`). A card's artwork is `f(cardDefId, parallelId, serial)`,
identical forever. **No pixels are ever stored.** A saved card is ~40 bytes:
`seriesId`, `cardIndex`, `parallelId`, `serial`, plus grade if slabbed.

This is not a stylistic preference. It is what makes a vast card universe fit
inside iOS's storage quota, and it is why the game can regenerate a 200,000
card collection from a save measured in kilobytes.

### Invariants you must not break

1. **Never store rendered art.** Not in IndexedDB, not in the save record.
   Caches in memory are fine and must be invalidated (see §6.1).
2. **Nothing is keyed by name.** Populations, serials, saved cards, comps and
   Top 50 entries reference `playerId` / `teamId`. This is what makes the name
   editor safe. If you add a system, key it by id.
3. **Populations are finite and drawn without replacement.** Packs, world
   rips and lot digs all pull from the same `Population` per series. Adding a
   source of cards that does not consume the population breaks scarcity, the
   Top 50 board, and every "N surfaced" number in the game.
4. **Serial numbers come from `FeistelPermutation`**, never a counter. It is a
   balanced 4-round Feistel with cycle-walking, which guarantees every
   `#n/N` is issued exactly once with zero stored state. Test:
   `engine-core.test.ts` exhausts a full population and asserts uniqueness.
5. **One WebGL2 context for the whole app.** Never a canvas per card. iOS
   hard-crashes past ~256MB of canvas memory.

---

## 3. Map of the code

```
src/engine/          pure TS, zero DOM, fully unit-testable
  rng.ts             PCG32, mix64, childSeed, seedFromText
  feistel.ts         unique serials with no stored state
  world/teams.ts     generateLeague — 32 football / 30 baseball, 28 players each
  world/names.ts     curated name/city/nickname pools
  cards/series.ts    checklists, PRODUCTS, openPack/openBox, INSERT_SETS
  cards/parallels.ts the parallel ladder (base → … → 1/1)
  cards/population.ts Fenwick tree, O(log n) draw-without-replacement
  cards/worldRips.ts  the rest of the hobby opening wax each day
  condition/         press profiles, defects, error cards, grading
  economy/           valuation, comps, English auctions, dig lots
  news/              wire story generators, Top 50 board
src/render/          canvas + WebGL2
  layers.ts          the big one — card layout, 9 pattern painters, Downtown
  athlete.ts         6 poses, built from real biomechanics
  anatomy.ts         muscle-volume limbs (width profiles), torso on spine axis
  equipment.ts       helmets, mitts, gloves, cleats, pads — drawn precisely
  glcard.ts          the single WebGL2 context, foil uber-shader, loss recovery
  dna.ts             per-series design language derivation
src/app/             React screens (HUNT WAX BOOK GRADE SELL WIRE EDIT LAB)
src/state/           world singleton + zustand collection + IndexedDB
presets/             importable real-league name files (NOT bundled into play)
tools/               screenshot harnesses + e2e
test/                99 vitest tests
```

### The two state owners

- `src/state/world.ts` — the `world` singleton. Definitions rebuild identically
  on every boot from `WORLD_SEED`; only population draw state is persisted.
- `src/state/collection.ts` — zustand store, debounced 400ms into IndexedDB
  under key `save-v1`. `endDay()` is the heartbeat: settles auctions, runs
  world rips, generates news, returns graded slabs.

---

## 4. What is NOT built

This is the honest gap list, ranked by how much it costs the game. The
original plan had 12 phases; phases 0–11 all shipped something, but several
shipped a slice rather than the whole system.

### 4.1 Blocking the core promise

> **Update (2026-08-05, `claude/graphics-upgrade-debug-bujemt`):** the first
> two gaps below are now BUILT. A career sim (`engine/world/career.ts`)
> gives every player a deterministic form curve (momentum noise, career
> arc, seeded breakouts/injuries/slumps) driving a hype multiplier in
> `world.valuation`; hype is exactly 1.0 for everyone on day 1 so the
> calibration pins still describe the opening market. A release calendar
> (`engine/cards/calendar.ts`) ships a new series every ~45 days,
> alternating sports, with shelf lifecycle (`SHELF_LIFE_DAYS`) and
> street-date wire stories; the launch pair is pinned so old saves keep
> their series ids. Both are covered by `test/calendar-career.test.ts`.

**No era progression.** The plan called for the whole aesthetic evolving
across in-game decades (overproduction → premium → hyper-parallel). The
release calendar now exists to hang it on (`releaseAt` picks a ladder
archetype per release), but eras do not yet bias that pick or the DNA.

### 4.2 Whole systems from the plan that never landed

| Missing | Where it would go |
|---|---|
| Relics / patch cards | `series.ts` card kinds + a `layers.ts` window painter with woven-fabric shading |
| Card shows on the calendar | new screen; dealer tables with mispriced inventory, haggling |
| Counterfeits, trimmed cards, authentication | `condition/`, plus a risk surface in MarketScreen |
| NPC trade offers with counters | `economy/`; the agent archetypes already exist in `auction.ts` |
| Consignment to an auction house | `economy/auction.ts`; higher fee, reaches whales |
| Fixed-price listings | only quick-sell and auction exist today |
| Estate sales / storage unit blind bidding | `economy/lots.ts` has the lot model; needs the bidding flow |
| Shop upgrades, reputation, overhead, credit line, employee, vault | nothing exists; `cash` is the only business variable |
| Finite storage space forcing you to sell | nothing; you can hold infinite cards |
| Set / master-set completion tracking | BinderScreen has filters but no completion model |
| Printing plates (4 per card, each a 1/1) | `parallels.ts` ladder |
| Crack-and-resubmit | `GradingScreen`; grading is one-way today |
| Pop reports per (card, grade) | wire mentions them; no data model |
| ~~Save export / import~~ | **BUILT** — full save backup/restore from the EDIT tab (`exportSaveJson`/`importSaveJson`) |
| Push notifications | deliberately deferred; flavor only, nothing depends on them |

### 4.3 Content depth

- **Two insert sets.** `INSERT_SETS`: `Downtown` (/199, 20 cards, painted
  skyline) and `Ignition` (/149, 12 cards, comic detonation). The pattern
  for adding more is the `drawIgnition` branch in `layers.ts`.
- **Four ladder archetypes now rotate via the release calendar**
  (`chromium`, `prizmatic`, `premium`, `heritage`).
- **Ten athlete poses** (five per sport). A binder page still shows some
  repetition, but figures are now painted (cylinder-shaded volumes, lit
  helmets with optional mirrored visors, real faces) rather than flat.
- **No card backs.** `condition.ts` has a `wrongBack` error kind explicitly
  marked "flavor; back render later" — the error can occur and is unrenderable.
- **Name pools** are 72 first / 70 last names, so surname collisions are
  common in a ~900-player league.

---

## 5. Calibration that must not drift

These numbers were measured, argued about, and pinned by tests. If you change
economy or odds code and these move, you have changed the game's feel — decide
that deliberately, don't discover it later.

**Grading gem rates** (`test/grading-odds.test.ts`): 1/1 → 96%, /5 → 94%,
/25 → 89%, /99 → 66%, /299 → 26%, base → 2%. The 1/1 number is intentional:
the user asked that 1/1s "always basically be a 10" because they're cared for,
so `careFactor(printRun)` in `condition.ts` scales *every* flaw tolerance down
to 0.04 at a print run of 1.

Grading is a mystery but never random. `flawPressure()` reads real centering,
corner, edge and surface values off the card, and `mishapChance()` turns that
into the odds of the grader ruining an otherwise perfect card. An off-center
card genuinely is more likely to disappoint. Do not replace this with a roll.

**Findability** (measured, not pinned): pulling *any* 1/1 is ~1 in 12 cases.
Pulling *the* specific star-rookie 1/1 is ~1 in 2,183 cases (~$12.6M of wax).
That second number is why `worldRips.ts` exists — the rest of the hobby opens
wax too, so grails surface elsewhere, hit the wire, and become buyable. A 35%
reserve fraction means a third of every print run stays sealed forever.

**Wax is honestly −EV** on both median and mean, pinned by
`test/wax-ev.test.ts`. Retail $21, hobby pack $26, hobby box $540, case
$7,600. If you expand the checklist or league size, box EV moves and this test
will fail — that is the test doing its job, not a flaky test. Reprice, don't
loosen the assertion.

**Marketplace fee** 0.12. **Auctions** are English and settle just above the
second-highest willingness-to-pay, which is what produces the
two-whales-bidding-war outcome.

**Performance** (from `tools/e2e.mjs`): p95 frame time 16.8ms during pack rip
and binder scroll, against a 16.7ms 60fps budget. Graphics memory 14.3MB
against the 256MB iOS ceiling. See §6.3.

---

## 6. Known problems and sharp edges

### 6.1 Art caches go stale on a rename — fixed once, easy to reintroduce

`BinderScreen.tsx` caches thumbnails and slabs in module-level `Map`s keyed by
card identity. Card identity survives a rename, but the *art* bakes in player
names, team names, team colors and badges. Importing a name preset used to
leave every card in the binder showing the old world.

Fixed by `world.namesRevision` + `world.onNamesChanged(fn)`; BinderScreen
registers a listener that clears both caches. **Any new cache of rendered card
output must do the same.** Pinned by the e2e check
`renaming invalidates cached card art`, which compares a thumbnail data URL
before and after an import.

### 6.2 Frame time is at the edge, not under it

p95 is 16.8ms against a 16.7ms budget. That is one frame in twenty landing
marginally late, measured under swiftshader in a container — real Apple
silicon will be faster, but this has no headroom for a heavier render pass.
Measure before adding work to the rip or binder-scroll paths.

### 6.3 iOS constraints that are already handled — don't undo them

- **WebGL canvas resize leaks GPU memory** on WebKit
  ([bug 219780](https://bugs.webkit.org/show_bug.cgi?id=219780)). `glcard.ts`
  keeps canvas dimensions fixed and draws into viewports instead. The e2e
  check `canvas dimensions stay stable (no resize leak)` guards this.
- **WebGL context is lost when Safari backgrounds.** `glcard.ts` has full
  `webglcontextlost` / `webglcontextrestored` handling that rebuilds from
  seeds. Guarded by `WebGL context loss recovers (iOS backgrounding)`.
- **No haptics.** The Web Vibration API has never existed on iOS, and the
  `<input switch>` trick that worked from 17.4 was patched in 26.5. `feel.ts`
  feature-detects and degrades. Audio and visuals carry the juice.
- **rAF is capped at 60fps.** Design for a locked 60; ProMotion is a bonus.
- **PWA push cannot play a sound** and there is no silent push. The calendar
  model means nothing is gated on waiting, so this costs nothing.

### 6.4 New sharp edges from the 2026-08-05 pass

- **Hype multiplies `world.valuation`, not `intrinsicValue`.** Engine tests
  pin the *neutral* economy; the live game multiplies by
  `playerForm(...).hype` (0.5–2.6, exactly 1.0 on day 1). If you add a
  system that calls `intrinsicValue` directly, it will disagree with every
  screen — go through `world.valuation`.
- **`world.currentDay` must track the save's day.** `syncCalendar(day)`
  advances it (endDay and hydrate both call it). A valuation taken before
  hydrate finishes uses day 1 hype — harmless today because nothing prices
  cards pre-hydrate; don't change that.
- **`returns` + `returnCompanies` travel together.** The uid→company map
  for arrived slabs persists in the save; if you add a path that puts uids
  into `returns`, record the company or the reveal falls back to PSG.
- **`ripSession` persists.** A rip in progress survives reload by design;
  `endRip()` is what clears it. Anything that adds cards mid-ceremony
  should pass `addPulls(pulls, { quiet: true })` and later
  `releaseBreaking()`, or the breaking banner will spoil the reveal.
- **Snapshot stills can be '' while the GL context is lost.** Callers must
  treat falsy data URLs as "retry later" and never cache them.

### 6.5 Smaller things

- **`test/overrides.test.ts` mutates the `world` singleton.** The
  `applying a preset to the live world` block resets in `afterAll`. Vitest
  isolates files, so this is contained — but don't import `world` into another
  test file and assume a clean slate.
- **The dev seed helper is a footgun.** `?seed-collection=N` rips real packs
  from the real population. Every `tools/*-shots.mjs` run consumes world
  supply in that browser profile's IndexedDB. Fine in a throwaway profile,
  confusing if you forget.
- **`series` overrides are keyed by series id, and series ids are derived
  from year+brand+line.** Renaming a brand in the editor does not change the
  id (correct), but if you ever change how ids are derived, existing override
  files silently stop matching.
- **`splitName` puts everything after the first token into `last`.** That is
  deliberate — it keeps "Witt Jr." and "St. Brown" intact — but it means a
  three-word name renders with a long surname on the nameplate.
- **No error boundary.** A throw in a screen blanks the app. The e2e run
  asserts zero uncaught page errors, which is the only thing catching this.
- **IndexedDB version is 1 with no migration path.** `scheduleSave` writes a
  `version: 1` record and `restoreSave` reads it with `?? fallback` on new
  fields. That has worked for every field added so far; a structural change
  will need a real migration.

---

## 7. Conventions that will bite you if you miss them

- **`src/engine/` has zero DOM access** and must stay that way — it is what
  makes the test suite fast and the logic verifiable. Rendering lives in
  `src/render/`, which may use canvas.
- **Determinism means no `Math.random()` and no `Date.now()`** anywhere in
  engine code. Everything takes an `Rng` or derives one from a seed via
  `childSeed(parent, label)`. A stray `Math.random()` will pass tests once and
  then desync a save.
- **`Comp.daysAgo` is relative, not absolute.** Comps are generated on demand
  relative to today; storing an absolute day made every comp read "day 1".
- **`tsconfig` is strict with `noUnusedLocals` and `noUnusedParameters`.**
  Unused imports are build failures, not warnings.
- **Presets are reference data for private use.** Nothing in `presets/` is
  bundled into gameplay; the generator stays fictional. Loading one is an
  explicit user action from the EDIT tab. Do not wire a preset into the
  default world.
- **Screenshots are the review process for art.** `tools/*-shots.mjs` render
  each screen at 1206×2622. Card art was iterated against those images rather
  than shipped unexamined. If you change `layers.ts`, `athlete.ts`,
  `anatomy.ts` or `equipment.ts`, **look at the output** — the tests cannot
  tell you a figure's arms are inflated or a helmet is floating.

---

## 7.5 The TCG layer (realism concept)

Two collectible TCG sets ride the same engine as shim `SeriesRuntime`s:
`tcg-base` (1999 Base Set, priced as 1st Edition vintage — $3.5k packs,
$110k boxes, $22k raw holo Charizard) and `tcg-151` (modern, $5 packs with
a 1:150 secret-rare chase). Sharp edges:

- **Everything generic just works** (populations, saves, condition, comps,
  binder) because `world.enableTcg()` registers real runtimes. TCG-specific
  semantics branch on `world.isTcg(id)`: pack structure (11 cards, 7/3/1,
  holo 1:3), authored per-card values × `tcgGradeMultiplier`, vintage wax
  pricing, heat = log2(value). `seriesIds` EXCLUDES tcg ids (sports-only
  callers: shelf, lots, Top 50, ripWorld); use `world.tcgIds` to reach them.
- **`Population` requires dense slot ids.** `tcgPopulation` emits every
  (card × rung) slot with zero copies off the card's native rung. Don't
  "simplify" to sparse slots — the constructor throws.
- **Enable order on hydrate:** `world.enableTcg()` must run BEFORE
  `world.restorePopulations`, or the tcg draw states are dropped. The
  persisted `tcgEnabled` flag in the save drives this.
- **Scans win.** `renderCardLayers` branches on `spec.tcg`: an official
  scan from the provider (`src/render/photodb.ts`, fed by IndexedDB
  `poke-art-cache`, keys `base:${num}` / `151:${num}`) renders full-bleed;
  otherwise the procedural concept frame draws. `loadCachedScans()` at boot
  makes it all work offline.
- **The realism one-tap** (`src/app/realism.ts`) is the whole pipeline:
  names → photos → scans → `enableTcg` → decode → revision bump. It lives
  on the CareerSetup welcome screen; the EDIT-tab variant additionally
  calls `resetToWelcome()` (fresh career, assets survive).
- Verify with `node tools/tcg-e2e.mjs` (loop on concept frames) and
  `SCAN_DIR=<dir> node tools/tcg-scan-check.mjs` (scan-wins proof; see the
  script header for how scans get seeded in-sandbox).

## 8. Where to start

If you want the highest-value work first, in order (items 1–4 of the
original list — release calendar, career sim, inserts/poses, save
export/import — shipped on 2026-08-05):

1. **Era progression.** The release calendar exists; make decades bias the
   archetype pick, print runs, and design DNA.
2. **Set completion + trades + fixed-price listings** (§4.2) — the missing
   mid-game goals between "rip wax" and "chase the Top 50".
3. **Card shows / estate bidding** — the sourcing loop's next act.
4. Everything else in §4.2, by taste.

### How to prove you didn't break it

```bash
npx tsc --noEmit && npm test && npx vite build && node tools/e2e.mjs
```

All four, in that order. The e2e run needs the fresh build. If you touched
rendering, also run the relevant `tools/*-shots.mjs` and actually look at the
PNGs in `shots/`.

---

## 9. Original requirements, for reference

The game was specified as: adjustable starting money, name your own small
business, buy/sell/trade toward the most elite cards, true-to-life rarity
including 1/1s that are insanely hard to pull, football and baseball, a news
feed and a top-50 board, a vast card count with new cards each series, world
events when someone finds the top card, beautiful scrollable inventory books
with quick-sell and auction, grading as a fun element where the generator can
create error cards and even a legendary card can grade 9 on a defect, card art
that mimics premium real cards rather than looking generic, 1/1s that stand
out, autographs that look autographed, pack ripping that feels genuinely
exciting, and above all **nonstop, everlasting fun — not repetitive**.

That last one is the bar, and §4.1 is the honest accounting of the distance
still left to it.
