"use client";

/**
 * MarkersLayer — combined instanced support + load glyph layer (03-08 Task 2,
 * D-07/D-05/D-06/D-09).
 *
 * Builds two instanced groups:
 *  - supports: one InstancedMesh per glyph type (buildSupportGlyph at u =
 *    markerUnit(exaggeration)), placed via supportTransforms.
 *  - loads: one InstancedMesh per load-glyph kind for the selected case
 *    (buildLoadGlyph at a = modelDiagonal * 0.035), placed via
 *    loadItemTransforms; moments/distributed handled by the pure lib.
 *
 * Rebuilds ONLY on [markersVisible, loadCaseId, model, exaggeration]; every
 * rebuild disposes the previous geometry + material (P5). Renders null when
 * markersVisible is false — supports + arrows + labels hide together (D-07).
 *
 * Support mesh objects are exposed via onSupportObjects so PickingController
 * raycasts support taps alongside member meshes.
 *
 * Mounted inside SceneContents during 03-09.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import {
  buildLoadGlyph,
  buildSupportGlyph,
  markerUnit,
  modelDiagonal,
} from "@/lib/markerGeometry";
import {
  isDistributedItem,
  isMomentItem,
  labelPoints,
  loadItemTransforms,
  supportTransforms,
  type SupportTransform,
} from "@/lib/markerFrame";
import {
  formatDistributedMagnitude,
  formatMagnitude,
  resolveLoadCaseItems,
} from "@/lib/loadCases";
import styles from "./MarkersLayer.module.css";

export interface MarkersLayerProps {
  /** Rebased node coords (rebaseModel nodeCoords) — null when no model. */
  coords: Float64Array | null;
  /** Live support group objects for PickingController raycasting. */
  onSupportObjects?: (objs: THREE.Object3D[] | null) => void;
}

const SUPPORT_COLOR_LIGHT = new THREE.Color("#636366");
const SUPPORT_COLOR_DARK = new THREE.Color("#A1A1A6");
const LOAD_COLOR = new THREE.Color("#F5A623");

function useDarkScheme(): boolean {
  return useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    [],
  );
}

export function MarkersLayer({ coords, onSupportObjects }: MarkersLayerProps) {
  const model = useModelStore((s) => s.model);
  const markersVisible = useViewerStore((s) => s.markersVisible);
  const loadCaseId = useViewerStore((s) => s.loadCaseId);
  const labelsVisible = useViewerStore((s) => s.labelsVisible);
  const exaggeration = useViewerStore((s) => s.exaggeration);
  const dark = useDarkScheme();

  const groupRef = useRef<THREE.Group>(null);
  const owned = useRef<{ geometry: THREE.BufferGeometry; material: THREE.Material }[]>([]);

  const u = markerUnit(exaggeration);
  const a = model ? modelDiagonal(model.bounds) * 0.035 : 1;

  const items = useMemo(
    () => (model && loadCaseId !== null ? resolveLoadCaseItems(model, loadCaseId) : []),
    [model, loadCaseId],
  );

  // Rebuild effect — dispose-first on every dependency change (P5).
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Dispose everything owned by a prior build.
    for (const o of owned.current) {
      o.geometry.dispose();
      o.material.dispose();
    }
    owned.current = [];
    group.clear();

    // Pre-compute the support group once and reuse for both rendering + picking.
    if (!model || !coords || !markersVisible) {
      onSupportObjects?.(null);
      return;
    }

    const coordsObj = { nodeCoords: coords };
    const supportColor = dark ? SUPPORT_COLOR_DARK : SUPPORT_COLOR_LIGHT;
    const supportGroup = new THREE.Group();

    // --- Supports: one InstancedMesh per glyph type.
    const byType = new Map<string, SupportTransform[]>();
    for (const t of supportTransforms(model, coordsObj)) {
      const arr = byType.get(t.support.type);
      if (arr) arr.push(t);
      else byType.set(t.support.type, [t]);
    }

    for (const [type, transforms] of byType) {
      const geometry = buildSupportGlyph(
        type as Parameters<typeof buildSupportGlyph>[0],
        transforms[0].support.releases,
        u,
      );
      const material = new THREE.MeshStandardMaterial({
        color: supportColor,
        flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      const m4 = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      transforms.forEach((t, i) => {
        p.set(t.position[0], t.position[1], t.position[2]);
        q.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, supportColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Support pick target: PickingController reads userData.supportNodeId.
      mesh.userData.supportNodeId = transforms[0].support.nodeId;
      supportGroup.add(mesh);
      owned.current.push({ geometry, material });
    }

    group.add(supportGroup);

    // --- Load glyphs: one InstancedMesh per glyph type for the selected case.
    if (loadCaseId !== null && items.length > 0) {
      const transforms = loadItemTransforms(model, coordsObj, items, a);
      const byGlyph = new Map<string, (typeof transforms)[number][]>();
      for (const t of transforms) {
        const key = `${t.item.kind}:${t.item.axis}:${t.item.magnitude}:${isMomentItem(t.item)}:${isDistributedItem(t.item)}`;
        const arr = byGlyph.get(key);
        if (arr) arr.push(t);
        else byGlyph.set(key, [t]);
      }

      const loadMaterial = new THREE.MeshStandardMaterial({
        color: LOAD_COLOR,
        flatShading: true,
      });
      for (const [gkey, groupTransforms] of byGlyph) {
        void gkey;
        const item = groupTransforms[0].item;
        const glyph = buildLoadGlyph(item, a, { moment: isMomentItem(item) });
        const mesh = new THREE.InstancedMesh(glyph.geometry, loadMaterial, groupTransforms.length);
        const m4 = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        groupTransforms.forEach((t, i) => {
          p.set(t.position[0], t.position[1], t.position[2]);
          q.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
          m4.compose(p, q, new THREE.Vector3(1, 1, 1));
          mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, LOAD_COLOR);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        supportGroup.add(mesh);
        owned.current.push({ geometry: glyph.geometry, material: loadMaterial });
      }
    }

    onSupportObjects?.(supportGroup.children.slice());
  }, [model, coords, markersVisible, loadCaseId, items, exaggeration, u, a, dark, onSupportObjects]);

  if (!model || !coords || !markersVisible) return null;

  const transforms = loadItemTransforms(model, { nodeCoords: coords }, items, a);
  const anchors = labelsVisible ? labelPoints(transforms, a) : [];
  const forceUnit = model.loadCases.find((c) => c.id === loadCaseId)?.forceUnit ?? model.units.force;
  const lengthUnit = model.units.length;

  return (
    <group ref={groupRef}>
      {anchors.map((l, i) => {
        let text: string;
        if (l.item.kind === "SELFWEIGHT") {
          text = "SELFWEIGHT";
        } else if (isDistributedItem(l.item)) {
          text = formatDistributedMagnitude(l.item.magnitude, forceUnit, lengthUnit);
        } else {
          text = formatMagnitude(l.item.magnitude, forceUnit);
        }
        return (
          <Html
            key={i}
            position={[l.position[0], l.position[1], l.position[2]]}
            center
            zIndexRange={[0, 0]}
          >
            <span className={styles.labelChip}>{text}</span>
          </Html>
        );
      })}
    </group>
  );
}