# Requirements: STAAD Online

**Defined:** 2026-08-15
**Core Value:** Open a STAAD `.std` file and see the 3D analytical model render correctly — on any device, in any browser, without STAAD.Pro.

## v1 Requirements

Requirements for milestone v1.0 (STAAD Online Viewer). Each maps to roadmap phases. Target platforms: web browsers + Android (Capacitor); iOS deferred.

### File Opening

- [ ] **FILE-01**: User can open a `.std` file via system file picker on web and Android
- [ ] **FILE-02**: User can open a `.std` file by drag-and-drop onto the app (desktop web)
- [ ] **FILE-03**: User can cancel the file picker without errors or state corruption
- [ ] **FILE-04**: App rejects oversized or unreadable files with a clear error message

### Parsing

- [ ] **PARSE-01**: App parses joints, members, properties, supports, and loads from a `.std` input deck
- [ ] **PARSE-02**: Parser tracks running unit state (default FEET KIPS, switching mid-file) so geometry renders at correct physical size
- [ ] **PARSE-03**: Parser tolerates multiple STAAD versions and format variants — unknown commands are skipped with warnings, never fatal
- [x] **PARSE-04**: Parser handles `.std` free-format grammar: `;` multi-entry lines, `*` comments, line continuations, command abbreviations
- [x] **PARSE-05**: Parser produces a typed model (nodes, members, sections, supports, loads, groups, bounds) decoupled from rendering

### 3D Rendering

- [ ] **REND-01**: App renders the 3D analytical model procedurally using real cross-section shapes, not generic cylinders
- [ ] **REND-02**: Members render instanced (one InstancedMesh per distinct section profile) so large models stay interactive
- [ ] **REND-03**: Camera auto-fits the full model bounds on load
- [ ] **REND-04**: Thin members render with default size exaggeration (~10-20x) so sections are visible in large frames
- [ ] **REND-05**: User can orbit, zoom, and pan the model with touch (mobile) and mouse (desktop)
- [ ] **REND-06**: Large coordinate values are rebased to model centroid before rendering to preserve float precision

### Color Modes

- [ ] **COLOR-01**: User can color members by section
- [ ] **COLOR-02**: User can color members by group
- [ ] **COLOR-03**: User can color members by material
- [ ] **COLOR-04**: User can switch color modes without rebuilding the scene (per-instance color buffer rewrite)

### Supports and Loads

- [ ] **MARK-01**: App displays supports as 3D markers at supported nodes, distinguishing restraint types
- [ ] **MARK-02**: App displays loads as 3D arrows with direction and magnitude labels
- [ ] **MARK-03**: User can select which load case to display via a load-case selector
- [ ] **MARK-04**: Load arrow direction conventions are labeled (global vs local axis) so magnitudes are interpretable

### Member Inspection

- [ ] **INSP-01**: User can tap/click a member to view its section, group, length, and node coordinates
- [ ] **INSP-02**: Hovering a member highlights it, with a usable tap target on dense models
- [ ] **INSP-03**: Members referencing a section with no bundled dimension data show an "approximate dimensions" flag

### Summary Panel

- [ ] **SUMR-01**: App shows a model summary panel with node count, member count, group list, and bounding box
- [ ] **SUMR-02**: Summary always labels units in force for the model
- [ ] **SUMR-03**: Summary shows the count of parse warnings so users know the model loaded tolerantly

### Native Packaging (Android)

- [ ] **PLAT-01**: App is packaged as a native Android app via Capacitor
- [ ] **PLAT-02**: App works offline on Android after installation
- [ ] **PLAT-03**: Native file opening uses the Capacitor file-picker plugin without base64 reads (streaming path)

### Performance

- [ ] **PERF-01**: Files above ~2 MB parse in a Web Worker off the main thread
- [ ] **PERF-02**: Parse shows progress feedback for large files

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Resilience and Field Use

- **RESL-01**: Persisted model restore to survive WebView termination (currently iOS-targeted; revisit when iOS is scoped)
- **RESL-02**: Recent-files list via `@capacitor/filesystem`
- **RESL-03**: Node/member number labels (toggle)
- **RESL-04**: "Open with..." from Android share sheet / iOS Files app
- **RESL-05**: Non-AISC section databases (Eurocode, British, Indian)

### Results and Formats

- **OUTP-01**: `.OUT` results viewer (deformed shape, diagrams) — natural next milestone
- **OUTP-02**: Plates/solids rendering (ELEMENT INCIDENCES SHELL)
- **OUTP-03**: Additional model formats (`.e2k`, `.s2k`)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Editing or re-running analysis | Viewer, not modeler; `.std` write-back is a second product |
| Analysis results / post-processing | Results live in `.OUT`/`.ANL` files, not `.std`; deferred to next milestone |
| Server, accounts, or collaboration | Client-side only; privacy is the product's positioning |
| Plates/solids (physical model geometry) | Physical-model data lives in sidecar files; surface tessellation is a different rendering domain |
| Cloud upload / share links | Kills privacy/offline value proposition; needs a backend |
| iOS native packaging | User decision: focus web + Android for v1.0 |
| i-model import (Structural Navigator format) | Bentley-proprietary ISM container; compete on zero-conversion instead |
| Save-as / export / re-parse round-trip | Filesystem writes invite stale-URI bugs; file re-picked each session |
| Multiple format support (ETABS, SAP2000) | Each format is a full parser + test corpus; parser stays format-isolated for later |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FILE-01 | Phase 2 | Pending |
| FILE-02 | Phase 2 | Pending |
| FILE-03 | Phase 2 | Pending |
| FILE-04 | Phase 2 | Pending |
| PARSE-01 | Phase 1 | Pending |
| PARSE-02 | Phase 1 | Pending |
| PARSE-03 | Phase 1 | Pending |
| PARSE-04 | Phase 1 | Complete |
| PARSE-05 | Phase 1 | Complete |
| REND-01 | Phase 2 | Pending |
| REND-02 | Phase 2 | Pending |
| REND-03 | Phase 2 | Pending |
| REND-04 | Phase 2 | Pending |
| REND-05 | Phase 2 | Pending |
| REND-06 | Phase 2 | Pending |
| COLOR-01 | Phase 3 | Pending |
| COLOR-02 | Phase 3 | Pending |
| COLOR-03 | Phase 3 | Pending |
| COLOR-04 | Phase 3 | Pending |
| MARK-01 | Phase 3 | Pending |
| MARK-02 | Phase 3 | Pending |
| MARK-03 | Phase 3 | Pending |
| MARK-04 | Phase 3 | Pending |
| INSP-01 | Phase 3 | Pending |
| INSP-02 | Phase 3 | Pending |
| INSP-03 | Phase 3 | Pending |
| SUMR-01 | Phase 3 | Pending |
| SUMR-02 | Phase 3 | Pending |
| SUMR-03 | Phase 3 | Pending |
| PLAT-01 | Phase 4 | Pending |
| PLAT-02 | Phase 4 | Pending |
| PLAT-03 | Phase 4 | Pending |
| PERF-01 | Phase 4 | Pending |
| PERF-02 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 34 total
- Mapped to phases: 34 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-15*
*Last updated: 2026-08-15 after roadmap creation (all 34 v1 requirements mapped)*
