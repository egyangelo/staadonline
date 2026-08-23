"use client";

/**
 * ViewerCanvas (02-05, REND-03/REND-05): the sole React-facing surface of
 * the 3D scene — an R3F `<Canvas>` hosting the SceneBuilder output, with
 * D-01 camera auto-fit on load + resize and drei OrbitControls for touch and
 * mouse (REND-05). Chrome-free by design (D-12); page.tsx (02-07) owns the
 * layout and overlay.
 *
 * Lifecycle rules (ARCHITECTURE.md): a SceneBuilder instance is created ONCE
 * per model identity (write-once modelStore); a new model disposes the old
 * builder then rebuilds; exaggeration changes re-apply the uniform geometry
 * scale WITHOUT a rebuild (D-04); empty/loading states tear the group down.
 * Fit fires only on model change and window resize — never inside a user
 * gesture frame (T-02-05).
 *
 * PITFALLS P5: dpr capped at 2, no shadows, no extra MSAA (flat material),
 * dispose-on-replace/unmount — the mobile fill-rate budget is protected.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { computeCameraFit, rebaseModel, SceneBuilder, type SceneBuildResult } from "@/lib/scene";
import { useModelStore } from "@/store/modelStore";
import { useViewerStore } from "@/store/viewerStore";
import { ColorLayer, type ColorLayerHandle } from "./ColorLayer";
import { PickingController } from "./PickingController";
import { MarkersLayer } from "./MarkersLayer";

/** Debounced resize fit: at most one rAF per resize burst (T-02-05). */
function useResizeFit(fit: () => void) {
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitRef.current();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}

function SceneContents() {
  const status = useModelStore((s) => s.status);
  const model = useModelStore((s) => s.model);
  const exaggeration = useViewerStore((s) => s.exaggeration);
  const plateThickness = useViewerStore((s) => s.plateThickness);
  const camera = useThree((s) => s.camera);

  const groupRef = useRef<THREE.Group>(null);
  const sceneRef = useRef<SceneBuilder | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const bounds = useRef<{ min: [number, number, number]; max: [number, number, number] } | null>(null);
  const exaggerationRef = useRef(exaggeration);
  exaggerationRef.current = exaggeration;

  // 03-09: scene result + interaction layers (ColorLayer/PickingController/
  // MarkersLayer) are driven by the resolved SceneBuildResult.
  const [sceneResult, setSceneResult] = useState<SceneBuildResult | null>(null);
  // Member meshes only — the plate surface mesh renders in the scene but
  // stays out of the instance-color / picking path (PLATE-02).
  const memberMeshes = sceneResult
    ? sceneResult.meshes.filter((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh)
    : [];
  const [supportObjects, setSupportObjects] = useState<THREE.Object3D[]>([]);
  const colorLayerRef = useRef<ColorLayerHandle | null>(null);

  const handleSupportObjects = useCallback((objs: THREE.Object3D[] | null) => {
    setSupportObjects(objs ?? []);
  }, []);

  // Rebased node coords (rebaseModel nodeCoords) for marker placement.
  const coords = useMemo(() => (model ? rebaseModel(model).nodeCoords : null), [model]);

  const dark = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, []);

  const fitCamera = useCallback(
    (b: { min: [number, number, number]; max: [number, number, number] }) => {
      const fit = computeCameraFit(b);
      camera.position.set(fit.position[0], fit.position[1], fit.position[2]);
      camera.near = fit.near;
      camera.far = Math.max(fit.far, camera.position.distanceTo(new THREE.Vector3(...fit.target)) * 2);
      camera.updateProjectionMatrix();

      const controls = controlsRef.current;
      if (controls) {
        const radius = new THREE.Vector3(...b.max).sub(new THREE.Vector3(...b.min)).length() / 2 || 1;
        controls.target.set(fit.target[0], fit.target[1], fit.target[2]);
        controls.minDistance = radius * 0.1;
        controls.maxDistance = radius * 4;
        controls.update();
      }
    },
    [camera],
  );

  const fitLoaded = useCallback(() => {
    if (bounds.current) fitCamera(bounds.current);
  }, [fitCamera]);

  useResizeFit(fitLoaded);

  // Build lifecycle — runs ONLY on model identity / status changes.
  useEffect(() => {
    // Tear down anything from the previous model (P5 dispose-on-replace).
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    const group = groupRef.current;
    if (group) {
      for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i];
        child.removeFromParent();
        if (child instanceof THREE.InstancedMesh) child.dispose();
      }
    }
    bounds.current = null;
    setSceneResult(null);
    setSupportObjects([]);

    if (status !== "ready" || !model) return;

    const builder = new SceneBuilder();
    sceneRef.current = builder;
    let alive = true;

    builder
      .build(model, exaggerationRef.current, { plateThickness })
      .then((result) => {
      if (!alive) return;
      if (groupRef.current) {
        result.meshes.forEach((mesh) => groupRef.current!.add(mesh));
      }
      bounds.current = result.rebasedBounds;
      setSceneResult(result);
      fitCamera(result.rebasedBounds);
    });

    return () => {
      alive = false;
      builder.dispose();
      sceneRef.current = null;
      bounds.current = null;
      setSceneResult(null);
      setSupportObjects([]);
    };
  }, [model, status, fitCamera, plateThickness]);

  // Exaggeration change — geometry-scale reapply, never a rebuild (D-04).
  useEffect(() => {
    if (status !== "ready") return;
    sceneRef.current?.setExaggeration(exaggeration);
  }, [exaggeration, status]);

  return (
    <>
      <hemisphereLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} />
      <group ref={groupRef} />
      {sceneResult ? (
        <>
          <ColorLayer
            ref={colorLayerRef}
            meshes={memberMeshes}
            instanceToMember={sceneResult.instanceToMember}
            theme={dark ? "dark" : "light"}
          />
          <PickingController
            meshes={memberMeshes}
            instanceToMember={sceneResult.instanceToMember}
            supportObjects={supportObjects}
            colorLayerRef={colorLayerRef}
          />
          <MarkersLayer coords={coords} onSupportObjects={handleSupportObjects} />
        </>
      ) : null}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableZoom
        target={[0, 0, 0]}
      />
    </>
  );
}

export function ViewerCanvas() {
  const dpr = useMemo(
    () => Math.min(typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, 2),
    [],
  );

  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      className="viewer-canvas"
      camera={{ fov: 45, near: 0.1, far: 10000, position: [10, 10, 10] }}
      dpr={dpr}
      gl={{ antialias: false }}
    >
      <SceneContents />
    </Canvas>
  );
}