import { Router } from 'express'
import { z } from 'zod'

import { corpo, rota } from '../lib/http'
import { exigirSessao } from '../lib/sessao'
import { entrarOuCriar, sessaoAtual } from '../services/auth.service'

const esquemaLogin = z.object({
  nickname: z.string().trim().min(1, 'Informe o nickname.').max(40),
  senha: z.string().min(1, 'Informe a senha.').max(72),
})

export const rotasAuth = Router()

/**
 * POST /api/auth/entrar
 *
 * Pré-página de entrada: nickname e senha. Nickname novo é criado, nickname
 * existente exige a senha correta.
 */
rotasAuth.post(
  '/entrar',
  rota(async (req, res) => {
    const { nickname, senha } = corpo(req, esquemaLogin)
    const resultado = await entrarOuCriar({ nickname, senha })
    res.status(resultado.criado ? 201 : 200).json(resultado)
  }),
)

/** GET /api/auth/eu — revalida a sessão guardada no navegador. */
rotasAuth.get(
  '/eu',
  rota(async (req, res) => {
    const { playerId } = exigirSessao(req)
    const jogador = await sessaoAtual(playerId)
    res.json({ jogador })
  }),
)