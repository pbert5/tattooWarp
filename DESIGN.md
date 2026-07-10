# TattooWarp — Design Document

## 1. Problem

A tattoo artist designs flat artwork, but it gets applied to a curved body part
(a limb). A pattern that looks correct flat will look stretched, compressed,
or misaligned once wrapped onto the limb. TattooWarp computes the actual
curvature of a scanned limb and tells the artist exactly how a flat design
needs to be pre-warped so that it reads correctly once tattooed onto the
curved surface — and it helps them lay out tiling/repeating motifs (bands,
armor scales, wrap-around patterns) so the repeats line up.

Two input modes:
- **3D mode**: a 3D scan of the limb (mesh: OBJ/STL/GLTF/PLY) is the primary
  input.
- **2D fallback mode**: no scan available — the user supplies a flat photo of
  the limb, and the app infers an approximate cylindrical/conical surface from
  outline width at each height (silhouette-based radius estimate) so the same
  pipeline still runs.

## 2. Core geometric pipeline

This is the engine underlying everything else. It runs the same way in 3D or
2D-inferred mode, because 2D mode's first step is just "build a surface mesh
that approximates the limb from a silhouette."

1. **Import** — load the scan into the viewer as a mesh.
2. **Crop** — user isolates the relevant region (e.g. just the forearm) with a
   rotate + box-crop gizmo. Every crop invalidates and recomputes step 3.
3. **Centerline extraction** — slice the cropped mesh into N horizontal bands
   along its dominant axis (found via PCA over vertex positions); take the
   centroid of each slice's cross-section boundary; fit a smooth curve (spline)
   through the centroids. This is the medial axis / "line through the center
   of mass" the user described. Rendered in red, on top of a semi-transparent
   mesh.
4. **Height selection** — a slider (0–100) parameterizes position along the
   centerline by arc length. Moving it moves a marker dot along the line.
5. **Cross-section circle** — at the selected point, take the plane
   perpendicular to the centerline's local tangent; intersect it with the
   mesh to get the true cross-section boundary; fit/measure the radius as a
   function of angle θ around that plane (not necessarily a perfect circle —
   limbs are elliptical). This ring is rendered projected onto the surface.
6. **Unwrap / curvature map** — walking the centerline from one end to the
   other, and around each cross-section by angle θ, produces a 2D
   parameterization (u = angle around circumference, v = arc length along
   centerline) with an associated radius field r(u, v). This is the
   "developable map": for every point on the flat design, it tells you the
   corresponding point on the surface, and — critically — the local
   stretch/compression factor (ratio of flat distance to true surface arc
   length), which is what a flat image must be pre-warped by so it reads
   correctly once wrapped on the limb.
7. **Warp** — given a flat design image and the u/v mapping + stretch field,
   resample the image through the inverse mapping to produce the "morphed"
   version that should be printed/stenciled, and a forward preview of what it
   looks like sitting on the 3D limb.

This pipeline is the "core" — everything else (tiling, rings, save format) is
built on top of the u/v/r(u,v) map it produces.

## 3. Application shell

Two independent side-panel documents plus one shared 3D main viewer.

```
┌───────────┬─────────────────────────────────┬───────────┐
│  Left      │        Main 3D Viewer            │  Right    │
│  sidebar   │  (mesh + centerline + crop tool)  │  sidebar  │
│  (graphics │                                   │  (height/ │
│   tree)    │                                   │   ring    │
│            │                                   │   slider) │
└───────────┴─────────────────────────────────┴───────────┘
```

- **File menu**: Open (imports a 2D graphic *or* a 3D scan — type is
  auto-detected by extension/content) → opens in the main viewer.
- Multiple "forms" (documents) can be open; each form is independently
  savable, and saved forms can be reopened side-by-side for comparison, but
  they remain separate projects (no cross-form linking).

### 3.1 Main viewer

- Renders the mesh semi-transparent; centerline drawn in a contrasting color
  (red) on top.
- Free orbit/pan/zoom.
- **Crop button** (center of viewer toolbar): enters crop mode — shows a
  rotation gizmo at the form's centroid plus a box with draggable corner/edge
  handles. `Done` commits the crop and (a) recomputes the centerline, (b)
  pushes the previous mesh state onto a crop-history stack. `Cancel` discards
  the in-progress crop. `Reset` (left of Cancel) discards *all* crops and
  restores the original import. A back-arrow (top-left of the viewer)
  pops one entry off the crop-history stack (undo last crop only, non-
  destructively — no forward/redo).
- Re-entering crop mode always crops from the current (already-cropped)
  state.

### 3.2 Right sidebar — height & rings

- A slider per active ring, 0–100 along centerline arc length.
- Each slider drives a marker dot on the centerline and a live cross-section
  circle projected onto the surface at that height.
- **Number of rings** is a top-level setting (in the left sidebar's option
  tree — see below) that spawns N equally-spaced ring definitions (Ring A,
  Ring B, Ring C, …); the right sidebar shows one slider per ring so the user
  can fine-tune each ring's exact position after the equal-spacing default.

