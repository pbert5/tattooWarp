import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built bundle also works loaded via file://
  // from within the packaged Electron app, not just from a web server root.
  base: './',
  // Remote-dev mode (`nix run`): listen on all interfaces and skip Vite's
  // DNS-rebinding host check, so reaching the dev server by hostname/tailnet
  // name works. Local `npm run dev` keeps the safe localhost-only defaults.
  server: process.env.TATTOOWARP_REMOTE ? { host: true, allowedHosts: true } : {},
})
