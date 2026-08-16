# Phase 2: File Opening & 3D Rendering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 2-file-opening-3d-rendering
**Areas discussed:** Camera + exaggeration behavior, Section shape fidelity, Web app foundation, Section database

---

## Camera + Exaggeration Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-fit on load + resize | Frame the model from rebased bounds on load and on window resize | ✓ |
| Auto-fit on load only | Frame only when a new file loads | |

**User's choice:** Auto-fit on load + resize (D-01)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Slider, default ~15x | Default ~15x on thin members, user-adjustable via slider | ✓ |
| Fixed ~15x, no slider | Fixed factor, no UI control | |
| True size only | Full-scale sizes, thin members may be sub-pixel | |

**User's choice:** Slider, default ~15x (D-02)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Y-up | STAAD global Y is up — same as three.js | ✓ |
| Z-up | Z as up, requires axis remap | |

**User's choice:** Y-up (D-03)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform factor | Apply exaggeration uniformly to all members | ✓ |
| Thin-only, threshold-based | Exaggerate only below a size ratio threshold | |

**User's choice:** Uniform factor (D-04)

---

## Section Shape Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| True outline extrusion | Extrude SectionProfile outline along member axis — real 3D profile | ✓ |
| Proportional shapes only | Oriented boxes/cylinders sized from dims | |
| Hybrid | True for resolved, box for fallbacks | |

**User's choice:** True outline extrusion (D-05)
**Notes:** Matches REND-01 "real cross-section shapes, not generic cylinders".

---

| Option | Description | Selected |
|--------|-------------|----------|
| Honor BETA rotation | Apply STAAD BETA member rotation from parsed data | ✓ |
| Ignore BETA for v1 | All vertical-flange, simpler | |

**User's choice:** Honor BETA rotation (D-06)
**Notes:** Where the parsed model carries it; flag for a small parser extension if the Member type lacks the field.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest-shape fallback | Approximate sections render as nearest recognizable family, flagged approximate | ✓ |
| Plain box fallback | All unresolved sections as plain boxes | |

**User's choice:** Nearest-shape fallback (D-07)

---

## Web App Foundation

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Next.js | Keep existing Next.js 16 app; R3F in client components; static export later | ✓ |
| Migrate to Vite | Move to Vite as STACK.md originally recommended | |

**User's choice:** Keep Next.js (D-08)
**Notes:** Deliberate deviation from STACK.md — working parser-integrated scaffold already exists.

---

| Option | Description | Selected |
|--------|-------------|----------|
| R3F + drei + Zustand | React Three Fiber v9 + drei + three + Zustand | ✓ |
| Imperative three.js | Raw three, manual scene management | |

**User's choice:** R3F + drei + Zustand (D-09)

---

| Option | Description | Selected |
|--------|-------------|----------|
| FileService abstraction | Platform boundary per ARCHITECTURE Pattern 4; native stub for Phase 4 | ✓ |
| Inline handlers for v1 | Inline picker + drag-drop in the page component | |

**User's choice:** FileService abstraction (D-10)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Viewer replaces home | Full-canvas 3D viewer replaces page.tsx; stats retained after load | ✓ |
| Separate viewer page | Landing page + separate viewer route | |

**User's choice:** Viewer replaces home (D-11)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal overlay now | Open + exaggeration slider over canvas; no panels yet | ✓ |
| Full toolbar layout now | Header/toolbar/canvas ready for Phase 3 panels | |

**User's choice:** Minimal overlay now (D-12)

---

## Section Database

| Option | Description | Selected |
|--------|-------------|----------|
| Vendor MIT AISC DB | OpenBuilding MIT steel DB (1,223 sections + mapping) | ✓ |
| Approximate-only for v1 | Polygon fallbacks only, defer a real DB | |
| Licensed AISC edition | Bundled licensed AISC database | |

**User's choice:** Vendor MIT AISC DB (D-13)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Lookup-on-demand | Resolve only section names referenced by the model | ✓ |
| Bundle full DB | Ship full DB loaded from day one | |

**User's choice:** Lookup-on-demand (D-14)

---

## Claude's Discretion

- Extrusion tessellation approach, per-family profile orientation defaults, nearest-family detection order, slider bounds/steps, Zustand store slice shapes, DB bundling format.

## Deferred Ideas

- Capacitor native shell + static export — Phase 4
- Color modes / markers / inspection / summary panel / load-case selector / full toolbar — Phase 3
- Web Worker parse + progress — Phase 4
- True-size-only option — optional extension