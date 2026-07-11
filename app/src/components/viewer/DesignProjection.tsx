import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useProjectStore } from "../../state/store";
import { crossSectionAt, type Centerline } from "../../geometry/centerline";
import { sectionCircumference } from "../../geometry/crossSection";
import { layoutTiling, type ArcObstacle } from "../../geometry/tiling";
import {
  buildUnwrapGrid,
  surfaceNormalUniform,
  surfacePointUniform,
  type UnwrapGrid,
} from "../../geometry/unwrap";
import type { GraphicNode, RingDef } from "../../types/project";

const DEFAULT_COLOR = "#e11d2a";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = parseInt(expanded, 16) || 0;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function wrap01(x: number): number {
  const w = x % 1;
  return w < 0 ? w + 1 : w;
}

interface Patch {
  key: string;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

/** More subdivisions for patches spanning a larger fraction of the surface, so a full wrap-around band curves smoothly instead of aliasing into a coarse hexagon. */
function subdivisionsFor(extent: number, max: number): number {
  return THREE.MathUtils.clamp(Math.round(extent * max), 4, max);
}

/**
 * Samples a curved rectangular patch of the unwrapped surface (following its
 * true curvature, not a flat approximation) centered at (angleCenter,
 * vCenter), and extrudes it slightly outward so it renders on top of the
 * translucent limb mesh instead of z-fighting with it.
 */
function buildPatch(
  grid: UnwrapGrid,
  angleCenter: number,
  vCenter: number,
  angleExtent: number,
  vExtent: number,
): Patch | null {
  const vMin = THREE.MathUtils.clamp(vCenter - vExtent / 2, 0, 1);
  const vMax = THREE.MathUtils.clamp(vCenter + vExtent / 2, 0, 1);
  if (vMax - vMin < 1e-6 || angleExtent <= 0) return null;

  const extrude = Math.max(grid.maxCircumference, grid.centerlineLength) * 0.0015;
  const nx = subdivisionsFor(angleExtent, 64);
  const ny = subdivisionsFor(vExtent, 32);
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uvs = new Float32Array((nx + 1) * (ny + 1) * 2);

  let vi = 0;
  let ui = 0;
  for (let j = 0; j <= ny; j++) {
    const vFrac = vMin + (vMax - vMin) * (j / ny);
    for (let i = 0; i <= nx; i++) {
      const angleFrac = wrap01(angleCenter - angleExtent / 2 + angleExtent * (i / nx));
      const point = surfacePointUniform(grid, angleFrac, vFrac);
      const normal = surfaceNormalUniform(grid, angleFrac, vFrac);
      point.addScaledVector(normal, extrude);
      positions[vi++] = point.x;
      positions[vi++] = point.y;
      positions[vi++] = point.z;
      uvs[ui++] = i / nx;
      uvs[ui++] = j / ny;
    }
  }

  const indices = new Uint16Array(nx * ny * 6);
  let ii = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + (nx + 1);
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }

  return { key: "", positions, uvs, indices };
}

function buildObstacles(ring: RingDef, graphics: GraphicNode[], circumference: number): ArcObstacle[] {
  return graphics
    .filter((g) => !g.tiling && g.ringIds.includes(ring.id))
    .map((g) => {
      const width = Math.max(0.001, g.height ?? 1);
      const centerArc = ((g.angleDeg ?? 0) / 360) * circumference;
      return { start: centerArc - width / 2, end: centerArc + width / 2 };
    });
}

/** Loads `url`, recolors every non-transparent pixel to `color` (keeping alpha), returns a texture + its aspect ratio. */
function useRecoloredTexture(url: string | undefined, color: string) {
  const [state, setState] = useState<{ texture: THREE.CanvasTexture | null; aspect: number }>({
    texture: null,
    aspect: 1,
  });

  useEffect(() => {
    if (!url) {
      setState({ texture: null, aspect: 1 });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth);
      canvas.height = Math.max(1, img.naturalHeight);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { r, g, b } = hexToRgb(color);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      setState({ texture, aspect: canvas.width / canvas.height });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, color]);

  return state;
}

interface GraphicProjectionProps {
  graphic: GraphicNode;
  assetUrl: string | undefined;
  mesh: THREE.Mesh;
  centerline: Centerline;
  grid: UnwrapGrid;
  rings: RingDef[];
  graphics: GraphicNode[];
}

