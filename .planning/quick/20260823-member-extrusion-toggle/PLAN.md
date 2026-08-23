---
slug: member-extrusion-toggle
created: 2026-08-23
status: in-progress
---

# Quick Task: Member extrusion toggle

## Description
Frame members currently always render with their true cross-section extrusion (exaggeration pinned to 1). Add a "Profiles" toggle button (parallel to the plates Thickness toggle): ON = real section profiles (current), OFF = slim centerline sticks so the structure reads as a wireframe. Toggle triggers a scene rebuild via ViewerCanvas's build-effect dep.

## Tasks
1. viewerStore: `memberExtrusion: boolean` (default true) + setter
2. scene.ts `build` opts gain `memberExtrusion`; when off, collapse all members into one `__CENTERLINE__` group rendered with a shared slim square profile
3. ViewerCanvas: subscribe flag, pass through build opts + dep array
4. MemberExtrusionToggle pill in loads toolbar (shown when model has members)
5. Verify: tsc + vitest green both packages; commit feat + docs; STATE.md quick-task row
