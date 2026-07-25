export type NonTileMode = "avoid" | "behind" | "overlap";

export interface RingDef {
  id: string;
  label: string; // "Ring A", "Ring B", ...
  /** position along the centerline, 0..1, normalized arc length */
  t: number;
}

export interface TilingOptions {
  /** rows of tiles stacked up from the ring; alternate rows interleave by half a tile. 1 = a single row */
  staggerLayers: number;
  /** @deprecated superseded by staggerLayers; only read when loading older project files */
  staggered?: boolean;
  /**
   * How many tiles go around the ring. This is what sets a tile's physical
   * size: width = circumference / tileCount, so the repeat always closes on
   * itself rather than leaving a seam wherever the ring's measurement lands.
   */
  tileCount: number;
  /** @deprecated superseded by tileCount; only read when loading older project files */
  unitSize?: number;
  /** horizontal spacing baseline, in units of the tile width: 0 = touching, 0.5 = half-width gap, 1 = full-width gap */
  horizontalDelta: number;
  /** spin of the whole repeat around the ring, in element radii (unitSize / 2) */
  rotationOffset: number;
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
  /**
   * Vertical offset from its ring, in model units (inches for the sample
   * limb). 0 places the graphic inline with the ring; the ring is the anchor
   * and everything else is positioned against it.
   */
  offsetUnits: number;
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
