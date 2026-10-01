import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

import { createApiApp } from './server/app'

/**
 * Front e backend no mesmo projeto e, em desenvolvimento, no mesmo processo e
 * na mesma porta: as rotas `/api` entram como middleware do Vite antes do
 * fallback para o index.html do React.
 *
 * Em produção o `server/index.ts` faz o mesmo trabalho servindo `dist/`, então
 * o servidor também publica um único site.
 */
function quizArenaApi(): PluginOption {
  return {
    name: 'quiz-arena:api',
    configureServer(server) {
      server.middlewares.use(createApiApp())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiApp())
    },
  }
}

export default defineConfig({
  plugins: [react(), quizArenaApi()],
  server: {
    // Necesário para que o histórico de rotas do SPA continue funcionando em produção.
    port: 6767,
  },
})