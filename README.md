# tattooWarp

An app for pre-warping flat tattoo designs to match a scanned limb's true
curvature, and for laying out tiling/repeating motifs that wrap correctly
around it.

- [`DESIGN.md`](./DESIGN.md) — full design spec (geometry pipeline, UI layout,
  tiling engine, save format).
- [`app/`](./app) — the React + Three.js implementation. See below to run it.

## Running the app

```sh
cd app
npm install
npm run dev
```

Then use **File → Open model/image…** to import a 3D scan (OBJ/STL/GLTF/GLB/PLY)
or a flat limb photo (2D-fallback mode infers an approximate surface from the
silhouette). Crop to the region of interest, then use the right sidebar's ring
sliders to pick cross-sections and the left sidebar to import and configure
tattoo graphics.