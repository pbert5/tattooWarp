export type NonTileMode = "avoid" | "behind" | "overlap";

export interface RingDef {
  id: string;
  label: string; // "Ring A", "Ring B", ...
  /** position along the centerline, 0..1, normalized arc length */
  t: number;
}

export interface TilingOptions {
  staggered: boolean;
  /** unit size (height in same units as the model) */
  unitSize: number;
  /** horizontal spacing baseline, in units of the tile width: 0 = touching, 0.5 = half-width gap, 1 = full-width gap */
  horizontalDelta: number;
  rotationOffset: number; // degrees
  nonTileMode: NonTileMode;
}

export interface GraphicVariant {
  id: string;
  name: string;
  assetId: string;
  ratio: number;
}

export interface GraphicNode {
  id: string;
  name: string;
  assetId: string;
  tiling: boolean;
  /** non-tiling only */
  height?: number;
  tilt?: number;
  /** non-tiling only: placement angle around the ring, degrees, used as a collision anchor for tiling fill */
  angleDeg?: number;
  /** tiling only */
  tilingOptions?: TilingOptions;
  /** which rings this graphic is assigned to */
  ringIds: string[];
  /** height in "D" units: 1 = one ring-spacing, 2 = spans a ring above+below, etc. */
  heightUnitsD: number;
  /** stacking priority; higher wins collisions */
  layer: number;
  variants: GraphicVariant[];
  /** tint used when this design is projected onto the limb in the main viewer, for visibility against the mesh */
  previewColor: string;
}

export interface CropStep {
  /** world-space center of the crop box at the time it was committed */
  center: [number, number, number];
  /** half-extents of the box along its own local axes */
  halfExtents: [number, number, number];
  /** orientation of the box */
  rotation: [number, number, number, number]; // quaternion (x,y,z,w)
}

export interface ProjectState {
  id: string;
  name: string;
  modelAssetId: string | null;
  cropHistory: CropStep[];
  numRings: number;
  rings: RingDef[];
  graphics: GraphicNode[];
}

export interface AssetRecord {
  id: string;
  name: string;
  kind: "mesh" | "image";
  /** object URL or data URL used at runtime */
  url: string;
  blob: Blob;
}
