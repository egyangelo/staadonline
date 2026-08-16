# Phase 3: Interaction & Visualization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 3-Interaction & Visualization
**Areas discussed:** Color modes & palettes, Support markers, Load arrows & case selector, Inspection + summary panel

---

## Color Modes & Palettes

| Option | Description | Selected |
|--------|-------------|----------|
| Categorical palette (Recommended) | Each distinct section/group/material gets a categorical hue from a fixed palette. Color identity = engineering key. | ✓ |
| Continuous scale | Color by a continuous dimension (e.g., member length), less useful for section/group/material identity. | |
| Both, pick via dropdown | Categorical by default with optional full-rainbow assignment across distinct keys. | |
| Fixed cyclic palette | 12-20 hue options reused cyclically when keys exceed palette size. Simple, predictable. | ✓ |
| Generated distinct hues | Golden-ratio hue stepping — no repeats until huge key counts, but colors look less curated. | |
| By section (Recommended) | The most recognizable engineering identity; matches STAAD.Pro default. | ✓ |
| By material | Fewer distinct colors, whole structure reads as ONE color with highlights. | |
| Don't auto-apply | Uniform neutral base, switch only when user picks a mode. | |
| Neutral grey for unassigned | Unassigned members render neutral so color modes are readable. | ✓ |
| Palette fallback slot | Unassigned members keep a fallback palette color. | |
| 'All' → uniform accent | An accent 'All' option makes members uniform accent blue; clean baseline. | ✓ |
| 'All' → neutral dark | A neutral dark base, without going to selection-accent. | |

**User's choice:** Categorical palette; fixed cyclic palette; default by section; neutral grey for unassigned; 'All' mode → uniform accent.
**Notes:** Color identity is the engineering key; engineers distinguish adjacent categories by shape anyway.

---

## Support Markers

| Option | Description | Selected |
|--------|-------------|----------|
| Shape encodes restraint type | FIXED = cube, PINNED = pyramid, FIXED_BUT = cube with released-axis notches, SPRING = coil, ENFORCED/PLATE = distinct smaller shapes. | ✓ |
| Color + dof dots | Same base marker, colored by 6-dof release pattern. | |
| Hybrid shape+color | Shape for the 3 common types, color for the rest. | |
| Scale with exaggeration | Markers scale with the cross-section so they read against exaggerated geometry. | ✓ |
| Fixed size | Stable but can get lost next to thick exaggerated members. | |
| One combined toggle | Single toolbar toggle for the whole supports+loads marker layer. | ✓ |
| Separate toggles | Supports layer and loads layer independently. | |
| Detail on inspection | Release detail + spring stiffness surface on tap, not always-visible. | ✓ |
| Always-visible axis dots | Per-axis restrained/released dots on every FIXED_BUT marker. | |

**User's choice:** Shape encodes restraint type; scale with exaggeration; one combined toggle; detail on inspection.
**Notes:** Marker detail (release axes, spring stiffness) is inspector-surfaced.

---

## Load Arrows & Case Selector

| Option | Description | Selected |
|--------|-------------|----------|
| Show all load kinds | Nodal/point + member loads as arrows, distributed as arrays, moments as curved double-arrows, SELFWEIGHT included. | ✓ |
| Subset first | Nodal + member point loads first; distributed + moments deferred. | |
| On hover/selection only | Only the hovered/selected arrow shows magnitude. | |
| Always visible | Every load arrow carries a persistent label. | |
| Toggled | Magnitude labels behind a toggle. | ✓ |
| Default ON | Label toggle defaults ON when loads layer is first shown. | ✓ |
| Default OFF | User turns on labels manually. | |
| Legend only | A per-case legend chip shows GLOBAL/LOCAL; arrows unmarked. | ✓ |
| Legend + per-arrow G/L tag | Legend plus per-arrow tags. | |
| Primary + combinations + repeated loads | Selector offers primary cases, combinations, AND repeated loads. | ✓ |
| Render referenced items | Combo/repeated selection renders union of referenced cases' items (weights ignored). | ✓ |
| List only, no arrows | Combo/repeated cases list refs in the legend but render nothing. | |

**User's choice:** Show all load kinds; magnitude labels toggled + default ON; axis convention = legend only; selector includes primary + combinations + repeated loads, rendering referenced items (weights ignored).
**Notes:** User explicitly listed "primary, combinations and repeated loads" for the selector; combos/repeats render the union of referenced items.

---

## Inspection + Summary Panel

| Option | Description | Selected |
|--------|-------------|----------|
| Floating popover | Bottom-left glass popover slides in on member tap — reuses StatsSummary glass styling. | ✓ |
| Right-side panel | Side panel expands the Summary panel into a full inspector. | |
| Raycast + throttle (Recommended) | Raycast picks members + markers; hover highlights; NO_TAP throttle guards dense models. | ✓ |
| Custom ID picking | Precomputed pickable ID buffers; faster on huge models, more plumbing. | |
| Extend StatsSummary | Keep the Phase 2 card; expand it into the full SUMR summary via a header control. | ✓ (user: "You decide" → planner discretion, D-16 base retained) |
| New panel, replaces card | Separate summary panel replaces the floating card entirely. | |
| Badge in popover | Orange "Approximate dimensions" badge in the inspector popover when section.approximate is true. | ✓ |
| Tint + badge | Approximate members also tinted at 3D level. | |

**User's choice:** Floating popover; raycast + throttle; expand StatsSummary base into full SUMR panel; approximate badge in popover.
**Notes:** User deferred exact highlight visual (dim-others vs selected-only) and the summary expansion mechanics to Claude's discretion.

---

## Claude's Discretion

- Per-mode palette color values, marker glyph geometry proportions, arrow glyph geometry.
- "Expand StatsSummary → full SUMR panel" interaction mechanics (D-16 keeps the card as base).
- Hover/selection highlight visual (dim-others+brighten vs selected-only).

## Deferred Ideas

- Analysis results (`.OUT` files) — next milestone.
- Multi-format import (`.e2k`/`.s2k`) — future.
- True-scale-only display mode (disable exaggeration) — optional extension.