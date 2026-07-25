import * as THREE from "three";

export interface Loop {
  points: THREE.Vector3[]; // closed polyline, world space
}

/**
 * Intersects every triangle of `geometry` with the plane (origin, normal) and
 * stitches the resulting segments into closed loops. Segments are matched by
 * shared endpoints within `epsilon`.
 */
export function sliceMeshWithPlane(
  geometry: THREE.BufferGeometry,
  planeOrigin: THREE.Vector3,
  planeNormal: THREE.Vector3,
  matrixWorld: THREE.Matrix4,
  epsilon = 1e-4,
): Loop[] {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const segments: [THREE.Vector3, THREE.Vector3][] = [];

  const triCount = index ? index.count / 3 : pos.count / 3;
  const getIndex = (i: number) => (index ? index.getX(i) : i);

  for (let t = 0; t < triCount; t++) {
    const ia = getIndex(t * 3);
    const ib = getIndex(t * 3 + 1);
    const ic = getIndex(t * 3 + 2);
    a.fromBufferAttribute(pos, ia).applyMatrix4(matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(matrixWorld);

    // Snap near-zero distances to exactly zero and treat that as "on the
    // plane". Without this, a vertex sitting within epsilon of the plane
    // satisfies neither strict-sign test, so triangles meeting at it emit no
    // segment while their neighbours do — punching a gap into the section.
    // The section then stitches into open arcs, and every consumer silently
    // closes those with a straight chord across the limb. Meshes get sliced on
    // exactly such planes routinely: scans are usually built on uniform height
    // bands, so whole rings of vertices share a height.
    const snap = (d: number) => (Math.abs(d) < epsilon ? 0 : d);
    const da = snap(plane.distanceToPoint(a));
    const db = snap(plane.distanceToPoint(b));
    const dc = snap(plane.distanceToPoint(c));

    const pts: THREE.Vector3[] = [];
    const edge = (p1: THREE.Vector3, d1: number, p2: THREE.Vector3, d2: number) => {
      // Each vertex is p1 of exactly one call, so an on-plane vertex is added
      // once — and adjacent triangles add the identical point, which is what
      // lets the stitcher chain straight through it.
      if (d1 === 0) pts.push(p1.clone());
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
        const s = d1 / (d1 - d2);
        pts.push(new THREE.Vector3().lerpVectors(p1, p2, s));
      }
    };
    edge(a, da, b, db);
    edge(b, db, c, dc);
    edge(c, dc, a, da);

    // Exactly 2 => a clean crossing. 1 => the plane only touches a vertex.
    // 3 => a fully coplanar triangle, whose neighbours already contribute the
    // boundary; taking a chord of it here would cut across the section.
    if (pts.length === 2 && pts[0].distanceTo(pts[1]) > epsilon) {
      segments.push([pts[0], pts[1]]);
    }
  }

  return stitchSegments(segments, epsilon);
}

function stitchSegments(
  segments: [THREE.Vector3, THREE.Vector3][],
  epsilon: number,
): Loop[] {
  const cell = (v: number) => Math.round(v / epsilon);
  const key = (p: THREE.Vector3) => `${cell(p.x)}_${cell(p.y)}_${cell(p.z)}`;

  // adjacency: endpoint key -> list of {segIdx, endIdx}
  const adjacency = new Map<string, { seg: number; end: 0 | 1 }[]>();
  segments.forEach((seg, i) => {
    for (const end of [0, 1] as const) {
      const k = key(seg[end]);
      const list = adjacency.get(k) ?? [];
      list.push({ seg: i, end });
      adjacency.set(k, list);
    }
  });

  /**
   * The same junction computed from two adjacent triangles differs by float
   * noise, so the two copies can land either side of a bucket boundary. Bucket
   * lookup alone therefore misses real junctions at random, and a single miss
   * ends the walk early — splitting one cross-section into open arcs that
   * `radiusProfile` then closes with a straight chord across the limb. Gather
   * the 27 surrounding buckets and match on actual distance instead.
   */
  const candidatesNear = (p: THREE.Vector3) => {
    const found: { seg: number; end: 0 | 1 }[] = [];
    const [cx, cy, cz] = [cell(p.x), cell(p.y), cell(p.z)];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = adjacency.get(`${cx + dx}_${cy + dy}_${cz + dz}`);
          if (list) found.push(...list);
        }
      }
    }
    return found;
  };

  const used = new Array(segments.length).fill(false);
  const loops: Loop[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loopPts: THREE.Vector3[] = [segments[i][0], segments[i][1]];
    let guard = 0;
    while (guard++ < segments.length + 1) {
      const tail = loopPts[loopPts.length - 1];
      const next = candidatesNear(tail).find(
        (c) => !used[c.seg] && segments[c.seg][c.end].distanceTo(tail) <= epsilon,
      );
      if (!next) break;
      used[next.seg] = true;
      const seg = segments[next.seg];
      const other = next.end === 0 ? seg[1] : seg[0];
      loopPts.push(other);
      if (other.distanceTo(loopPts[0]) <= epsilon) break;
    }
    if (loopPts.length >= 3) loops.push({ points: loopPts });
  }

  return loops;
}

