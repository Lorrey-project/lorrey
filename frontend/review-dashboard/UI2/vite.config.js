import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// HTTP-only local development — no SSL
export default defineConfig({
  plugins: [react()],
  server: {
    https: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true
      }
    }
  }
})
