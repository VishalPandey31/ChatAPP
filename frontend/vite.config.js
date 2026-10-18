import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const timestamp = Date.now();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-v${timestamp}-[hash].js`,
        chunkFileNames: `assets/[name]-v${timestamp}-[hash].js`,
        assetFileNames: `assets/[name]-v${timestamp}-[hash].[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react') || id.includes('react-icons')) {
              return 'vendor-icons';
            }
            if (id.includes('@vladmandic/face-api')) {
              return 'vendor-faceapi';
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})

