import { create } from "zustand";
import * as THREE from "three";
import type {
  AssetRecord,
  CropStep,
  GraphicNode,
  ProjectState,
  RingDef,
  TilingOptions,
} from "../types/project";
import { extractCenterline, type Centerline } from "../geometry/centerline";
import { classifyFile, inferMeshFromImage, loadMeshFile } from "../io/meshLoader";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const RING_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function defaultTilingOptions(): TilingOptions {
  return {
    staggered: false,
    unitSize: 1,
    horizontalDelta: 0,
    rotationOffset: 0,
    nonTileMode: "avoid",
  };
}

function equallySpacedRings(n: number): RingDef[] {
  const rings: RingDef[] = [];
  for (let i = 0; i < n; i++) {
    rings.push({
      id: uid("ring"),
      label: `Ring ${RING_LABELS[i] ?? i + 1}`,
      t: n === 1 ? 0.5 : i / (n - 1),
    });
  }
  return rings;
}

interface TattooWarpState {
  project: ProjectState;
  assets: Record<string, AssetRecord>;

  /** Runtime-only (not persisted directly; derived from project + assets on load). */
  baseGeometry: THREE.BufferGeometry | null;
  mesh: THREE.Mesh | null;
  centerline: Centerline | null;

  cropMode: boolean;
  selectedGraphicId: string | null;

  importModel: (file: File) => Promise<void>;
  addImageAsset: (file: File) => Promise<string>;
  importGraphic: (file: File) => Promise<void>;
  loadProject: (project: ProjectState, assets: Record<string, AssetRecord>) => Promise<void>;

  enterCropMode: () => void;
  cancelCropMode: () => void;
  commitCrop: (step: CropStep) => void;
  undoLastCrop: () => void;
  resetCrops: () => void;

  setNumRings: (n: number) => void;
  setRingT: (ringId: string, t: number) => void;

  addGraphicVariant: (graphicId: string, assetId: string, name: string) => void;
  updateGraphic: (graphicId: string, patch: Partial<GraphicNode>) => void;
  removeGraphic: (graphicId: string) => void;
  selectGraphic: (graphicId: string | null) => void;

  recomputeCenterline: () => void;
}

function newProject(): ProjectState {
  const rings = equallySpacedRings(1);
  return {
    id: uid("project"),
    name: "Untitled",
    modelAssetId: null,
    cropHistory: [],
    numRings: 1,
    rings,
    graphics: [],
  };
}

