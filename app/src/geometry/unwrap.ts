import * as THREE from "three";
import type { Centerline } from "./centerline";
import { crossSectionAt } from "./centerline";

interface UnwrapRow {
  vFrac: number;
  center: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  radii: Float32Array; // per angle sample
  /** cumulative arc length walking the loop, cumArc[0] = 0 ... cumArc[samples] = circumference */
  cumArc: Float32Array;
  circumference: number;
}

export interface UnwrapGrid {
  rows: UnwrapRow[];
  angularSamples: number;
  centerlineLength: number;
  maxCircumference: number;
}

/**
 * Builds a full surface parameterization by sampling `heightSamples` cross
 * sections along the centerline. This is the "curvature map": for every
 * (angle, height) pair it gives the true 3D surface point plus the true
 * physical arc length around the loop, which is what a flat design must be
 * resampled against to come out undistorted once wrapped.
 */
export function buildUnwrapGrid(
  mesh: THREE.Mesh,
  cl: Centerline,
  heightSamples = 48,
  angularSamples = 128,
): UnwrapGrid {
  const rows: UnwrapRow[] = [];
  let maxCircumference = 0;

  for (let i = 0; i <= heightSamples; i++) {
    const vFrac = i / heightSamples;
    const section = crossSectionAt(mesh, cl, vFrac, angularSamples);

    const points: THREE.Vector3[] = [];
    for (let j = 0; j < angularSamples; j++) {
      const theta = (j / angularSamples) * Math.PI * 2;
      const r = section.radii[j];
      points.push(
        section.center
          .clone()
          .addScaledVector(section.u, Math.cos(theta) * r)
          .addScaledVector(section.v, Math.sin(theta) * r),
      );
    }

    const cumArc = new Float32Array(angularSamples + 1);
    for (let j = 0; j < angularSamples; j++) {
      const next = points[(j + 1) % angularSamples];
      cumArc[j + 1] = cumArc[j] + points[j].distanceTo(next);
    }
    const circumference = cumArc[angularSamples];
    maxCircumference = Math.max(maxCircumference, circumference);

    rows.push({
      vFrac,
      center: section.center,
      u: section.u,
      v: section.v,
      radii: section.radii,
      cumArc,
      circumference,
    });
  }

  return { rows, angularSamples, centerlineLength: cl.length, maxCircumference };
}

function rowAt(grid: UnwrapGrid, vFrac: number): { row: UnwrapRow; nextRow: UnwrapRow; local: number } {
  const n = grid.rows.length - 1;
  const f = THREE.MathUtils.clamp(vFrac, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  return { row: grid.rows[i], nextRow: grid.rows[i + 1], local: f - i };
}

/** 3D surface point at normalized (angleFrac in [0,1), vFrac in [0,1]), assuming *uniform* angular spacing. */
export function surfacePointUniform(
  grid: UnwrapGrid,
  angleFrac: number,
  vFrac: number,
): THREE.Vector3 {
  const { row, nextRow, local } = rowAt(grid, vFrac);
  const theta = angleFrac * Math.PI * 2;
  const p1 = pointOnRow(row, theta);
  const p2 = pointOnRow(nextRow, theta);
  return p1.lerp(p2, local);
}

/** Outward unit normal at normalized (angleFrac, vFrac), for extruding a projected decal off the surface. */
export function surfaceNormalUniform(
  grid: UnwrapGrid,
  angleFrac: number,
  vFrac: number,
): THREE.Vector3 {
  const { row, nextRow, local } = rowAt(grid, vFrac);
  const center = new THREE.Vector3().lerpVectors(row.center, nextRow.center, local);
  const point = surfacePointUniform(grid, angleFrac, vFrac);
  const normal = point.clone().sub(center);
  return normal.lengthSq() > 1e-12 ? normal.normalize() : normal.set(0, 0, 1);
}

function pointOnRow(row: UnwrapRow, theta: number): THREE.Vector3 {
  const samples = row.radii.length;
  const f = (theta / (Math.PI * 2)) * samples;
  const j0 = Math.floor(f) % samples;
  const j1 = (j0 + 1) % samples;
  const local = f - Math.floor(f);
  const r = row.radii[j0] * (1 - local) + row.radii[j1] * local;
  const t = theta;
  return row.center
    .clone()
    .addScaledVector(row.u, Math.cos(t) * r)
    .addScaledVector(row.v, Math.sin(t) * r);
}

/** Given a target arc-length fraction (0..1) around row's loop, returns the corresponding angle fraction (0..1). */
function angleFracAtArcFrac(row: UnwrapRow, arcFrac: number): number {
  const targetArc = arcFrac * row.circumference;
  const cumArc = row.cumArc;
  const n = cumArc.length - 1;
  // binary search for the segment containing targetArc
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumArc[mid] < targetArc) lo = mid + 1;
    else hi = mid;
  }
  const j1 = Math.max(1, lo);
  const j0 = j1 - 1;
  const segLen = cumArc[j1] - cumArc[j0] || 1;
  const local = (targetArc - cumArc[j0]) / segLen;
  return (j0 + local) / n;
}

