import { useRef, useState } from "react";
import "./App.css";
import { useProjectStore } from "./state/store";
import { LeftSidebar } from "./components/sidebarLeft/LeftSidebar";
import { RightSidebar } from "./components/sidebarRight/RightSidebar";
import { Viewer3D } from "./components/viewer/Viewer3D";
import { loadProjectArchive, saveProjectArchive } from "./io/projectFile";

function App() {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const importModel = useProjectStore((s) => s.importModel);
  const loadProject = useProjectStore((s) => s.loadProject);
  const projectName = useProjectStore((s) => s.project.name);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProject = async () => {
    const { project, assets } = useProjectStore.getState();
    const blob = await saveProjectArchive(project, assets);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name || "project"}.tw.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenProject = async (file: File) => {
    const loaded = await loadProjectArchive(file);
    await loadProject(loaded.project, loaded.assets);
  };

  return (
    <div className="app-shell">
      <header className="menu-bar">
        <div className="menu-item-wrapper">
          <button className="menu-item" onClick={() => setFileMenuOpen((v) => !v)}>
            File
          </button>
          {fileMenuOpen && (
            <div className="dropdown-menu">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setFileMenuOpen(false);
                }}
              >
                Open model/image…
              </button>
              <button
                onClick={() => {
                  projectInputRef.current?.click();
                  setFileMenuOpen(false);
                }}
              >
                Open project…
              </button>
              <button
                onClick={() => {
                  handleSaveProject();
                  setFileMenuOpen(false);
                }}
              >
                Save project…
              </button>
            </div>
          )}
        </div>
        <span className="app-title">TattooWarp — {projectName}</span>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".obj,.stl,.gltf,.glb,.ply,image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importModel(file);
          e.target.value = "";
        }}
      />

      <input
        ref={projectInputRef}
        type="file"
        accept=".zip"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleOpenProject(file);
          e.target.value = "";
        }}
      />

      <div className="main-layout">
        <LeftSidebar />
        <Viewer3D />
        <RightSidebar />
      </div>
    </div>
  );
}

export default App;
