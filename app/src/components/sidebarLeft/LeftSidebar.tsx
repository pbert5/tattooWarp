import { useRef, useState } from "react";
import { useProjectStore } from "../../state/store";
import { GraphicNodeEditor } from "./GraphicNodeEditor";
import { PreviewPane } from "./PreviewPane";
import { WorkingFiles } from "./WorkingFiles";

export function LeftSidebar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const graphics = useProjectStore((s) => s.project.graphics);
  const numRings = useProjectStore((s) => s.project.numRings);
  const setNumRings = useProjectStore((s) => s.setNumRings);
  const importGraphic = useProjectStore((s) => s.importGraphic);
  const selectedGraphicId = useProjectStore((s) => s.selectedGraphicId);
  const selectGraphic = useProjectStore((s) => s.selectGraphic);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="sidebar sidebar-left">
      <div className="sidebar-header">
        <button className="icon-button hamburger" onClick={() => setMenuOpen((v) => !v)}>
          ☰
        </button>
        <span className="sidebar-title">Graphics</span>
      </div>

      {menuOpen && (
        <div className="dropdown-menu">
          <button onClick={() => fileRef.current?.click()}>Import graphic…</button>
          <div className="row">
            Number of rings
            <input
              type="number"
              min={1}
              max={12}
              value={numRings}
              onChange={(e) => setNumRings(Number(e.target.value))}
            />
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importGraphic(file);
          e.target.value = "";
        }}
      />

      <WorkingFiles />

      <PreviewPane />

      <span className="preview-label">Active elements</span>
      <div className="graphics-tree">
        {graphics.length === 0 && (
          <p className="hint">Click a working file above to add it to the design.</p>
        )}
        {graphics
          .slice()
          .sort((a, b) => b.layer - a.layer)
          .map((g) => (
            <div
              key={g.id}
              className={`graphic-tree-item ${selectedGraphicId === g.id ? "selected" : ""}`}
              onClick={() => selectGraphic(g.id)}
            >
              <GraphicNodeEditor graphic={g} />
            </div>
          ))}
      </div>
    </aside>
  );
}
