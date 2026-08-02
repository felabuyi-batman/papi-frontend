import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // SPA history fallback so /auth/callback works on refresh / email verify redirect.
  appType: 'spa',
  server: {
    watch: {
      // macOS FSEvents silently fail for this dev-server process, so file edits
      // were never picked up and the server kept serving stale modules until it
      // was restarted. Polling is slightly heavier but always sees changes.
      usePolling: true,
      interval: 300,
    },
    // Same-origin API in dev — SpeechC mounts routes under /api already.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
