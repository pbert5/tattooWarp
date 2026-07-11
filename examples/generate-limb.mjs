// Generates sample-forearm.obj: a synthetic tapered, gently-bent, slightly
// elliptical tube standing in for a 3D limb scan, for demo/screenshot
// purposes. Plain OBJ text, no dependencies.
//
// Scaled to sit inside the app's default camera frustum (camera at z=3,
// fov 45) since the viewer doesn't auto-frame imported meshes yet.
//
// Usage: node examples/generate-limb.mjs [output-path]
import { writeFileSync } from "node:fs";

const LENGTH = 2.0; // wrist -> elbow
const SEGMENTS_ALONG = 64;
const RADIAL_SEGMENTS = 32;
const R_WRIST = 0.28;
const R_ELBOW = 0.36;
const BEND = 0.09; // how much the centerline curves, for a non-trivial demo centerline
const ELLIPTICITY = 0.12; // radius variation by angle (forearms aren't perfect circles)

const verts = [];
const ringIndices = [];

for (let i = 0; i <= SEGMENTS_ALONG; i++) {
  const t = i / SEGMENTS_ALONG; // 0 = wrist, 1 = elbow
  const y = t * LENGTH - LENGTH / 2; // centered on origin
  // taper: ease so most growth happens near the elbow end, like a real forearm
  const radius = R_WRIST + (R_ELBOW - R_WRIST) * Math.pow(t, 1.1);
  // gentle S-bend along the length so the centerline isn't a straight line
  const bendX = BEND * Math.sin(t * Math.PI) * 0.6;
  const bendZ = BEND * Math.sin(t * Math.PI * 2) * 0.15;

  const row = [];
  for (let s = 0; s < RADIAL_SEGMENTS; s++) {
    const theta = (s / RADIAL_SEGMENTS) * Math.PI * 2;
    const ellipse = 1 + ELLIPTICITY * Math.cos(theta * 2);
    const r = radius * ellipse;
    const x = bendX + Math.cos(theta) * r;
    const z = bendZ + Math.sin(theta) * r;
    verts.push([x, y, z]);
    row.push(verts.length); // 1-indexed for OBJ
  }
  ringIndices.push(row);
}

const faces = [];
for (let i = 0; i < SEGMENTS_ALONG; i++) {
  const a = ringIndices[i];
  const b = ringIndices[i + 1];
  for (let s = 0; s < RADIAL_SEGMENTS; s++) {
    const s2 = (s + 1) % RADIAL_SEGMENTS;
    faces.push([a[s], b[s], a[s2]]);
    faces.push([b[s], b[s2], a[s2]]);
  }
}

let obj = "# sample forearm scan for TattooWarp demo/screenshots\n";
for (const [x, y, z] of verts) obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;
for (const [a, b, c] of faces) obj += `f ${a} ${b} ${c}\n`;

const outPath = process.argv[2] ?? new URL("sample-forearm.obj", import.meta.url).pathname;
writeFileSync(outPath, obj);
console.log(`wrote ${verts.length} verts, ${faces.length} faces -> ${outPath}`);
