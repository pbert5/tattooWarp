import { useMemo } from "react";
import * as THREE from "three";
import { useProjectStore } from "../../state/store";
import { crossSectionAt } from "../../geometry/centerline";
import { sectionCircumference, type CrossSection } from "../../geometry/crossSection";
import { layoutTiling, type ArcObstacle } from "../../geometry/tiling";
import type { GraphicNode, RingDef } from "../../types/project";

const PALETTE = ["#22d3ee", "#f97316", "#a78bfa", "#34d399", "#f472b6", "#facc15"];

function colorForGraphic(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function pointOnSection(section: CrossSection, angleFrac: number): THREE.Vector3 {
  const samples = section.samples;
  const f = angleFrac * samples;
  const j0 = Math.floor(f) % samples;
  const j1 = (j0 + 1) % samples;
  const local = f - Math.floor(f);
  const r = section.radii[j0] * (1 - local) + section.radii[j1] * local;
  const theta = angleFrac * Math.PI * 2;
  return section.center
    .clone()
    .addScaledVector(section.u, Math.cos(theta) * r)
    .addScaledVector(section.v, Math.sin(theta) * r);
}

function buildObstacles(
  ring: RingDef,
  graphics: GraphicNode[],
  circumference: number,
): ArcObstacle[] {
  return graphics
    .filter((g) => !g.tiling && g.ringIds.includes(ring.id))
    .map((g) => {
      const width = Math.max(0.001, g.height ?? 1);
      const centerArc = ((g.angleDeg ?? 0) / 360) * circumference;
      return { start: centerArc - width / 2, end: centerArc + width / 2 };
    });
}

export function TilingPreview() {
  const mesh = useProjectStore((s) => s.mesh);
  const centerline = useProjectStore((s) => s.centerline);
  const rings = useProjectStore((s) => s.project.rings);
  const graphics = useProjectStore((s) => s.project.graphics);

  const markers = useMemo(() => {
    if (!mesh || !centerline) return [];
    const tilingGraphics = graphics.filter((g) => g.tiling && g.tilingOptions);
    const out: { key: string; point: THREE.Vector3; color: string }[] = [];

    for (const ring of rings) {
      const section = crossSectionAt(mesh, centerline, ring.t, 128);
      const circumference = sectionCircumference(section);
      const obstacles = buildObstacles(ring, graphics, circumference);

      for (const graphic of tilingGraphics) {
        if (!graphic.ringIds.includes(ring.id)) continue;
        const placements = layoutTiling({
          circumference,
          options: graphic.tilingOptions!,
          obstacles,
        });
        const color = colorForGraphic(graphics.indexOf(graphic));
        for (const placement of placements) {
          const angleFrac = placement.position / circumference;
          const point = pointOnSection(section, angleFrac);
          if (placement.row === 1) {
            point.addScaledVector(section.axis, graphic.tilingOptions!.unitSize * 0.5);
          }
          out.push({ key: `${ring.id}-${graphic.id}-${placement.position}-${placement.row}`, point, color });
        }
      }
    }
    return out;
  }, [mesh, centerline, rings, graphics]);

  return (
    <>
      {markers.map((m) => (
        <mesh key={m.key} position={m.point}>
          <sphereGeometry args={[0.006, 8, 8]} />
          <meshBasicMaterial color={m.color} />
        </mesh>
      ))}
    </>
  );
}
