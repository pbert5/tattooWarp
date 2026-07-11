import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../state/store";
import { buildUnwrapGrid, warpImageForSurface } from "../../geometry/unwrap";

export function PreviewPane() {
  const mesh = useProjectStore((s) => s.mesh);
  const centerline = useProjectStore((s) => s.centerline);
  const graphics = useProjectStore((s) => s.project.graphics);
  const selectedGraphicId = useProjectStore((s) => s.selectedGraphicId);
  const assets = useProjectStore((s) => s.assets);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("");

  const selected = graphics.find((g) => g.id === selectedGraphicId) ?? null;
  const asset = selected ? assets[selected.assetId] : null;

  const grid = useMemo(() => {
    if (!mesh || !centerline) return null;
    try {
      return buildUnwrapGrid(mesh, centerline, 32, 96);
    } catch (e) {
      console.error("Failed to build unwrap grid", e);
      return null;
    }
  }, [mesh, centerline]);

  useEffect(() => {
    if (!grid || !asset || !canvasRef.current) {
      setStatus(!mesh ? "Import a model" : !centerline ? "Crop to compute a centerline" : !asset ? "Select a graphic" : "");
      return;
    }
    const img = new Image();
    img.onload = () => {
      // pixelsPerUnit assumes the mesh's world units directly, so a fixed
      // constant produces a near-blank few-pixel-wide canvas for meshes
      // authored in meters (or an enormous one for millimeters). Scale it
      // from the surface's actual circumference so the preview always comes
      // out at a legible resolution regardless of source unit convention.
      const targetPreviewWidthPx = 256;
      const pixelsPerUnit =
        grid.maxCircumference > 0
          ? Math.min(4000, Math.max(4, targetPreviewWidthPx / grid.maxCircumference))
          : 4;
      const result = warpImageForSurface(grid, img, pixelsPerUnit);
      const ctx = canvasRef.current!.getContext("2d")!;
      canvasRef.current!.width = result.canvas.width;
      canvasRef.current!.height = result.canvas.height;
      ctx.clearRect(0, 0, result.canvas.width, result.canvas.height);
      ctx.drawImage(result.canvas, 0, 0);
      setStatus("");
    };
    img.src = asset.url;
  }, [grid, asset, mesh, centerline]);

  return (
    <div className="preview-pane">
      <div className="preview-layer">
        <span className="preview-label">Unmorphed</span>
        {asset ? (
          <img className="preview-image" src={asset.url} alt="unmorphed design" />
        ) : (
          <div className="preview-placeholder" />
        )}
      </div>
      <div className="preview-layer">
        <span className="preview-label">Morphed</span>
        <canvas ref={canvasRef} className="preview-image" />
        {status && <p className="hint">{status}</p>}
      </div>
    </div>
  );
}
