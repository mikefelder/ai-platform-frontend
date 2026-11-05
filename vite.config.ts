import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev: proxy /api/* to mock server on port 3001
// Production: nginx authenticates /api and adds the server-only APIM key
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