/** Picks the loop with the largest enclosed area (dominant cross-section). */
export function largestLoop(loops: Loop[], normal: THREE.Vector3): Loop | null {
  if (loops.length === 0) return null;
  let best = loops[0];
  let bestArea = -Infinity;
  for (const loop of loops) {
    const area = polygonArea(loop.points, normal);
    if (area > bestArea) {
      bestArea = area;
      best = loop;
    }
  }
  return best;
}

function polygonArea(points: THREE.Vector3[], normal: THREE.Vector3): number {
  const centroid = new THREE.Vector3();
  points.forEach((p) => centroid.add(p));
  centroid.divideScalar(points.length);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i].clone().sub(centroid);
    const p2 = points[(i + 1) % points.length].clone().sub(centroid);
    area += new THREE.Vector3().crossVectors(p1, p2).dot(normal);
  }
  return Math.abs(area) / 2;
}

/** Physical circumference of a cross-section, from its sampled radius(theta) profile. */
export function sectionCircumference(section: CrossSection): number {
  let total = 0;
  const pointAt = (j: number) => {
    const theta = (j / section.samples) * Math.PI * 2;
    const r = section.radii[j % section.samples];
    return section.center
      .clone()
      .addScaledVector(section.u, Math.cos(theta) * r)
      .addScaledVector(section.v, Math.sin(theta) * r);
  };
  let prev = pointAt(0);
  for (let j = 1; j <= section.samples; j++) {
    const cur = pointAt(j);
    total += prev.distanceTo(cur);
    prev = cur;
  }
  return total;
}

export function loopCentroid(loop: Loop): THREE.Vector3 {
  const c = new THREE.Vector3();
  loop.points.forEach((p) => c.add(p));
  c.divideScalar(loop.points.length);
  return c;
}

export interface CrossSection {
  center: THREE.Vector3;
  axis: THREE.Vector3; // local surface-normal / centerline tangent at this section
  u: THREE.Vector3; // in-plane basis
  v: THREE.Vector3;
  /** radius(theta) sampled at `samples` evenly spaced angles starting at u, going toward v. */
  radii: Float32Array;
  samples: number;
}

/** Builds a radius(theta) profile for a loop about its centroid, using basis (u, v). */
export function radiusProfile(
  loop: Loop,
  center: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  samples = 128,
): Float32Array {
  // Project loop points to 2D (u,v) local coordinates, in order.
  const pts2d = loop.points.map((p) => {
    const d = p.clone().sub(center);
    return new THREE.Vector2(d.dot(u), d.dot(v));
  });

  const radii = new Float32Array(samples);
  for (let s = 0; s < samples; s++) {
    const theta = (s / samples) * Math.PI * 2;
    const dir = new THREE.Vector2(Math.cos(theta), Math.sin(theta));
    radii[s] = raycastPolygon(pts2d, dir) ?? 0;
  }
  return radii;
}

/** Casts a ray from the origin in direction `dir` against a closed 2D polyline, returns distance to first hit. */
function raycastPolygon(pts: THREE.Vector2[], dir: THREE.Vector2): number | null {
  let best: number | null = null;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const hit = rayEdgeIntersection(dir, p1, p2);
    if (hit !== null && (best === null || hit < best)) best = hit;
  }
  return best;
}

function rayEdgeIntersection(
  dir: THREE.Vector2,
  p1: THREE.Vector2,
  p2: THREE.Vector2,
): number | null {
  // Ray: origin (0,0) + t*dir, t>=0. Edge: p1 + s*(p2-p1), s in [0,1].
  // Standard ray/segment intersection (v1 = O-A, v2 = B-A, v3 = perp(dir)).
  const e = new THREE.Vector2().subVectors(p2, p1); // v2
  const denom = e.x * -dir.y + e.y * dir.x; // dot(v2, v3)
  if (Math.abs(denom) < 1e-12) return null;
  const t = (e.y * p1.x - e.x * p1.y) / denom; // ray param (cross(v2, v1) / denom, v1 = -p1)
  const s = (p1.x * dir.y - p1.y * dir.x) / denom; // segment param (dot(v1, v3) / denom)
  if (s < 0 || s > 1 || t < 0) return null;
  return t;
}
