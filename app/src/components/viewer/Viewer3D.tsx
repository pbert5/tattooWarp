import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useProjectStore } from "../../state/store";
import { crossSectionAt } from "../../geometry/centerline";
import { CropGizmo, type CropGizmoHandle, type CropMode } from "./CropGizmo";
import { TilingPreview } from "./TilingPreview";

function CenterlineOverlay() {
  const centerline = useProjectStore((s) => s.centerline);
  if (!centerline || centerline.points.length < 2) return null;
  return <Line points={centerline.points} color="red" lineWidth={2} />;
}

function RingCircles() {
  const mesh = useProjectStore((s) => s.mesh);
  const centerline = useProjectStore((s) => s.centerline);
  const rings = useProjectStore((s) => s.project.rings);

  const loops = useMemo(() => {
    if (!mesh || !centerline) return [];
    return rings.map((ring) => {
      const section = crossSectionAt(mesh, centerline, ring.t, 64);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= section.samples; i++) {
        const theta = (i / section.samples) * Math.PI * 2;
        const r = section.radii[i % section.samples];
        pts.push(
          section.center
            .clone()
            .addScaledVector(section.u, Math.cos(theta) * r)
            .addScaledVector(section.v, Math.sin(theta) * r),
        );
      }
      return { id: ring.id, points: pts, center: section.center };
    });
  }, [mesh, centerline, rings]);

  return (
    <>
      {loops.map((loop) => (
        <group key={loop.id}>
          <Line points={loop.points} color="#22d3ee" lineWidth={2} />
          <mesh position={loop.center}>
            <sphereGeometry args={[Math.max(0.002, 0.01)]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function MeshView() {
  const mesh = useProjectStore((s) => s.mesh);
  if (!mesh) return null;
  return (
    <primitive object={mesh}>
      <meshStandardMaterial
        attach="material"
        color="#c9c9c9"
        transparent
        opacity={0.45}
        side={THREE.DoubleSide}
      />
    </primitive>
  );
}

export function Viewer3D() {
  const mesh = useProjectStore((s) => s.mesh);
  const cropMode = useProjectStore((s) => s.cropMode);
  const enterCropMode = useProjectStore((s) => s.enterCropMode);
  const cancelCropMode = useProjectStore((s) => s.cancelCropMode);
  const commitCrop = useProjectStore((s) => s.commitCrop);
  const undoLastCrop = useProjectStore((s) => s.undoLastCrop);
  const resetCrops = useProjectStore((s) => s.resetCrops);
  const cropHistoryLength = useProjectStore((s) => s.project.cropHistory.length);

  const [cropSubMode, setCropSubMode] = useState<CropMode>("translate");
  const gizmoRef = useRef<CropGizmoHandle>(null);

  const handleDone = () => {
    const step = gizmoRef.current?.commit();
    if (step) commitCrop(step);
  };

  return (
    <div className="viewer">
      <div className="viewer-toolbar viewer-toolbar-top-left">
        <button
          title="Undo last crop"
          disabled={cropHistoryLength === 0}
          onClick={undoLastCrop}
        >
          ← Undo crop
        </button>
      </div>

      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        {mesh && <MeshView />}
        <CenterlineOverlay />
        <RingCircles />
        <TilingPreview />
        {cropMode && mesh && (
          <CropGizmo ref={gizmoRef} mesh={mesh} mode={cropSubMode} />
        )}
        <OrbitControls makeDefault enabled={!cropMode} />
      </Canvas>

      <div className="viewer-toolbar viewer-toolbar-bottom">
        {!cropMode ? (
          <button disabled={!mesh} onClick={enterCropMode}>
            Crop
          </button>
        ) : (
          <div className="crop-toolbar">
            <div className="crop-modes">
              <button
                className={cropSubMode === "translate" ? "active" : ""}
                onClick={() => {
                  setCropSubMode("translate");
                  gizmoRef.current?.setMode("translate");
                }}
              >
                Move
              </button>
              <button
                className={cropSubMode === "rotate" ? "active" : ""}
                onClick={() => {
                  setCropSubMode("rotate");
                  gizmoRef.current?.setMode("rotate");
                }}
              >
                Rotate
              </button>
              <button
                className={cropSubMode === "scale" ? "active" : ""}
                onClick={() => {
                  setCropSubMode("scale");
                  gizmoRef.current?.setMode("scale");
                }}
              >
                Resize
              </button>
            </div>
            <div className="crop-actions">
              <button disabled={cropHistoryLength === 0} onClick={resetCrops}>
                Reset
              </button>
              <button onClick={cancelCropMode}>Cancel</button>
              <button className="primary" onClick={handleDone}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
