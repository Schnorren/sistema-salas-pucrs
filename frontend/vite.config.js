import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Mantemos apenas a sincronia de porta, SEM o proxy
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: true,
  }
})