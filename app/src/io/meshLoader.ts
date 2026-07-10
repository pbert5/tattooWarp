import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const MESH_EXTS = ["obj", "stl", "gltf", "glb", "ply"];

export type ImportKind = "mesh" | "image" | "unknown";

export function classifyFile(file: File): ImportKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (MESH_EXTS.includes(ext)) return "mesh";
  if (IMAGE_EXTS.includes(ext) || file.type.startsWith("image/")) return "image";
  return "unknown";
}

/** Loads a 3D scan file into a single merged BufferGeometry (non-indexed triangles, position only). */
export async function loadMeshFile(file: File): Promise<THREE.BufferGeometry> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = await file.arrayBuffer();

  switch (ext) {
    case "stl": {
      const loader = new STLLoader();
      return loader.parse(buffer);
    }
    case "ply": {
      const loader = new PLYLoader();
      return loader.parse(buffer);
    }
    case "obj": {
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader();
      const group = loader.parse(text);
      return mergeGroupGeometry(group);
    }
    case "gltf":
    case "glb": {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buffer, "");
      return mergeGroupGeometry(gltf.scene);
    }
    default:
      throw new Error(`Unsupported 3D file type: .${ext}`);
  }
}

function mergeGroupGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  const positions: number[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geom = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
      const posAttr = geom.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 2D-fallback mode: infers an approximate cylindrical/tapered surface from a
 * flat limb photo by measuring the silhouette width at each scanline
 * (assumes a roughly front-lit limb against a plain background — pixels
 * darker/lighter than the background threshold are "limb"). Produces a
 * revolved mesh whose radius per height equals half the measured width, i.e.
 * a best-effort surface for the same centerline/cross-section pipeline to
 * run against.
 */
export async function inferMeshFromImage(
  file: File,
  options: { radialSegments?: number; backgroundThreshold?: number } = {},
): Promise<THREE.BufferGeometry> {
  const { radialSegments = 48, backgroundThreshold = 0.12 } = options;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Estimate background luminance from the four corners.
  const luminanceAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };
  const corners = [
    luminanceAt(0, 0),
    luminanceAt(width - 1, 0),
    luminanceAt(0, height - 1),
    luminanceAt(width - 1, height - 1),
  ];
  const bgLuminance = corners.reduce((a, b) => a + b, 0) / corners.length;

  const widths: number[] = [];
  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      const isForeground = Math.abs(luminanceAt(x, y) - bgLuminance) > backgroundThreshold;
      if (isForeground) {
        if (left === -1) left = x;
        right = x;
      }
    }
    widths.push(left === -1 ? 0 : right - left);
  }

  // Build a ring per scanline row (subsampled) as a surface of revolution.
  const rowStep = Math.max(1, Math.floor(height / 200));
  const rows: { y: number; radius: number }[] = [];
  for (let y = 0; y < height; y += rowStep) {
    rows.push({ y, radius: Math.max(1, widths[y] / 2) });
  }

  const positions: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const ringPoint = (rowIdx: number, seg: number) => {
    const row = rows[rowIdx];
    const theta = (seg / radialSegments) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(theta) * row.radius,
      -(row.y - height / 2), // image y-down -> model y-up
      Math.sin(theta) * row.radius,
    );
  };

  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = ringPoint(r, s);
      const b = ringPoint(r, (s + 1) % radialSegments);
      const c = ringPoint(r + 1, s);
      const d = ringPoint(r + 1, (s + 1) % radialSegments);
      pushTri(a, b, c);
      pushTri(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
