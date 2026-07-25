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
          <label className="row">
            Height
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

      <label className="row">
        Height (D units)
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={graphic.heightUnitsD}
          onChange={(e) => updateGraphic(graphic.id, { heightUnitsD: Number(e.target.value) })}
        />
      </label>

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

  return (
    <div className="tiling-options">
      <label className="row">
        <input
          type="checkbox"
          checked={opts.staggered}
          onChange={(e) => set({ staggered: e.target.checked })}
        />
        Staggered
      </label>
      <label className="row">
        Unit size
        <input
          type="range"
          min={0.05}
          max={2}
          step={0.05}
          value={opts.unitSize}
          onChange={(e) => set({ unitSize: Number(e.target.value) })}
        />
      </label>
      <label className="row">
        Horizontal delta
        <select
          value={opts.horizontalDelta}
          onChange={(e) => set({ horizontalDelta: Number(e.target.value) })}
        >
          <option value={0}>Touching (0)</option>
          <option value={0.5}>Half-width gap</option>
          <option value={1}>Full-width gap</option>
        </select>
      </label>
      <label className="row">
        Rotational offset
        <input
          type="number"
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
