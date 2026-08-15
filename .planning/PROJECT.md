# STAAD Online

## Current Milestone: v1.0 STAAD Online Viewer

**Goal:** Open a STAAD `.std` file and render its 3D analytical model correctly — on any device, without STAAD.Pro.

**Target features:**
- Core viewer: open `.std` via file picker/drag-drop, parse joints/members/properties/supports/loads, render 3D model procedurally
- Color members by section, group, or material
- Display supports and loads as 3D markers/arrows
- Tap/click member to inspect section, group, length, and node coordinates
- Model summary panel (units, counts, bounds, groups)
- Native packaging: Capacitor iOS/Android shell, offline

## What This Is

A Capacitor hybrid mobile/web app that lets structural engineers open Bentley STAAD `.std` model files directly on a mobile device or in a web browser and view the 3D analytical model — without STAAD.Pro installed, with no uploads, and no accounts. Files are parsed entirely on-device (in the app's web layer) and never leave the device.

## Core Value

Open a STAAD `.std` file and see the 3D analytical model render correctly — on any device, in any browser, without STAAD.Pro. If a user can't load a file and see their structure, nothing else matters.

## Business Context

- **Customer**: Structural engineers who build and review models in Bentley STAAD.Pro and need to view them away from their workstation (site visits, client meetings, travel).
- **Revenue model**: TBD — positioned as a public product; monetization not decided yet (freemium/pro/subscription all open).
- **Success metric**: TBD — candidates: weekly active viewers, models opened, retention after first open.
- **Strategy notes**: None yet.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Engineer can open a `.std` file via file picker or drag-and-drop
- [ ] App parses the STAAD input deck entirely in-browser (joints, members, properties, supports, loads)
- [ ] App renders the 3D analytical model procedurally (nodes + members as 3D shapes)
- [ ] Engineer can color members by section, group, or material
- [ ] App displays supports and loads as 3D markers/arrows where defined
- [ ] Engineer can tap/click any member to inspect its section, group, length, and node coordinates
- [ ] App shows a model summary panel (units, member/joint counts, dimension bounds, groups)
- [ ] App is installable as a native app on iOS and Android via Capacitor, and works offline on mobile and web

### Out of Scope

- Analysis results / post-processing — results live in `.OUT` files, not `.std`; deferred to a later phase
- Server, accounts, or multi-user collaboration — client-side only for v1 (privacy is a selling point)
- Editing or re-running analysis — this is a viewer, not a modeling tool
- Physical model geometry — newer STAAD.Pro physical-modeling workflows use sidecar data; v1 targets the analytical model in `.std`

## Context

- STAAD `.std` files are **text input decks**: `STAAD SPACE`, `JOINT COORDINATES`, `MEMBER INCIDENCES`, `MEMBER PROPERTY`, `SUPPORTS`, `LOAD` commands fully describe the analytical model. Renaming to `.txt` exposes everything a viewer needs.
- The analytical model is structurally simple (nodes + members + section definitions), so members can be rendered procedurally as boxes/cylinders sized from section data — no glTF/intermediate format needed for v1.
- Analysis results are NOT in `.std` — they live in `.OUT` files. A future "view results" phase will parse `.OUT` alongside `.std`.
- Different STAAD versions may drift in text-format details; the parser should be tolerant and validate against real files early.

## Constraints

- **Tech stack**: Client-side only for v1 — no backend, no database. Files parsed in the app's web layer. App shell via Capacitor (iOS/Android), with the same web codebase served in-browser.
- **Compatibility**: Must work on iOS and Android via Capacitor, and in modern browsers via the same web codebase.
- **Performance**: Industrial models can be large; rendering needs instancing/LOD consideration from the start.
- **Format tolerance**: Must handle `.std` files from multiple STAAD versions without crashing.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Parse `.std` in the browser, not on a server | Zero backend, zero accounts, files never leave the device; privacy is a differentiator | — Pending |
| Render members as procedural shapes, not glTF | Analytical model is just nodes + members; simpler, faster, no pipeline machinery | — Pending |
| Deliver as a Capacitor hybrid app (iOS/Android) with the same web codebase served in-browser | One codebase covers native stores, mobile, and web; offline by default from the bundled shell | — Pending |
| Position as a public product | Targets all engineers with STAAD models, not just internal use | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-15 after milestone v1.0 started*