// Asserts that slicing the sample limb yields one *closed* loop per cross
// section. Open arcs are the failure that matters: nothing downstream detects
// them, and `radiusProfile` silently closes an arc with a straight chord —
// which pulls the surface up to a full radius inside the limb, corrupting the
// projected design, the ring circumference and the printed size with it.
//
// Usage (from the repo root, no build step needed):
//   node --experimental-strip-types examples/check-cross-sections.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire, registerHooks } from "node:module";

// The app's sources import each other extensionless ("./pca"), which Vite
// resolves and bare Node does not. Retry those as .ts so this check can run
// the real modules straight from source.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !path.extname(spec)) {
      try {
        return next(`${spec}.ts`, ctx);
      } catch {
        /* fall through to the original specifier */
      }
    }
    return next(spec, ctx);
  },
});

const EX = path.dirname(fileURLToPath(import.meta.url));
const appRequire = createRequire(path.join(EX, "..", "app", "package.json"));
const THREE = appRequire("three");
const { OBJLoader } = appRequire("three/examples/jsm/loaders/OBJLoader.js");

const { sliceMeshWithPlane, largestLoop } = await import(
  path.join(EX, "..", "app", "src", "geometry", "crossSection.ts")
);
const { extractCenterline, sampleCenterline } = await import(
  path.join(EX, "..", "app", "src", "geometry", "centerline.ts")
);

const obj = new OBJLoader().parse(readFileSync(path.join(EX, "sample-forearm.obj"), "utf8"));
let mesh = null;
obj.traverse((o) => {
  if (o.isMesh && !mesh) mesh = o;
});
assert.ok(mesh, "sample-forearm.obj contained no mesh");
mesh.updateMatrixWorld(true);

// Slice on exactly the planes the app uses: buildUnwrapGrid samples the
// centerline at t = i/24, and whether a given plane stitches cleanly comes down
// to float noise at the junctions, so the planes have to be the real ones.
const centerline = extractCenterline(mesh, 40);
const SLICES = 24;
const broken = [];

for (let i = 0; i <= SLICES; i++) {
  const t = i / SLICES;
  const { point, tangent } = sampleCenterline(centerline, t);
  const loops = sliceMeshWithPlane(mesh.geometry, point, tangent, mesh.matrixWorld);
  const loop = largestLoop(loops, tangent);
  assert.ok(loop, `slice ${i} (t=${t.toFixed(3)}) produced no loop at all`);

  const pts = loop.points;
  const gap = pts[0].distanceTo(pts[pts.length - 1]);
  // A closed section of this limb is ~65 points; a shattered one is a fragment.
  if (gap > 1e-3 || pts.length < 32 || loops.length > 1) {
    broken.push({
      slice: i,
      t: +t.toFixed(3),
      loops: loops.length,
      points: pts.length,
      gap: +gap.toFixed(4),
    });
  }
}

assert.deepEqual(
  broken,
  [],
  `${broken.length}/${SLICES + 1} cross sections failed to close:\n${broken
    .slice(0, 10)
    .map((b) => JSON.stringify(b))
    .join("\n")}`,
);
console.log(`ok — all ${SLICES + 1} cross sections closed into a single loop`);
