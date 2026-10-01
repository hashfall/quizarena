import { Router } from 'express'
import { z } from 'zod'

import { hojeISO } from '../lib/datas'
import { corpo, rota } from '../lib/http'
import { exigirSessao } from '../lib/sessao'
import { montarEstadoDaRodada, pesquisarJogadores } from '../services/quiz.service'
import { registrarResposta } from '../services/respostas.service'

const esquemaResposta = z.object({
  questaoId: z.string().min(1, 'Informe a questão.'),
  resposta: z.string().trim().min(1, 'Escreva a resposta.').max(120),
  tempoDeResposta: z.number().int().min(0).max(86_400).optional(),
})

const esquemaPesquisa = z.object({
  q: z.string().trim().max(40).optional(),
})

export const rotasQuiz = Router()

/**
 * GET /api/quiz/rodada
 *
 * "Buscar questões do dia (7 questões)": devolve o estado completo da rodada —
 * tema, ranking, respostas já dadas e a questão da vez.
 */
rotasQuiz.get(
  '/rodada',
  rota(async (req, res) => {
    const { playerId } = exigirSessao(req)
    res.json(await montarEstadoDaRodada(playerId, hojeISO()))
  }),
)

/**
 * POST /api/quiz/respostas
 *
 * "Salvar respostas": grava a resposta do jogador. O word match contra as
 * alternativas acontece no servidor e a alternativa correta nunca volta para o
 * navegador.
 */
rotasQuiz.post(
  '/respostas',
  rota(async (req, res) => {
    const { playerId } = exigirSessao(req)
    const { questaoId, resposta, tempoDeResposta } = corpo(req, esquemaResposta)

    const resultado = await registrarResposta({
      playerId,
      questaoId,
      resposta,
      tempoDeResposta: tempoDeResposta ?? 0,
    })

    res.status(201).json(resultado)
  }),
)

/**
 * GET /api/quiz/ranking?q=
 *
 * "Pesquisar nickname": ranking global com filtro por nickname. Sem `q`
 * devolve o ranking completo.
 */
rotasQuiz.get(
  '/ranking',
  rota(async (req, res) => {
    const { playerId } = exigirSessao(req)
    const { q } = (() => {
      const parsed = esquemaPesquisa.parse(req.query)
      return { q: parsed.q }
    })()

    res.json(await pesquisarJogadores(q ?? '', playerId))
  }),
)