import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError } from 'zod'

/** Erro de aplicação com status HTTP já definido. */
export class ErroHttp extends Error {
  readonly status: number
  readonly detalhes?: unknown

  constructor(status: number, mensagem: string, detalhes?: unknown) {
    super(mensagem)
    this.name = 'ErroHttp'
    this.status = status
    this.detalhes = detalhes
  }
}

export const erroNaoEncontrado = (mensagem = 'Recurso não encontrado') => new ErroHttp(404, mensagem)
export const erroNaoAutenticado = (mensagem = 'Sessão inválida ou expirada. Entre novamente.') =>
  new ErroHttp(401, mensagem)
export const erroConflito = (mensagem: string) => new ErroHttp(409, mensagem)
export const erroValidacao = (mensagem: string, detalhes?: unknown) =>
  new ErroHttp(422, mensagem, detalhes)

/** Envolve handlers assíncronos para que rejeições cheguem ao middleware de erro. */
export function rota(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}

/** Corpo JSON do request já validado por um schema Zod. */
export function corpo<T>(req: Request, schema: { parse: (dados: unknown) => T }): T {
  return schema.parse(req.body)
}

/** Query string do request já validada por um schema Zod. */
export function query<T>(req: Request, schema: { parse: (dados: unknown) => T }): T {
  return schema.parse(req.query)
}

/** Middleware final: normaliza qualquer erro em JSON. */
export function tratadorDeErros(
  erro: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(erro)
    return
  }

  if (erro instanceof ZodError) {
    res.status(422).json({
      erro: 'Dados inválidos.',
      detalhes: erro.issues.map((issue) => ({
        campo: issue.path.join('.') || '(corpo)',
        mensagem: issue.message,
      })),
    })
    return
  }

  if (erro instanceof ErroHttp) {
    res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes })
    return
  }

  const codigo = (erro as { code?: string } | null)?.code

  if (codigo === 'auth/invalid-credential' || codigo === 'auth/wrong-password') {
    res.status(401).json({ erro: 'Senha incorreta.' })
    return
  }

  console.error('[quiz-arena] erro não tratado:', erro)
  res.status(500).json({ erro: 'Erro interno do servidor.' })
}