export function applyCropStepsToGeometry(
  base: THREE.BufferGeometry,
  steps: CropStep[],
): THREE.BufferGeometry {
  if (steps.length === 0) return base;
  const pos = base.attributes.position;
  const kept: number[] = [];

  const passesAllCrops = (p: THREE.Vector3) => {
    for (const step of steps) {
      const q = new THREE.Quaternion(...step.rotation);
      const center = new THREE.Vector3(...step.center);
      const half = new THREE.Vector3(...step.halfExtents);
      const local = p.clone().sub(center).applyQuaternion(q.clone().invert());
      if (
        local.x < -half.x ||
        local.y < -half.y ||
        local.z < -half.z ||
        local.x > half.x ||
        local.y > half.y ||
        local.z > half.z
      ) {
        return false;
      }
    }
    return true;
  };

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    // Keep the triangle if any vertex survives (avoids punching holes right at the crop boundary).
    if (passesAllCrops(a) || passesAllCrops(b) || passesAllCrops(c)) {
      kept.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export const useProjectStore = create<TattooWarpState>((set, get) => ({
  project: newProject(),
  assets: {},
  baseGeometry: null,
  mesh: null,
  centerline: null,
  cropMode: false,
  selectedGraphicId: null,

  async importModel(file: File) {
    const kind = classifyFile(file);
    const geometry =
      kind === "image" ? await inferMeshFromImage(file) : await loadMeshFile(file);
    const assetId = uid("asset");
    const asset: AssetRecord = {
      id: assetId,
      name: file.name,
      kind: "mesh",
      url: URL.createObjectURL(file),
      blob: file,
    };
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

    set((s) => ({
      assets: { ...s.assets, [assetId]: asset },
      project: { ...s.project, modelAssetId: assetId, cropHistory: [] },
      baseGeometry: geometry,
      mesh,
    }));
    get().recomputeCenterline();
  },

  async loadProject(project: ProjectState, assets: Record<string, AssetRecord>) {
    let baseGeometry: THREE.BufferGeometry | null = null;
    let mesh: THREE.Mesh | null = null;

    if (project.modelAssetId) {
      const asset = assets[project.modelAssetId];
      if (asset) {
        const file = new File([asset.blob], asset.name, { type: asset.blob.type });
        const kind = classifyFile(file);
        baseGeometry = kind === "image" ? await inferMeshFromImage(file) : await loadMeshFile(file);
        const cropped = applyCropStepsToGeometry(baseGeometry, project.cropHistory);
        mesh = new THREE.Mesh(cropped, new THREE.MeshStandardMaterial());
      }
    }

    set({ project, assets, baseGeometry, mesh, cropMode: false, selectedGraphicId: null });
    get().recomputeCenterline();
  },

  async addImageAsset(file: File) {
    const assetId = uid("asset");
    const asset: AssetRecord = {
      id: assetId,
      name: file.name,
      kind: "image",
      url: URL.createObjectURL(file),
      blob: file,
    };
    set((s) => ({ assets: { ...s.assets, [assetId]: asset } }));
    return assetId;
  },

  async importGraphic(file: File) {
    const assetId = await get().addImageAsset(file);
    const graphic: GraphicNode = {
      id: uid("graphic"),
      name: file.name,
      assetId,
      tiling: false,
      height: 1,
      tilt: 0,
      angleDeg: 0,
      ringIds: get().project.rings.map((r) => r.id),
      heightUnitsD: 1,
      layer: get().project.graphics.length,
      variants: [],
    };
    set((s) => ({
      project: { ...s.project, graphics: [...s.project.graphics, graphic] },
      selectedGraphicId: graphic.id,
    }));
  },

  enterCropMode: () => set({ cropMode: true }),
  cancelCropMode: () => set({ cropMode: false }),

  commitCrop: (step: CropStep) => {
    const { baseGeometry, project } = get();
    if (!baseGeometry) return;
    const cropHistory = [...project.cropHistory, step];
    const geometry = applyCropStepsToGeometry(baseGeometry, cropHistory);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    set({
      project: { ...project, cropHistory },
      mesh,
      cropMode: false,
    });
    get().recomputeCenterline();
  },

  undoLastCrop: () => {
    const { baseGeometry, project } = get();
    if (!baseGeometry || project.cropHistory.length === 0) return;
    const cropHistory = project.cropHistory.slice(0, -1);
    const geometry = applyCropStepsToGeometry(baseGeometry, cropHistory);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    set({ project: { ...project, cropHistory }, mesh });
    get().recomputeCenterline();
  },

  resetCrops: () => {
    const { baseGeometry, project } = get();
    if (!baseGeometry) return;
    const mesh = new THREE.Mesh(baseGeometry, new THREE.MeshStandardMaterial());
    set({ project: { ...project, cropHistory: [] }, mesh });
    get().recomputeCenterline();
  },

  setNumRings: (n: number) => {
    const clamped = Math.max(1, Math.min(12, Math.round(n)));
    const rings = equallySpacedRings(clamped);
    set((s) => ({ project: { ...s.project, numRings: clamped, rings } }));
  },

  setRingT: (ringId: string, t: number) => {
    set((s) => ({
      project: {
        ...s.project,
        rings: s.project.rings.map((r) =>
          r.id === ringId ? { ...r, t: THREE.MathUtils.clamp(t, 0, 1) } : r,
        ),
      },
    }));
  },

  addGraphicVariant: (graphicId: string, assetId: string, name: string) => {
    set((s) => ({
      project: {
        ...s.project,
        graphics: s.project.graphics.map((g) =>
          g.id === graphicId
            ? {
                ...g,
                variants: [...g.variants, { id: uid("variant"), name, assetId, ratio: 1 }],
              }
            : g,
        ),
      },
    }));
  },

  updateGraphic: (graphicId: string, patch: Partial<GraphicNode>) => {
    set((s) => ({
      project: {
        ...s.project,
        graphics: s.project.graphics.map((g) =>
          g.id === graphicId
            ? {
                ...g,
                ...patch,
                tilingOptions:
                  patch.tiling && !g.tilingOptions
                    ? defaultTilingOptions()
                    : (patch.tilingOptions ?? g.tilingOptions),
              }
            : g,
        ),
      },
    }));
  },

  removeGraphic: (graphicId: string) => {
    set((s) => ({
      project: {
        ...s.project,
        graphics: s.project.graphics.filter((g) => g.id !== graphicId),
      },
      selectedGraphicId: s.selectedGraphicId === graphicId ? null : s.selectedGraphicId,
    }));
  },

  selectGraphic: (graphicId: string | null) => set({ selectedGraphicId: graphicId }),

  recomputeCenterline: () => {
    const { mesh } = get();
    if (!mesh) {
      set({ centerline: null });
      return;
    }
    try {
      const centerline = extractCenterline(mesh, 40);
      set({ centerline });
    } catch (e) {
      console.error("Failed to extract centerline", e);
      set({ centerline: null });
    }
  },
}));
