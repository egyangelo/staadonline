# Roadmap: STAAD Online

## Overview

From empty repo to shipped viewer in four dependency-ordered phases: first a tolerant, headless parser turns real STAAD `.std` input decks into a typed, unit-correct model validated against a golden-file corpus; then the core-value moment — users open a `.std` file and see the 3D analytical model render correctly with real section shapes, instanced from day one; then interaction and visualization — color modes, support/load markers with a load-case selector, tap-to-inspect, and a model summary; finally Capacitor Android packaging with offline and streaming file open, plus worker-based parsing for large files. The pipeline is strictly one-way (open → parse → model → render); the web app is fully proven in-browser before any native shell exists.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Parser & Model** - Tolerant headless `.std` parser, typed StaadModel, golden-file corpus
- [ ] **Phase 2: File Opening & 3D Rendering** - Open `.std` and render the 3D analytical model instanced
- [ ] **Phase 3: Interaction & Visualization** - Color modes, supports/loads markers, member inspection, summary
- [ ] **Phase 4: Native Packaging & Performance** - Capacitor Android app, offline, worker parse

## Phase Details

### Phase 1: Parser & Model

**Goal**: A tolerant, headless parser converts `.std` input decks into a typed, unit-correct `StaadModel`, validated against a golden-file corpus of real file shapes.
**Depends on**: Nothing (first phase)
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05
**Success Criteria** (what must be TRUE):

  1. A golden corpus of real `.std` file shapes (plane frame, space frame, semicolon-packed GUI output, mixed-unit, modern quoted-DB) parses to the correct joint/member/section/support/load counts without crashes.
  2. The parser tracks running unit state (default FEET KIPS, mid-file switches) so mixed-unit files normalize to the correct physical size.
  3. Unknown or version-drifted commands are skipped with collected warnings, never fatal; free-format grammar (semicolons, `*` comments, `" -"` continuations, abbreviations, trailing-dot floats) is handled.
  4. The parser produces a typed model (nodes, members, sections, supports, loads, groups, bounds) with zero DOM/Three imports — headless, unit-testable, worker-ready.

**Plans**: 7/9 plans executed

Plans:

- [x] 01-01-PLAN.md — Scaffold headless parser package, types, warning codes
- [x] 01-02-PLAN.md — Tokenizer (TDD)
- [x] 01-03-PLAN.md — Golden-file fixture corpus (real + hand-written)
- [x] 01-04-PLAN.md — Unit-state machine, block segmentation, parse core (TDD)
- [x] 01-05-PLAN.md — JOINT COORDINATES + MEMBER INCIDENCES handlers
- [x] 01-06-PLAN.md — MEMBER PROPERTY, section resolver, CONSTANTS material
- [x] 01-07-PLAN.md — SUPPORTS + GROUP DEFINITION handlers
- [x] 01-08-PLAN.md — LOAD cases, load items, tolerated commands
- [ ] 01-09-PLAN.md — Production wiring + golden-file verification

### Phase 2: File Opening & 3D Rendering

**Goal**: Users open a `.std` file via picker or drag-drop and see the 3D analytical model render correctly — real cross-section shapes, one InstancedMesh per section profile, auto-fit camera, touch/mouse navigation.
**Depends on**: Phase 1
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, REND-01, REND-02, REND-03, REND-04, REND-05, REND-06
**Success Criteria** (what must be TRUE):

  1. User can open a `.std` file via the system file picker (web and Android) and by drag-and-drop (desktop web); canceling the picker leaves no error or state corruption.
  2. Oversized or unreadable files are rejected with a clear error message before parsing.
  3. The 3D analytical model renders with real cross-section shapes (not generic cylinders), one InstancedMesh per distinct section profile, so large models stay interactive.
  4. Camera auto-fits the full model bounds on load; thin members render at ~10-20x size exaggeration; large coordinate values are rebased to the model centroid so geometry stays stable.
  5. User can orbit, zoom, and pan the model with touch (mobile) and mouse (desktop).

**Plans**: TBD
**UI hint**: yes

### Phase 3: Interaction & Visualization

**Goal**: Users can read the model — color members by section/group/material, see supports and loads per load case, tap/click members to inspect details, and view a model summary.
**Depends on**: Phase 2
**Requirements**: COLOR-01, COLOR-02, COLOR-03, COLOR-04, MARK-01, MARK-02, MARK-03, MARK-04, INSP-01, INSP-02, INSP-03, SUMR-01, SUMR-02, SUMR-03
**Success Criteria** (what must be TRUE):

  1. User can color members by section, group, or material and switch color modes without rebuilding the scene (per-instance color buffer rewrite).
  2. Supports display as 3D markers distinguishing restraint types; loads display as 3D arrows with magnitude labels for the selected load case, with global vs local axis direction conventions labeled.
  3. User can tap/click any member to view its section, group, length, and node coordinates; hovering highlights it with a usable tap target on dense models, and name-only sections show an "approximate dimensions" flag.
  4. The summary panel shows node count, member count, group list, bounding box, force units, and parse-warning count so users know the model loaded correctly and tolerantly.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Native Packaging & Performance

**Goal**: The app ships as an offline Android app via Capacitor with streaming native file open, and large files parse off the main thread with progress feedback.
**Depends on**: Phase 3
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. User can install and run the app as a native Android app via Capacitor.
  2. The app works fully offline on Android after installation.
  3. Native file opening uses the Capacitor file-picker streaming path (no base64 reads), so large files open without OOM.
  4. Files above ~2 MB parse in a Web Worker off the main thread, keeping the UI responsive.
  5. Parse shows progress feedback for large files.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Parser & Model | 7/9 | In Progress|  |
| 2. File Opening & 3D Rendering | TBD | Not started | - |
| 3. Interaction & Visualization | TBD | Not started | - |
| 4. Native Packaging & Performance | TBD | Not started | - |
