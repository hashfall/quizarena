import express, { type Express } from 'express'
import cors from 'cors'

import { config } from './config'
import { carregarSessao } from './lib/sessao'
import { tratadorDeErros } from './lib/http'
import { rotasAdmin } from './routes/admin.routes'
import { rotasAuth } from './routes/auth.routes'
import { rotasQuiz } from './routes/quiz.routes'

/**
 * Cria a aplicação da API. O mesmo app é usado em duas situações:
 *
 * - desenvolvimento: como middleware do Vite (mesma porta do front);
 * - produção: no servidor Node, que também serve o `dist`.
 *
 * Assim existe um único site e uma única porta nos dois casos.
 */
export function createApiApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '32kb' }))
  app.use(carregarSessao)

  app.use('/api/auth', rotasAuth)
  app.use('/api/quiz', rotasQuiz)
  app.use('/api/admin', rotasAdmin)

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'Endpoint não encontrado.' })
  })

  app.use(tratadorDeErros)

  return app
}

export { config }