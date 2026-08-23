---
slug: member-extrusion-toggle
created: 2026-08-23
status: complete
---

# Quick Task: Member extrusion toggle — Summary

**"Profiles" toggle in the loads toolbar switches frame members between true cross-section extrusion (default) and slim centerline sticks.**

## What shipped
- `viewerStore.memberExtrusion` flag (default true) + setter
- `SceneBuilder.build` opts gain `memberExtrusion`; when off, all members collapse into one `__CENTERLINE__` bucket rendered with a shared 6 cm square profile — a single InstancedMesh wireframe
- ViewerCanvas passes the flag into build + dep array (rebuild on toggle)
- `MemberExtrusionToggle` pill mounted left of Labels; hidden for member-less models

## Commits
- `c5d992d` feat(web): Profiles toggle renders members as centerline sticks

## Verification
- `cd web && npx tsc --noEmit` clean; vitest 122/122 green
- Live HMR check at localhost:3000

## Notes
- Centerline profile is marked `approximate: true` so any APPROXIMATE banner logic stays consistent; section keys are irrelevant in this mode (single bucket), and the inspector still shows each member's real section from the store.
