import { existsSync } from 'node:fs'
import { join } from 'node:path'

import express from 'express'

import { createApiApp } from './app'
import { config } from './config'
import { hojeISO } from './lib/datas'
import { obterFirestore } from './firebase'
import { iniciarCronDoScriptDiario } from './jobs/cron'
import { garantirQuizDeHoje } from './services/sorteio.service'

/**
 * Servidor de produção: serve a API (`/api`) e o build do Vite (`dist`) na
 * mesma porta. É o site único do projeto.
 */
async function iniciar(): Promise<void> {
  const app = createApiApp()

  if (!existsSync(config.distDir)) {
    console.error(`Pasta ${config.distDir} não encontrada. Rode "npm run build" antes de iniciar.`)
    process.exit(1)
  }

  app.use(express.static(config.distDir))

  // Qualquer rota que não seja arquivo físico cai no index.html do React.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(config.distDir, 'index.html'))
  })

  app.listen(config.porta, '0.0.0.0', () => {
    console.log(`[quiz-arena] site e API no ar em http://localhost:${config.porta}`)
    console.log(`[quiz-arena] ambiente: ${config.isProducao ? 'produção' : 'desenvolvimento'}`)
  })

  iniciarCronDoScriptDiario()

  // Verifica a conexão e garante que já exista quiz para hoje, para o primeiro
  // acesso não ficar sem questões.
  try {
    obterFirestore()
    const quiz = await garantirQuizDeHoje()
    console.log(`[quiz-arena] quiz de ${hojeISO()} com ${quiz.questoes.length} questão(ões).`)
  } catch (erro) {
    console.error('[quiz-arena] não foi possível preparar o quiz de hoje:', erro)
  }
}

iniciar().catch((erro: unknown) => {
  console.error('[quiz-arena] falha ao iniciar o servidor:', erro)
  process.exit(1)
})