
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/generate-historical-event': {
        target: 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-historical-event',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/generate-historical-event/, ''),
        headers: {
          // Do not include any authorization headers here, they will be added by the client
        }
      }
    }
  }
})
