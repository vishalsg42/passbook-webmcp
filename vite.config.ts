import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    headers: {
      // The spec rejects registerTool/getTools/executeTool with SecurityError
      // when the agent cluster is not origin-keyed.
      'Origin-Agent-Cluster': '?1',
    },
  },
})
