// Demo bootstrap: loads the sample limb and a couple of basic motifs so the
// app opens on something to look at instead of an empty viewer. Loaded only
// when VITE_TATTOOWARP_DEMO is set (`nix run .#demo`) — the import is behind
// a compile-time flag, so these assets never reach a normal build.
//
// It drives the same store actions the File menu does, taking the example
// files in as `File` objects, so there's no second import path to keep in
// sync with the real one.
import limbUrl from "../../examples/sample-forearm.obj?url";
import circleUrl from "../../examples/basic-circle.svg?url";
import diamondUrl from "../../examples/tiling-diamond.svg?url";
import { useProjectStore } from "./state/store";

async function fileFrom(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`demo asset ${name}: ${res.status}`);
  const blob = await res.blob();
  // Keep the MIME type: assets are shown via URL.createObjectURL, and an
  // untyped blob URL won't render as an <img>.
  return new File([blob], name, { type: blob.type });
}

export async function loadDemo() {
  const store = useProjectStore.getState();

  await store.importModel(await fileFrom(limbUrl, "sample-forearm.obj"));

  // One ring, at mid-limb: it is the anchor everything else is placed against.
  // The circle sits inline with it and the diamonds a few inches above, which
  // is the placement model in miniature. Both tile — a non-tiling graphic
  // stretches to fit the whole circumference, turning a circle into a wide
  // ellipse.
  const ring = useProjectStore.getState().project.rings[0];
  store.setRingT(ring.id, 0.5);

  for (const [url, name, offsetUnits] of [
    [circleUrl, "basic-circle.svg", 0],
    [diamondUrl, "tiling-diamond.svg", 3],
  ] as const) {
    await store.importGraphic(await fileFrom(url, name));
    const id = useProjectStore.getState().selectedGraphicId;
    if (id) store.updateGraphic(id, { tiling: true, offsetUnits });
  }
}
