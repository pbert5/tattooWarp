import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Demo mode (`nix run .#demo`): preload the sample limb and motifs. The flag is
// inlined at build time, so a normal build drops this branch and its assets.
if (import.meta.env.VITE_TATTOOWARP_DEMO) {
  import('./demo').then((m) => m.loadDemo()).catch((e) => console.error('demo load failed', e))
}
