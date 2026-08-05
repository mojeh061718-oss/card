# Cardboard

A sports card treasure-hunting career game. Name a shop, set a bankroll, and
buy / rip / dig / grade / trade your way toward the cards everybody wants.

Built as an offline-first PWA for iPhone 16 Pro.

```bash
npm install
npm run dev          # play at localhost:5173
npm test             # 76 engine tests
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

**Wax.** Buy sealed product with real money: retail packs, hobby packs,
boxes, cases. Distributors ration hot product daily, and sealed wax
appreciates as the population gets opened, so sitting on a case is a
strategy. Boxes carry real per-box guarantees — the factory seeds a
guaranteed auto and numbered cards into specific packs — which makes "one
box" and "twelve packs" genuinely different bets.

**Wax is -EV, on purpose.** Most boxes lose money and a few pay for the
year. Profit comes from hitting above average, grading well, or buying
cardboard somebody else mispriced — never from farming packs.
`test/wax-ev.test.ts` holds pricing to that shape so a tuning change can't
quietly turn ripping into a job.

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

- **Athletes are built from muscle volumes, not tubes.** A limb swells over
  the belly and necks into the joint; the torso is one closed silhouette
  built on the spine axis with deltoids, a waist and hips. Cut out behind a
  thick **white die-cut keyline** — the sticker outline premium inserts use
  to lift a figure off a busy background.
- **Poses come from real biomechanics**, not generic action shapes: the QB's
  throwing elbow sits above the shoulder line with the hand at the ear; the
  batter's back heel points to the sky while the front leg locks rigid as a
  block; the pitcher's back leg trails with the toe scraping.
- **Equipment is constructed, not suggested.** Football helmets get a shell
  with a center stripe, a face in the opening with real lighting, a chinstrap
  that anchors at the earhole, and a facemask cage with a metallic highlight.
  Plus batting helmets with ear flaps, caps with panel seams, gloves with
  finger seams, fielder's mitts with lacing, knee pads, wristbands, and
  cleats with sole plates and studs.
- **Downtown inserts** are the illustrated case hit: a procedural city
  skyline generated from the team's seed (three depth bands, window grids,
  spires, clouds), the figure standing on a light plinth measured to its own
  foot line, and the signature bottom banner with the insert-name pill.
  199 copies per card, roughly a 1-in-17-box pull.
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
  render/          color (OKLCH), dna, athlete, equipment, skyline, signature,
                   layers, glcard, slab, pack
  app/             screens, cardview, feel (audio + haptics)
  state/           world singleton + persisted collection
presets/           importable real-league name files (not bundled into play)
tools/             screenshot harnesses, icon generator, preset builder, e2e run
docs/              reference only — not built, not imported, not tested
```

New to the codebase? **[`docs/HANDOFF.md`](docs/HANDOFF.md)** is the orientation
doc: architectural invariants, an honest list of what is still missing, the
calibration numbers that must not drift, and the known sharp edges.

## Renaming the world

Every id in the game is numeric — populations, serials, saved cards, comps
and Top 50 entries reference `playerId` and `teamId`, never names. So the
**EDIT** tab is a display-layer override map: rename teams, players and
product lines freely without touching a seed, a print run, or a card you
already own. Talent, jersey numbers and team assignment are deliberately not
editable, because those feed valuation and art.

### Name presets

`presets/` holds importable name files. They are reference data you load from
the EDIT tab for private use — nothing in `presets/` is bundled into the game,
and the generator itself stays fictional.

| File | Contents |
|---|---|
| `nfl-teams.json` / `mlb-teams.json` | 32 / 30 clubs — city, name, abbreviation, published colors |
| `real-teams.json` | both leagues' clubs in one import |
| `nfl-players.json` / `mlb-players.json` | 75 player names per sport — 25 current, 50 legacy |
| `real-players.json` | both leagues' player names |
| `real-world.json` | everything: 62 clubs + 150 player names |

Teams map onto team ids alphabetically. Players use a different, sturdier
mechanism — **`rosterByRank`**, a plain ordered list of names applied to the
league's best players by talent:

```json
{ "version": 1, "rosterByRank": { "football": ["Patrick Mahomes", "Josh Allen"] } }
```

Rank 1 lands on the highest-talent generated player, rank 2 on the next, and
so on. That means **position in the list decides who anchors the checklist**
and whose 1/1 sits at the top of the board — so the shipped lists are ordered
by *card-market* pull, not by on-field grade, which is why a top-five lineman
sits below a quarterback. It also survives a world-seed change, where
hard-coded player ids would silently land on the wrong people.

Two things worth knowing:

- The lists cover 75 of each league's ~900 generated players, so ranks 76 and
  down keep their generated names and you get a mix. Add more names to the
  arrays in `tools/make-presets.mjs` to push real names deeper.
- Team assignment is the generator's, not the real league's — Mahomes lands
  on whichever club the world seed put its top-talent quarterback on. Team
  assignment feeds art and valuation, so it stays off the editable list.

Typing a name directly into the EDIT tab's players list pins that one player
and always beats the ranked list. Rebuild the files with
`node tools/make-presets.mjs`.

## Verification

`npm test` covers the correctness spine: serial uniqueness across an entire
exhausted population, population conservation, draw-frequency fidelity,
save/restore round-trips, grading determinism and strictness ordering,
auction bounds, and a **calibration suite** that pins the economy's shape to
hobby intuition (commons under $2, star rookies in the tens, /99s in the
hundreds, a superfractor rookie auto above $50K) and a **wax EV suite** that
keeps sealed product priced above its own mean return.

`node tools/e2e.mjs` drives the real loop headlessly at iPhone 16 Pro
resolution — new career → rip → dig → grade → slab → auction → wire → reload
— while measuring frame timing, graphics memory, and context-loss recovery.

The `tools/*-shots.mjs` harnesses capture each screen at device resolution;
card art was iterated against those screenshots rather than shipped unexamined.