### 3.3 Left sidebar — graphics & tiling

Hamburger icon → menu of graphics-panel-level actions (import, etc).

**Preview pane** (top of sidebar): two stacked layers per selected graphic —
top layer shows the design **unmorphed** (flat, as authored), bottom layer
shows it **morphed** (pre-warped for the current mapping). A third view
("rolled out"/"platinum" preview) shows the tiling unit laid out flat before
placement.

**Graphics tree** (below preview): one node per imported graphic (PNG/SVG or
other raster/vector asset), each expandable, draggable to reorder (z/priority
order — see collision rules below), with a small live thumbnail.

Per-graphic option tree:

- **Tiling?** toggle.
  - If **not tiling**: height slider (width auto-fits the limb's measured
    circumference at its assigned ring/height) and a tilt slider.
  - If **tiling**: see §4.
- **Ring assignment**: multi-select of which ring(s) A/B/C… this graphic
  appears on.
- **Height (in "D" units)**: how tall the element is relative to one
  ring-to-ring spacing unit ("1D"). 1 = fits exactly between two adjacent
  rings; 2 = spans one ring-spacing above and below (2D, touches both
  neighbors); 3 = full band width for a "core" wraparound element; users may
  enter any value. This gives artists a unit-free relative sizing.
  Staggered layouts allow taller elements than square layouts (see §4).
- **Layer/priority**: higher entries win collisions; used to carve out
  static ("seed") placements before the filler pattern is solved, and to
  crop lower layers where a higher layer supersedes them.
- **Sub-graphic variants** (right-click / hamburger on a node → "Add
  variant"): add alternate symbols under one tiling unit; each variant gets a
  ratio weight (e.g. A:B:C = 1:1:2 → C appears twice as often as A or B);
  placement of which variant goes where is randomized according to the
  ratio.
- **Freeform ring shapes**: a small library of parametric fills (e.g. a plain
  encircling line/band) that can be pinned to the top or bottom of a ring
  with an offset, or centered between two rings with a split offset (half
  above, half below).

## 4. Tiling engine

Inputs per tiling graphic: unit size, staggered (bool, 50% row offset),
horizontal delta (spacing baseline: touching / half-width gap / full-width
gap — plus whatever the stagger implies), rotational offset, and the
avoid/behind/overlap mode for interaction with non-tiling ("static") graphics.

Non-tiling interaction modes:
- **avoid**: static element defines a collision box (its bounding shape on
  the unwrapped ring rectangle, possibly spanning multiple rings — a
  multi-ring static element's box is the union across the rings it occupies).
  The tiling fill treats the *gaps between collision boxes along the ring's
  circumference* as independent line segments and solves the repeat pattern
  fresh within each gap, seeded outward from the boundary of the colliding
  element at the unit's normal spacing. This is the general algorithm for
  "fill whatever region remains" and is reused for filling between any two
  fixed obstacles, not just static graphics.
- **behind**: tiling pattern is generated ignoring the static element and
  simply rendered underneath it (no collision solve; static element clips
  visually on top).
- **overlap**: tiling pattern is generated ignoring the static element and
  rendered on top (static element may be visually obscured).

Layering rule across rings: an element explicitly pinned to a specific ring
(or the space between two rings, via the D-unit height) always wins against
whatever the automatic filler places there; the filler treats that
element's box as a static obstacle per the avoid/behind/overlap rule above.
Square (non-staggered) placement caps a unit at 1D tall to keep grid lines
continuous; staggered placement allows up to 2D since neighboring rows are
offset and can interlock.

## 5. Save format

A project ("form") is saved as a single archive (tar or zip) containing:

- `project.yaml` — the full option tree (crop history, centerline params,
  ring definitions, per-graphic option tree, tiling parameters, sub-graphic
  ratios) in a human-readable, diffable format.
- `model.<ext>` — the (possibly cropped) 3D scan, or the inferred 2D→3D
  surface data for 2D-fallback mode.
- `assets/` — every imported 2D graphic (PNG/SVG) referenced by the option
  tree.

Loading parses `project.yaml`, resolves asset paths, rebuilds the mesh and
option tree, and recomputes derived state (centerline, cross-sections,
unwrap maps) rather than caching them — only authoring intent is persisted.

## 6. Non-goals / open questions for later iterations

- Physically-accurate skin-stretch simulation (this app approximates with a
  developable-surface unwrap, not a soft-body sim).
- Multi-limb / branching centerlines (elbows, joints) — v1 assumes a single
  roughly-cylindrical limb segment per crop.
- Real-time collaborative editing.
- Changing "number of rings" currently regenerates ring IDs from scratch, so
  existing graphics' ring assignments are orphaned (unchecked) rather than
  remapped to the nearest new ring — fine for early-stage authoring, but
  worth fixing (stable IDs + nearest-position remap) before this is used on
  a real project with many graphics already assigned.
- Drag-and-drop placement of static (non-tiling) graphics onto the unwrapped
  surface isn't implemented; placement is a numeric angle field for now.
