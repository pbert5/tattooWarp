import { useProjectStore } from "../../state/store";

export function RightSidebar() {
  const rings = useProjectStore((s) => s.project.rings);
  const setRingT = useProjectStore((s) => s.setRingT);
  const centerline = useProjectStore((s) => s.centerline);

  return (
    <aside className="sidebar sidebar-right">
      <h3>Height / Rings</h3>
      {!centerline && <p className="hint">Import and crop a model to compute a centerline.</p>}
      {rings.map((ring) => (
        <div key={ring.id} className="ring-slider">
          <label>{ring.label}</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(ring.t * 100)}
            disabled={!centerline}
            onChange={(e) => setRingT(ring.id, Number(e.target.value) / 100)}
          />
          <span className="ring-value">{Math.round(ring.t * 100)}</span>
        </div>
      ))}
    </aside>
  );
}