function GraphicProjection({
  graphic,
  assetUrl,
  mesh,
  centerline,
  grid,
  rings,
  graphics,
}: GraphicProjectionProps) {
  const { texture, aspect } = useRecoloredTexture(assetUrl, graphic.previewColor ?? DEFAULT_COLOR);

  const patches = useMemo(() => {
    if (!texture) return [];
    const list: Patch[] = [];
    const ringSpacingFrac = rings.length > 1 ? 1 / (rings.length - 1) : 0.2;
    const assignedRings = rings.filter((r) => graphic.ringIds.includes(r.id));

    if (!graphic.tiling) {
      // Per the design: a non-tiling graphic's width always auto-fits the
      // ring's full circumference (it's a wrap-around band), only height is
      // user-controlled. angleDeg rotates where the texture's left edge
      // (u=0) starts around the ring.
      const vExtent = Math.max(graphic.heightUnitsD, 0.05) * ringSpacingFrac;
      const angleCenter = wrap01((graphic.angleDeg ?? 0) / 360 + 0.5);
      for (const ring of assignedRings) {
        const patch = buildPatch(grid, angleCenter, ring.t, 1, vExtent);
        if (patch) list.push({ ...patch, key: `${graphic.id}-${ring.id}` });
      }
    } else if (graphic.tilingOptions) {
      // unitSize is the tile's height; width follows the artwork's own aspect ratio.
      const unitHeight = graphic.tilingOptions.unitSize;
      const vExtent = THREE.MathUtils.clamp(unitHeight / grid.centerlineLength, 0.003, 1);
      for (const ring of assignedRings) {
        const section = crossSectionAt(mesh, centerline, ring.t, 128);
        const circumference = sectionCircumference(section);
        if (circumference <= 0) continue;
        const obstacles = buildObstacles(ring, graphics, circumference);
        const placements = layoutTiling({ circumference, options: graphic.tilingOptions, obstacles });
        const unitWidth = unitHeight * aspect;
        const angleExtent = THREE.MathUtils.clamp(unitWidth / circumference, 0.003, 1);
        for (const placement of placements) {
          const angleCenter = placement.position / circumference;
          const vCenter = THREE.MathUtils.clamp(
            ring.t + (placement.row === 1 ? vExtent * 0.5 : 0),
            0,
            1,
          );
          const patch = buildPatch(grid, angleCenter, vCenter, angleExtent, vExtent);
          if (patch) {
            list.push({ ...patch, key: `${graphic.id}-${ring.id}-${placement.position}-${placement.row}` });
          }
        }
      }
    }
    return list;
  }, [texture, aspect, graphic, mesh, centerline, grid, rings, graphics]);

  if (!texture) return null;

  return (
    <>
      {patches.map((patch) => (
        <mesh key={patch.key} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[patch.positions, 3]} />
            <bufferAttribute attach="attributes-uv" args={[patch.uvs, 2]} />
            <bufferAttribute attach="index" args={[patch.indices, 1]} />
          </bufferGeometry>
          <meshBasicMaterial
            map={texture}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

/**
 * Projects every graphic's actual artwork onto the limb surface (tinted per
 * its `previewColor`, default red) instead of leaving the design only
 * visible in the flat left-sidebar preview. Curved to the true surface via
 * the same unwrap grid the warp preview uses, so it sits correctly on
 * whatever shape the crop/centerline produced.
 */
export function DesignProjection() {
  const mesh = useProjectStore((s) => s.mesh);
  const centerline = useProjectStore((s) => s.centerline);
  const rings = useProjectStore((s) => s.project.rings);
  const graphics = useProjectStore((s) => s.project.graphics);
  const assets = useProjectStore((s) => s.assets);

  const grid = useMemo(() => {
    if (!mesh || !centerline) return null;
    try {
      return buildUnwrapGrid(mesh, centerline, 24, 96);
    } catch (e) {
      console.error("Failed to build unwrap grid for projection", e);
      return null;
    }
  }, [mesh, centerline]);

  if (!mesh || !centerline || !grid) return null;

  return (
    <>
      {graphics.map((g) => (
        <GraphicProjection
          key={g.id}
          graphic={g}
          assetUrl={assets[g.assetId]?.url}
          mesh={mesh}
          centerline={centerline}
          grid={grid}
          rings={rings}
          graphics={graphics}
        />
      ))}
    </>
  );
}
