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
    // An agent's in-app browser cannot reach localhost, so testing there means
    // tunnelling the dev server. Vite rejects requests whose Host header it
    // does not recognise, which a tunnel always changes.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.trycloudflare.com'],
  },
})
