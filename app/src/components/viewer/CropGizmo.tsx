import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";
import type { CropStep } from "../../types/project";

export type CropMode = "translate" | "rotate" | "scale";

export interface CropGizmoHandle {
  commit: () => CropStep | null;
  setMode: (mode: CropMode) => void;
}

interface Props {
  mesh: THREE.Mesh;
  mode: CropMode;
}

/** Lives inside the R3F <Canvas>: a draggable/rotatable/resizable crop box. */
export const CropGizmo = forwardRef<CropGizmoHandle, Props>(function CropGizmo(
  { mesh, mode: initialMode },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const [mode, setMode] = useState<CropMode>(initialMode);

  const { center, size } = useMemo(() => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const c = new THREE.Vector3();
    box.getCenter(c);
    const s = new THREE.Vector3();
    box.getSize(s);
    return { center: c, size: s };
  }, [mesh]);

  useImperativeHandle(ref, () => ({
    setMode,
    commit: () => {
      const group = groupRef.current;
      if (!group) return null;
      return {
        center: [group.position.x, group.position.y, group.position.z],
        halfExtents: [
          (size.x / 2) * group.scale.x,
          (size.y / 2) * group.scale.y,
          (size.z / 2) * group.scale.z,
        ],
        rotation: [
          group.quaternion.x,
          group.quaternion.y,
          group.quaternion.z,
          group.quaternion.w,
        ],
      };
    },
  }));

  return (
    <>
      <group ref={groupRef} position={center}>
        <mesh>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshBasicMaterial color="#ff5050" wireframe />
        </mesh>
      </group>
      {groupRef.current && <TransformControls object={groupRef.current} mode={mode} />}
    </>
  );
});
