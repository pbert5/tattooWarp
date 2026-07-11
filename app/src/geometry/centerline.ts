import * as THREE from "three";
import { principalAxis, perpendicularBasis } from "./pca";
import {
  sliceMeshWithPlane,
  largestLoop,
  loopCentroid,
  radiusProfile,
  type CrossSection,
} from "./crossSection";

export interface Centerline {
  /** Points from one end of the limb to the other, in order. */
  points: THREE.Vector3[];
  /** Unit tangent at each point. */
  tangents: THREE.Vector3[];
  /** Cumulative arc length at each point (points[0] => 0). */
  arcLength: number[];
  /** Total arc length. */
  length: number;
}

const ANGULAR_SAMPLES = 128;

/**
 * Extracts the centerline of `mesh` by slicing it into `slices` bands along
 * its PCA-derived dominant axis and taking the centroid of the dominant loop
 * at each slice.
 */
export function extractCenterline(mesh: THREE.Mesh, slices = 40): Centerline {
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  const posAttr = geometry.attributes.position;

  // World-space positions for PCA (matches sliceMeshWithPlane, which also works in world space).
  const worldPositions = new Float32Array(posAttr.count * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    tmp.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    worldPositions[i * 3] = tmp.x;
    worldPositions[i * 3 + 1] = tmp.y;
    worldPositions[i * 3 + 2] = tmp.z;
  }

  const { origin, axis } = principalAxis(worldPositions);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < worldPositions.length / 3; i++) {
    const p = new THREE.Vector3(
      worldPositions[i * 3],
      worldPositions[i * 3 + 1],
      worldPositions[i * 3 + 2],
    );
    const t = p.clone().sub(origin).dot(axis);
    if (t < min) min = t;
    if (t > max) max = t;
  }

  const points: THREE.Vector3[] = [];
  for (let s = 0; s <= slices; s++) {
    // Half-step sampling plus a small irrational-ish per-slice nudge keeps
    // slicing planes off any grid the mesh's own triangulation might happen
    // to share (e.g. a scan resampled onto uniform height bands), which
    // otherwise makes the plane exactly coplanar with a full ring of
    // vertices and corrupts the triangle/plane intersection stitching below.
    const nudge = 1e-3 * Math.sin(s * 12.9898);
    const t = min + (max - min) * ((s + 0.5) / (slices + 1) + nudge);
    const planeOrigin = origin.clone().addScaledVector(axis, t);
    const loops = sliceMeshWithPlane(geometry, planeOrigin, axis, mesh.matrixWorld);
    const loop = largestLoop(loops, axis);
    if (loop) points.push(loopCentroid(loop));
  }

  if (points.length < 2) {
    // Degenerate mesh (or a slice missed): fall back to the raw PCA axis.
    return buildFromPoints([
      origin.clone().addScaledVector(axis, min),
      origin.clone().addScaledVector(axis, max),
    ]);
  }

  return buildFromPoints(smoothCentroids(points));
}

/**
 * Per-slice centroids are noisy: a cutting plane perpendicular to the single
 * straight PCA axis meets a curved/bent limb surface at a shifted angle away
 * from that axis, so consecutive centroids zigzag even though the true
 * medial axis is smooth. A spline *through* the raw centroids doesn't help —
 * it still passes through every noisy point. Laplacian-smooth the centroids
 * first (averaging each toward its neighbors, endpoints anchored) to
 * actually reduce that noise, then resample with a Catmull-Rom spline for an
 * evenly-spaced smooth curve — this is the "smooth curve through the
 * centroids" the design calls for.
 */
function smoothCentroids(points: THREE.Vector3[]): THREE.Vector3[] {
  if (points.length < 4) return points;
  let pts = points.map((p) => p.clone());
  const iterations = 8;
  const blend = 0.5;
  for (let iter = 0; iter < iterations; iter++) {
    pts = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const neighborAvg = new THREE.Vector3()
        .addVectors(pts[i - 1], pts[i + 1])
        .multiplyScalar(0.5);
      return p.clone().lerp(neighborAvg, blend);
    });
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  return curve.getPoints(pts.length * 3);
}

function buildFromPoints(points: THREE.Vector3[]): Centerline {
  const tangents: THREE.Vector3[] = [];
  const arcLength: number[] = [0];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    tangents.push(next.clone().sub(prev).normalize());
    if (i > 0) arcLength.push(arcLength[i - 1] + points[i].distanceTo(points[i - 1]));
  }
  return { points, tangents, arcLength, length: arcLength[arcLength.length - 1] };
}

/** Position + tangent at normalized arc-length parameter t in [0,1]. */
export function sampleCenterline(
  cl: Centerline,
  t: number,
): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const target = THREE.MathUtils.clamp(t, 0, 1) * cl.length;
  let i = 0;
  while (i < cl.arcLength.length - 2 && cl.arcLength[i + 1] < target) i++;
  const segLen = cl.arcLength[i + 1] - cl.arcLength[i] || 1;
  const local = (target - cl.arcLength[i]) / segLen;
  const point = new THREE.Vector3().lerpVectors(cl.points[i], cl.points[i + 1], local);
  const tangent = new THREE.Vector3()
    .lerpVectors(cl.tangents[i], cl.tangents[i + 1], local)
    .normalize();
  return { point, tangent };
}

/** Cross-section (radius profile) of `mesh` at normalized arc-length t along `cl`. */
export function crossSectionAt(
  mesh: THREE.Mesh,
  cl: Centerline,
  t: number,
  samples = ANGULAR_SAMPLES,
): CrossSection {
  const { point, tangent } = sampleCenterline(cl, t);
  const { u, v } = perpendicularBasis(tangent);
  const loops = sliceMeshWithPlane(mesh.geometry, point, tangent, mesh.matrixWorld);
  const loop = largestLoop(loops, tangent);
  const center = loop ? loopCentroid(loop) : point;
  const radii = loop
    ? radiusProfile(loop, center, u, v, samples)
    : new Float32Array(samples).fill(0);
  return { center, axis: tangent, u, v, radii, samples };
}
