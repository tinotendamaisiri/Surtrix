import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The Firebase web key only accepts requests from localhost:5173.
  server: { port: 5173, strictPort: true },
})
