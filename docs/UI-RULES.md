# The Viewport Contract

Strict rules every screen must satisfy at 402×874 (iPhone 16 Pro), the only
supported viewport. Screenshots are the enforcement mechanism: run the
`tools/*-shots.mjs` harnesses and check each rule before shipping UI.

## Text
1. **No overlapping text.** No label may collide with another label, a
   badge, an image, or a screen edge.
2. **No overflow.** Names, team names, prices and serials must fit their
   container by *measured font shrink* — never glyph squish (canvas
   maxWidth), never ellipsis on money, never clipping.
3. **Minimum legible size**: 9px for fine print, 11px for anything the
   player must read to make a decision, 13px+ for primary actions.
4. **Contrast**: body text ≥ 4.5:1 against its background; decorative/fine
   print may drop to 3:1 but never lower.

## Touch
5. **Minimum hit target 44×44pt** for any tap the player needs mid-flow
   (buy, rip, flip, reveal, confirm). Dense list rows may be 40pt tall but
   must be full-bleed wide.
6. **No irreversible single-tap money actions.** Anything that spends or
   sells arms on first tap and confirms on second (or via a sheet).
7. **Sticky actions stay reachable**: primary CTAs live in the lower half
   of the screen or float; never only at the top of a long scroll.

## Layout
8. **No dead space** larger than ~15% of the viewport without content or
   intentional breathing room around a hero element.
9. **Cards keep 2.5:3.5.** A card image may never render square, stretched,
   or cropped — every thumbnail container locks the aspect ratio.
10. **Safe-area respect**: nothing interactive within 16px of the bottom
    edge (home indicator) or under the nav bar.
11. **Scroll containers announce themselves**: lists that cap ("top 60")
    say so; pages that continue must show a partial row or count.

## Presentation
12. **No emoji as product art.** Emoji may only appear as inline accents in
    text (🔥 chip), never as the primary visual for a product, package, or
    card. Procedural art or drawn glyphs only.
13. **Every reveal has a beat.** Money results and grades never just
    appear — they land with staging (flip, glow, slam) and the value is
    stated at the moment of reveal.
14. **Numbers the player acts on are visible before the act**: value/comps
    before selling, odds before grading, price before buying.
15. **One accent system**: gold `#d4a017`/`#e8c86a` for money/CTAs, green
    `#8ee08e` for gains, red `#e08a6a` for losses — never mixed roles.

## Performance-as-UX
16. **Tap-to-response under 150ms** on-device for every interaction on the
    rip/binder paths (p95 frame budget 34ms in the e2e harness).
17. **No blank flashes**: images that rasterize on demand must show a
    placeholder or previous frame, never a white/transparent hole.
