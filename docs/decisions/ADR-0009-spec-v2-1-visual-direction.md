# ADR-0009 — Adopting spec v2.1's dark-first design system

**Status:** accepted · 2026-08-13
**Context:** spec v2.1 §18.0, §20 · supersedes the §20 palette this repository shipped

## What changed

v2.1 rebuilt §20 around an approved 11-screen mockup. The palette, the type
pairing and the surface model are all different from what was built:

| | v2.0 (built) | v2.1 (this ADR) |
|---|---|---|
| Ground | light `#f7f2e8`, dark theme optional | dark `#0E0C0A`, **dark-first, no light theme on mobile** |
| Accent | brass `#b4832f` | sand gold: `#C9A227` mark, `#D7B37E` actions, `#8F7645` hairlines |
| Display face | Fraunces | Cormorant Garamond |
| Elevation | shadow | surface lightness (`--surface` → `--surface-raised`) |

## Decision

Take v2.1 literally. The token block in §20.1 is copied verbatim into
`globals.css` rather than reinterpreted, and the Tailwind preset resolves to
those variables so a utility cannot drift from the token — the failure that
produced 1.27:1 cream-on-sand text under the previous palette.

## Consequences

- The light theme is gone from the app surfaces. §20 keeps `--paper` and
  `--paper-text` for web long-form only, so the tokens exist and nothing uses
  them yet.
- Contrast is re-verified rather than assumed. `scripts/contrast-audit.mjs`
  runs against every page in both schemes; with a single theme, "both schemes"
  now means the design must hold when a reader's OS asks for light and gets
  dark anyway.
- §20.4's horse timeline is explicitly *not* in the mockup and must be designed
  into it. It stays, because it is the visual proof of §2.
- The four §18.0 deviations are resolved as written there: Profile is the
  stable entry point, the stat row is Listings · Horses · Reviews · Response
  rate, the fifth category tile is Jobs, and OAuth ships Apple + Google only.

## One token could not be used as written

§20.1 sets `--text-muted: #7E7466`. Measured against every surface in the same
section:

| on | ratio |
|---|---|
| `--bg` #0E0C0A | 4.26:1 |
| `--surface` #17140F | 4.00:1 |
| `--surface-raised` #221D17 | 3.64:1 |

WCAG AA needs 4.5:1 for normal-size text, so the token fails everywhere it
could be placed — while §18.3 requires "contrast ≥ 4.5:1". The specification
contradicts itself, and the mockup cannot settle it because a mockup is not
measured.

**Resolution: keep the token's value exactly, restrict where it may be used.**
`--text-muted` is reserved for large text (≥24 px, or ≥18.66 px bold), where
AA's threshold is 3:1 and 4.26 clears it comfortably. Every label, caption and
line of body copy that was using it now uses `--text-secondary` (8.94:1 on the
ground, 7.65:1 on a raised surface).

Changing the hex would have been the smaller diff and the wrong call: the
value is part of an approved visual direction, and the thing actually at fault
was using the quietest colour in the system for text that has to be read.
`scripts/contrast-audit.mjs` enforces the outcome on every page.