export interface WarpResult {
  canvas: HTMLCanvasElement;
  /** physical units (same units as the mesh) per pixel, for reference/print scale. */
  unitsPerPixel: number;
}

/**
 * Resamples `source` (the flat, as-authored design, assumed to map uniformly
 * u=[0,1)->angle, v=[0,1]->height) into the "morphed" print-ready image: the
 * flat shape you actually print so that wrapping it by physical arc length
 * reproduces the original design undistorted on the true (non-cylindrical)
 * surface. Output width = maxCircumference, rows narrower than that are
 * centered and padded transparent (showing the true printable outline).
 */
export function warpImageForSurface(
  grid: UnwrapGrid,
  source: HTMLImageElement | HTMLCanvasElement,
  pixelsPerUnit = 4,
): WarpResult {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = source.width;
  srcCanvas.height = source.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(source, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const outW = Math.max(1, Math.round(grid.maxCircumference * pixelsPerUnit));
  const outH = Math.max(1, Math.round(grid.centerlineLength * pixelsPerUnit));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d")!;
  const outData = outCtx.createImageData(outW, outH);

  for (let y = 0; y < outH; y++) {
    const vFrac = y / (outH - 1 || 1);
    const { row, nextRow, local } = rowAt(grid, vFrac);
    const circumference = row.circumference * (1 - local) + nextRow.circumference * local;
    const rowWidthPx = circumference * pixelsPerUnit;
    const xOffset = (outW - rowWidthPx) / 2;

    for (let x = 0; x < outW; x++) {
      const idx = (y * outW + x) * 4;
      const localX = x - xOffset;
      if (localX < 0 || localX >= rowWidthPx) continue; // outside the true printable shape
      const arcFrac = localX / rowWidthPx;
      const angleFrac0 = angleFracAtArcFrac(row, arcFrac);
      const angleFrac1 = angleFracAtArcFrac(nextRow, arcFrac);
      const angleFrac = angleFrac0 * (1 - local) + angleFrac1 * local;

      const sx = Math.min(
        srcCanvas.width - 1,
        Math.round(angleFrac * srcCanvas.width),
      );
      const sy = Math.min(srcCanvas.height - 1, Math.round(vFrac * srcCanvas.height));
      const sIdx = (sy * srcCanvas.width + sx) * 4;
      outData.data[idx] = srcData.data[sIdx];
      outData.data[idx + 1] = srcData.data[sIdx + 1];
      outData.data[idx + 2] = srcData.data[sIdx + 2];
      outData.data[idx + 3] = srcData.data[sIdx + 3];
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return { canvas: out, unitsPerPixel: 1 / pixelsPerUnit };
}
