"use client";

/**
 * PickingController — throttled raycast hover + tap selection (03-07 Task 3,
 * D-14, UI-SPEC PickingController row).
 *
 * Raycasts pointer-move hover at 8 Hz (125 ms) via createHoverThrottle, then
 * drives ColorLayer's imperative applyHover. Pointer-up decides tap vs drag:
 *  - dragDistanceExceeded (>6px since pointer-down) → OrbitControls grab, no tap
 *  - NO_TAP guard: >2 moves within a 500 ms window suppresses taps until a
 *    pointer-up with no intervening move (shouldRegisterTap)
 *  - a deliberate tap raycasts meshes + support markers → select(id, 'member'|
 *    'support'); miss → clearSelection()
 *
 * Hover cleared on pointer-leave, wheel/scroll, and selection change.
 *
 * Mounted inside SceneContents during 03-09.
 */
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useViewerStore } from "@/store/viewerStore";
import {
  createHoverThrottle,
  createNoTapGuard,
  dragDistanceExceeded,
  pointDistance,
  shouldRegisterTap,
} from "@/lib/picking";
import type { ColorLayerHandle } from "./ColorLayer";

export interface PickingControllerProps {
  meshes: THREE.InstancedMesh[];
  instanceToMember: Map<number, number>;
  /** Support marker objects raycastable alongside member meshes. */
  supportObjects: THREE.Object3D[];
  colorLayerRef: React.RefObject<ColorLayerHandle | null>;
}

interface PickTarget {
  instanceId: number | null;
  memberId: number | null;
  supportNodeId: number | null;
}

function raycastPoint(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  targets: THREE.Object3D[],
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): THREE.Intersection[] {
  const ndcX = (clientX / width) * 2 - 1;
  const ndcY = -(clientY / height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  return raycaster.intersectObjects(targets, false);
}

export function PickingController({
  meshes,
  instanceToMember,
  supportObjects,
  colorLayerRef,
}: PickingControllerProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const select = useViewerStore((s) => s.select);
  const clearSelection = useViewerStore((s) => s.clearSelection);

  const throttleRef = useRef(createHoverThrottle(125));
  const noTapRef = useRef(createNoTapGuard(500, 2));
  const downPoint = useRef<{ x: number; y: number } | null>(null);
  const hadMoveSinceLastUp = useRef(false);
  const hoveredRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());

  const supportTargets = useRef(supportObjects);
  supportTargets.current = supportObjects;

  const resolveMember = (intersection: THREE.Intersection): PickTarget => {
    const mesh = intersection.object as THREE.InstancedMesh;
    const instanceId = intersection.instanceId ?? null;
    const memberId = instanceId === null ? null : instanceToMember.get(instanceId) ?? null;
    return { instanceId, memberId, supportNodeId: null };
  };

  const resolveSupport = (intersection: THREE.Intersection): PickTarget | null => {
    const obj = intersection.object as THREE.Object3D;
    const nodeId = Number((obj.userData as { supportNodeId?: number }).supportNodeId);
    if (Number.isFinite(nodeId)) return { instanceId: null, memberId: null, supportNodeId: nodeId };
    return null;
  };

  const raycastAll = (
    clientX: number,
    clientY: number,
  ): { intersection: THREE.Intersection; support: boolean } | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    raycaster.current.near = 0.01;
    raycaster.current.far = 10000;

    const memberHits = raycastPoint(raycaster.current, camera, meshes, clientX, clientY, width, height);
    if (memberHits.length > 0) return { intersection: memberHits[0], support: false };

    const supportHits = raycastPoint(
      raycaster.current,
      camera,
      supportTargets.current,
      clientX,
      clientY,
      width,
      height,
    );
    if (supportHits.length > 0) return { intersection: supportHits[0], support: true };

    return null;
  };

  const applyHover = (instanceId: number | null): void => {
    if (instanceId === hoveredRef.current) return;
    hoveredRef.current = instanceId;
    colorLayerRef.current?.applyHover(instanceId);
  };

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerMove = (e: PointerEvent): void => {
      hadMoveSinceLastUp.current = true;
      const now = performance.now();
      noTapRef.current.move(now);
      if (!throttleRef.current.shouldFire(now)) return;
      const hit = raycastAll(e.clientX, e.clientY);
      if (hit && !hit.support) {
        const target = resolveMember(hit.intersection);
        applyHover(target.instanceId);
      } else {
        applyHover(null);
      }
    };

    const onPointerDown = (e: PointerEvent): void => {
      downPoint.current = { x: e.clientX, y: e.clientY };
      hadMoveSinceLastUp.current = false;
    };

    const onPointerUp = (e: PointerEvent): void => {
      const down = downPoint.current;
      downPoint.current = null;
      const pxMoved =
        down === null ? 0 : pointDistance(down.x, down.y, e.clientX, e.clientY);

      if (dragDistanceExceeded(pxMoved, 6)) {
        hadMoveSinceLastUp.current = false;
        return;
      }
      if (!shouldRegisterTap(noTapRef.current, hadMoveSinceLastUp.current)) return;
      hadMoveSinceLastUp.current = false;

      const hit = raycastAll(e.clientX, e.clientY);
      if (!hit) {
        clearSelection();
        return;
      }
      if (hit.support) {
        const target = resolveSupport(hit.intersection);
        if (target) {
          select(target.supportNodeId!, "support");
          return;
        }
      }
      const target = resolveMember(hit.intersection);
      if (target.memberId !== null) {
        select(target.memberId, "member");
      } else {
        clearSelection();
      }
    };

    const onPointerLeave = (): void => {
      applyHover(null);
      hadMoveSinceLastUp.current = false;
    };

    const onWheel = (): void => {
      applyHover(null);
    };

    const onTouchStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (t) downPoint.current = { x: t.clientX, y: t.clientY };
      hadMoveSinceLastUp.current = false;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const changed = e.changedTouches[0];
      if (changed) onPointerUp({ clientX: changed.clientX, clientY: changed.clientY } as PointerEvent);
    };

    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointerleave", onPointerLeave);
    dom.addEventListener("wheel", onWheel);
    dom.addEventListener("touchstart", onTouchStart);
    dom.addEventListener("touchend", onTouchEnd);
    return () => {
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("touchstart", onTouchStart);
      dom.removeEventListener("touchend", onTouchEnd);
    };
  }, [camera, gl, meshes, instanceToMember, select, clearSelection, colorLayerRef]);

  // Clear hover on selection change (UI-SPEC: hover cleared on selection change).
  const selectedId = useViewerStore((s) => s.selectedId);
  useEffect(() => {
    applyHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return null;
}
