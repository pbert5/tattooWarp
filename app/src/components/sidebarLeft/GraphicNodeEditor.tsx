import { useRef } from "react";
import type { GraphicNode, NonTileMode } from "../../types/project";
import { useProjectStore } from "../../state/store";

interface Props {
  graphic: GraphicNode;
}

export function GraphicNodeEditor({ graphic }: Props) {
  const rings = useProjectStore((s) => s.project.rings);
  const updateGraphic = useProjectStore((s) => s.updateGraphic);
  const removeGraphic = useProjectStore((s) => s.removeGraphic);
  const addGraphicVariant = useProjectStore((s) => s.addGraphicVariant);
  const addImageAsset = useProjectStore((s) => s.addImageAsset);
  const variantFileRef = useRef<HTMLInputElement>(null);
  const offset = graphic.offsetUnits ?? 0;

  const toggleRing = (ringId: string) => {
    const has = graphic.ringIds.includes(ringId);
    updateGraphic(graphic.id, {
      ringIds: has ? graphic.ringIds.filter((id) => id !== ringId) : [...graphic.ringIds, ringId],
    });
  };

  const handleVariantFile = async (file: File) => {
    const assetId = await addImageAsset(file);
    addGraphicVariant(graphic.id, assetId, file.name);
  };

  return (
    <div className="graphic-node">
      <div className="graphic-node-header">
        <span className="graphic-thumb" />
        <input
          className="graphic-name"
          value={graphic.name}
          onChange={(e) => updateGraphic(graphic.id, { name: e.target.value })}
        />
        <button className="icon-button" title="Remove" onClick={() => removeGraphic(graphic.id)}>
          ✕
        </button>
      </div>

      <label className="row">
        <input
          type="checkbox"
          checked={graphic.tiling}
          onChange={(e) => updateGraphic(graphic.id, { tiling: e.target.checked })}
        />
        Tiling
      </label>

      <label className="row" title="Tint used when this design is projected onto the limb in the main viewer">
        Projection color
        <input
          type="color"
          value={graphic.previewColor ?? "#e11d2a"}
          onChange={(e) => updateGraphic(graphic.id, { previewColor: e.target.value })}
        />
      </label>

      {!graphic.tiling ? (
        <>
          <label
            className="row"
            title="Arc this element claims around the ring, so tiling fills around it. Its drawn size is the Size slider below."
          >
            Collision width
            <input
              type="range"
              min={0.05}
              max={5}
              step={0.05}
              value={graphic.height ?? 1}
              onChange={(e) => updateGraphic(graphic.id, { height: Number(e.target.value) })}
            />
          </label>
          <label className="row">
            Tilt
            <input
              type="range"
              min={-45}
              max={45}
              value={graphic.tilt ?? 0}
              onChange={(e) => updateGraphic(graphic.id, { tilt: Number(e.target.value) })}
            />
          </label>
          <label className="row">
            Placement angle
            <input
              type="range"
              min={0}
              max={359}
              value={graphic.angleDeg ?? 0}
              onChange={(e) => updateGraphic(graphic.id, { angleDeg: Number(e.target.value) })}
            />
          </label>
        </>
      ) : (
        <TilingOptionsEditor graphic={graphic} />
      )}

      {rings.length > 1 && (
        <div className="row">
          Rings:
          <div className="ring-select">
            {rings.map((r) => (
              <label key={r.id} className="chip">
                <input
                  type="checkbox"
                  checked={graphic.ringIds.includes(r.id)}
                  onChange={() => toggleRing(r.id)}
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <label
        className="row"
        title="Distance above (+) or below (-) the ring, in model units. 0 sits inline with the ring."
      >
        Vertical offset
        <input
          type="number"
          step={0.25}
          value={offset}
          onChange={(e) => updateGraphic(graphic.id, { offsetUnits: Number(e.target.value) })}
        />
      </label>

      {/* A tiled element's size comes from the ring (perimeter / tile count),
          so this only applies to standalone ones. */}
      {!graphic.tiling && (
        <label
          className="row"
          title={
            rings.length > 1
              ? "Height in D units: 1 = one ring-to-ring spacing"
              : "Height in model units (inches on the sample limb)"
          }
        >
          Size
          <input
            type="range"
            min={0.05}
            max={rings.length > 1 ? 4 : 8}
            step={0.05}
            value={graphic.heightUnitsD}
            onChange={(e) => updateGraphic(graphic.id, { heightUnitsD: Number(e.target.value) })}
          />
          <input
            type="number"
            className="size-value"
            min={0.05}
            step={0.25}
            value={graphic.heightUnitsD}
            onChange={(e) => updateGraphic(graphic.id, { heightUnitsD: Number(e.target.value) })}
          />
        </label>
      )}

      <label className="row">
        Layer
        <input
          type="number"
          value={graphic.layer}
          onChange={(e) => updateGraphic(graphic.id, { layer: Number(e.target.value) })}
        />
      </label>

      <div className="variants">
        <div className="row">
          <span>Variants</span>
          <button className="icon-button" onClick={() => variantFileRef.current?.click()}>
            +
          </button>
          <input
            ref={variantFileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVariantFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {graphic.variants.map((v) => (
          <div key={v.id} className="row variant-row">
            <span>{v.name}</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={v.ratio}
              onChange={(e) => {
                const ratio = Number(e.target.value);
                updateGraphic(graphic.id, {
                  variants: graphic.variants.map((vv) => (vv.id === v.id ? { ...vv, ratio } : vv)),
                });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TilingOptionsEditor({ graphic }: Props) {
  const updateGraphic = useProjectStore((s) => s.updateGraphic);
  const opts = graphic.tilingOptions;
  if (!opts) return null;

  const set = (patch: Partial<typeof opts>) =>
    updateGraphic(graphic.id, { tilingOptions: { ...opts, ...patch } });
  // Older projects carry an absolute unitSize instead; 8 matches tileMetrics' default.
  const tileCount = Math.max(1, Math.round(opts.tileCount ?? 8));

  return (
    <div className="tiling-options">
      <label
        className="row"
        title="Rows of tiles stacked up from the ring, each half a tile higher and interlocked with the last. 1 = a single row."
      >
        Stagger layers
        <input
          type="number"
          min={1}
          step={1}
          value={opts.staggerLayers ?? (opts.staggered ? 2 : 1)}
          onChange={(e) => set({ staggerLayers: Math.max(1, Math.round(Number(e.target.value))) })}
        />
      </label>
      <label
        className="row"
        title="How many tiles go around the ring. Tile width is the ring's perimeter divided by this, so the repeat always closes on itself."
      >
        Tiles around
        <input
          type="range"
          min={1}
          max={60}
          step={1}
          value={tileCount}
          onChange={(e) => set({ tileCount: Number(e.target.value) })}
        />
        <input
          type="number"
          className="size-value"
          min={1}
          step={1}
          value={tileCount}
          onChange={(e) => set({ tileCount: Math.max(1, Math.round(Number(e.target.value))) })}
        />
      </label>
      <label
        className="row"
        title="Gap between tiles, as a fraction of tile width: 0 = touching, 0.5 = a half-width gap, 1 = a full-width gap. Tile count stays fixed, so spacing trades mark size for gap."
      >
        Spacing
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={opts.horizontalDelta ?? 0}
          onChange={(e) => set({ horizontalDelta: Number(e.target.value) })}
        />
        <input
          type="number"
          className="size-value"
          min={0}
          step={0.05}
          value={opts.horizontalDelta ?? 0}
          onChange={(e) => set({ horizontalDelta: Math.max(0, Number(e.target.value)) })}
        />
      </label>
      <label className="row" title="Spins the repeat around the ring, in element radii: 1 = half a tile">
        Rotational offset (r)
        <input
          type="number"
          step={0.1}
          value={opts.rotationOffset}
          onChange={(e) => set({ rotationOffset: Number(e.target.value) })}
        />
      </label>
      <label className="row">
        Non-tile elements
        <select
          value={opts.nonTileMode}
          onChange={(e) => set({ nonTileMode: e.target.value as NonTileMode })}
        >
          <option value="avoid">Avoid</option>
          <option value="behind">Behind</option>
          <option value="overlap">Overlap</option>
        </select>
      </label>
    </div>
  );
}
