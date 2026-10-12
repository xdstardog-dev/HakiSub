import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
const proxy = { '/api/asr': { target: 'http://127.0.0.1:8787', ws: true } }
export default defineConfig({
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
})
