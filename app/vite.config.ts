import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built bundle also works loaded via file://
  // from within the packaged Electron app, not just from a web server root.
  base: './',
})
