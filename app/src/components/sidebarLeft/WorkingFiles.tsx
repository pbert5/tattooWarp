import { useRef, useState } from "react";
import { useProjectStore } from "../../state/store";

/**
 * Staging tray for imported artwork. Files land here first and stay here;
 * clicking one adds it to the design below as an active element. Keeping the
 * two steps apart means a file can be imported once and placed several times
 * (different rings, offsets, tiling), and importing a batch no longer floods
 * the design with elements you then have to delete.
 */
export function WorkingFiles() {
  const assets = useProjectStore((s) => s.assets);
  const addImageAsset = useProjectStore((s) => s.addImageAsset);
  const addGraphicFromAsset = useProjectStore((s) => s.addGraphicFromAsset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const images = Object.values(assets).filter((a) => a.kind === "image");

  const addFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith("image/") || /\.svg$/i.test(file.name)) {
        await addImageAsset(file);
      }
    }
  };

  return (
    <div
      className={`working-files ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="row working-files-header">
        <span className="preview-label">Working files</span>
        <button className="icon-button" title="Import artwork" onClick={() => fileRef.current?.click()}>
          +
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {images.length === 0 ? (
        <p className="hint">Drop artwork here, or use +.</p>
      ) : (
        <div className="working-files-grid">
          {images.map((asset) => (
            <button
              key={asset.id}
              className="working-file"
              title={`${asset.name} — click to add to the design`}
              onClick={() => addGraphicFromAsset(asset.id)}
            >
              <img src={asset.url} alt={asset.name} />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
