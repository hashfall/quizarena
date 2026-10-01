import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()

const raizProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Arquivos de credencial do Admin SDK procurados na raiz do projeto. */
const NOMES_CREDENCIAIS = [
  'projeto-fetec-firebase-adminsdk-fbsvc-c43f04a365.json',
  'serviceAccount.json',
]

const variaveis = z.object({
  PORT: z.coerce.number().int().positive().default(6767),
  JWT_SECRET: z.string().min(16).optional(),
  CRON_SEGREDO: z.string().min(8).optional(),
  CRON_HABILITADO: z
    .enum(['true', 'false'])
    .default('true'),
  FUSO_HORARIO: z.string().default('America/Sao_Paulo'),
  TOTAL_QUESTOES_DIA: z.coerce.number().int().min(1).max(20).default(7),
  PESO_BASE_ALTERNATIVA: z.coerce.number().int().min(1).default(100),
  PESO_MINIMO: z.coerce.number().int().min(0).default(10),
})

const parsed = variaveis.parse(process.env)

/**
 * Segredo de assinatura de sessão. Em desenvolvimento geramos um efêmero (o
 * login reinicia a cada boot, o que é aceitável em dev); em produção é
 * obrigatório vir do ambiente para a sessão sobreviver a deploys.
 */
function resolverSegredoSessao(): string {
  if (parsed.JWT_SECRET) return parsed.JWT_SECRET

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET é obrigatório em produção. Gere um segredo com: openssl rand -hex 32',
    )
  }

  return 'segredo-efemero-de-desenvolvimento-quiz-arena'
}

export const config = {
  raizProjeto,
  porta: parsed.PORT,
  isProducao: process.env.NODE_ENV === 'production',
  segredoSessao: resolverSegredoSessao(),
  segredoCron: parsed.CRON_SEGREDO ?? null,
  cronHabilitado: parsed.CRON_HABILITADO === 'true',
  fusoHorario: parsed.FUSO_HORARIO,
  distDir: join(raizProjeto, 'dist'),
  /** Quantidade de questões sorteadas por dia (fluxograma: 7). */
  totalQuestoesDia: parsed.TOTAL_QUESTOES_DIA,
  /** Peso inicial de uma alternativa antes do cálculo de raridade. */
  pesoBaseAlternativa: parsed.PESO_BASE_ALTERNATIVA,
  /** Piso do peso dinâmico, para a alternativa mais comum nunca valer zero. */
  pesoMinimo: parsed.PESO_MINIMO,
} as const

/**
 * Resolve as credenciais do Admin SDK na ordem: variável de ambiente, arquivo
 * apontado por GOOGLE_APPLICATION_CREDENTIALS, arquivo padrão na raiz.
 */
export function resolverCredenciais(): { projectId: string; serviceAccountPath?: string } {
  const caminhoEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (caminhoEnv) {
    const absoluto = isAbsolute(caminhoEnv) ? caminhoEnv : join(raizProjeto, caminhoEnv)
    if (!existsSync(absoluto)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS aponta para um arquivo inexistente: ${absoluto}`)
    }
    const conta = JSON.parse(readFileSync(absoluto, 'utf8')) as { project_id?: string }
    return { projectId: conta.project_id ?? 'projeto-fetec', serviceAccountPath: absoluto }
  }

  for (const nome of NOMES_CREDENCIAIS) {
    const caminho = join(raizProjeto, nome)
    if (!existsSync(caminho)) continue
    const conta = JSON.parse(readFileSync(caminho, 'utf8')) as { project_id?: string }
    return { projectId: conta.project_id ?? 'projeto-fetec', serviceAccountPath: caminho }
  }

  throw new Error(
    'Credencial do Firebase não encontrada. Defina GOOGLE_APPLICATION_CREDENTIALS ou ' +
      `coloque um dos arquivos (${NOMES_CREDENCIAIS.join(', ')}) na raiz do projeto.`,
  )
}