import JSZip from "jszip";
import { dump, load } from "js-yaml";
import type { AssetRecord, ProjectState } from "../types/project";

interface AssetManifestEntry {
  fileName: string;
  kind: AssetRecord["kind"];
  name: string;
}

interface ProjectManifest {
  project: ProjectState;
  assetFiles: Record<string, AssetManifestEntry>;
}

const EXTENSION_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".obj": "model/obj",
  ".stl": "model/stl",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".ply": "model/ply",
};

function extensionFor(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

/** Serializes the project's option tree + model + graphic assets into a single .tw.zip archive. */
export async function saveProjectArchive(
  project: ProjectState,
  assets: Record<string, AssetRecord>,
): Promise<Blob> {
  const zip = new JSZip();
  const assetFiles: Record<string, AssetManifestEntry> = {};

  const referencedIds = new Set<string>();
  if (project.modelAssetId) referencedIds.add(project.modelAssetId);
  for (const g of project.graphics) {
    referencedIds.add(g.assetId);
    for (const v of g.variants) referencedIds.add(v.assetId);
  }

  const assetsFolder = zip.folder("assets")!;
  for (const id of referencedIds) {
    const asset = assets[id];
    if (!asset) continue;
    const ext = extensionFor(asset.name) || (asset.kind === "mesh" ? ".bin" : ".png");
    const fileName = `${id}${ext}`;
    assetsFolder.file(fileName, asset.blob);
    assetFiles[id] = { fileName, kind: asset.kind, name: asset.name };
  }

  const manifest: ProjectManifest = { project, assetFiles };
  zip.file("project.yaml", dump(manifest));

  return zip.generateAsync({ type: "blob" });
}

export interface LoadedProject {
  project: ProjectState;
  assets: Record<string, AssetRecord>;
}

/** Parses a .tw.zip archive back into project state + runtime asset records (with fresh object URLs). */
export async function loadProjectArchive(file: File | Blob): Promise<LoadedProject> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("project.yaml");
  if (!manifestFile) throw new Error("Not a TattooWarp project archive: missing project.yaml");
  const manifestText = await manifestFile.async("text");
  const manifest = load(manifestText) as ProjectManifest;

  const assets: Record<string, AssetRecord> = {};
  for (const [id, entry] of Object.entries(manifest.assetFiles)) {
    const zipEntry = zip.file(`assets/${entry.fileName}`);
    if (!zipEntry) continue;
    const ext = extensionFor(entry.fileName);
    const mime = EXTENSION_MIME[ext] ?? "application/octet-stream";
    const blob = await zipEntry.async("blob");
    const typedBlob = blob.type ? blob : new Blob([blob], { type: mime });
    assets[id] = {
      id,
      name: entry.name,
      kind: entry.kind,
      url: URL.createObjectURL(typedBlob),
      blob: typedBlob,
    };
  }

  return { project: manifest.project, assets };
}
