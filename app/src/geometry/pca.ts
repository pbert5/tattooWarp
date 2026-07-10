import * as THREE from "three";

/** Principal axis of a point cloud via power-iteration on the covariance matrix. */
export function principalAxis(positions: ArrayLike<number>): {
  origin: THREE.Vector3;
  axis: THREE.Vector3;
} {
  const n = positions.length / 3;
  const origin = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    origin.x += positions[i * 3];
    origin.y += positions[i * 3 + 1];
    origin.z += positions[i * 3 + 2];
  }
  origin.divideScalar(n);

  // Covariance matrix (symmetric 3x3).
  let xx = 0,
    xy = 0,
    xz = 0,
    yy = 0,
    yz = 0,
    zz = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - origin.x;
    const dy = positions[i * 3 + 1] - origin.y;
    const dz = positions[i * 3 + 2] - origin.z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  xx /= n;
  xy /= n;
  xz /= n;
  yy /= n;
  yz /= n;
  zz /= n;

  const cov = new THREE.Matrix3().set(xx, xy, xz, xy, yy, yz, xz, yz, zz);

  // Power iteration for dominant eigenvector.
  let v = new THREE.Vector3(1, 1, 1).normalize();
  for (let iter = 0; iter < 64; iter++) {
    const e = cov.elements;
    const nx = e[0] * v.x + e[3] * v.y + e[6] * v.z;
    const ny = e[1] * v.x + e[4] * v.y + e[7] * v.z;
    const nz = e[2] * v.x + e[5] * v.y + e[8] * v.z;
    v = new THREE.Vector3(nx, ny, nz);
    if (v.lengthSq() < 1e-20) break;
    v.normalize();
  }

  return { origin, axis: v };
}

/** Two unit vectors spanning the plane perpendicular to `axis`. */
export function perpendicularBasis(axis: THREE.Vector3): {
  u: THREE.Vector3;
  v: THREE.Vector3;
} {
  const helper =
    Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { u, v };
}
