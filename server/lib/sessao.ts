import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { config } from '../config'
import { erroNaoAutenticado } from './http'

const VALIDADE_SESSAO = '30d'

export type SessaoPlayer = {
  playerId: string
  nickname: string
}

export function gerarTokenSessao(sessao: SessaoPlayer): string {
  return jwt.sign(sessao, config.segredoSessao, { expiresIn: VALIDADE_SESSAO })
}

export function verificarTokenSessao(token: string): SessaoPlayer {
  const carga = jwt.verify(token, config.segredoSessao)
  if (typeof carga === 'string') throw erroNaoAutenticado()

  const { playerId, nickname } = carga as Partial<SessaoPlayer>
  if (typeof playerId !== 'string' || typeof nickname !== 'string') {
    throw erroNaoAutenticado()
  }

  return { playerId, nickname }
}

function extrairToken(req: Request): string | null {
  const cabecalho = req.headers.authorization
  if (typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')) {
    return cabecalho.slice(7).trim() || null
  }
  return null
}

/**
 * Middleware que valida o token e injeta `req.sessao`.
 * Token ausente segue sem sessão: cada rota decide o que fazer, e as de escrita
 * usam `exigirSessao`.
 */
export function carregarSessao(req: Request, _res: Response, next: NextFunction): void {
  const token = extrairToken(req)
  if (!token) {
    next()
    return
  }

  try {
    ;(req as Request & { sessao?: SessaoPlayer }).sessao = verificarTokenSessao(token)
  } catch {
    // Token inválido é tratado como "sem sessão" para não quebrar a UI.
  }
  next()
}

/** Garante sessão válida; use nas rotas que exigem jogador autenticado. */
export function exigirSessao(req: Request): SessaoPlayer {
  const sessao = (req as Request & { sessao?: SessaoPlayer }).sessao
  if (!sessao) throw erroNaoAutenticado()
  return sessao
}