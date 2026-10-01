import type {
  LoginResult,
  QuizArenaData,
  RankingSearchResult,
  SubmitAnswerResult,
} from '../types/quiz'

const CHAVE_TOKEN = 'quiz-arena:token'

export class ErroApi extends Error {
  readonly status: number
  readonly detalhes: Array<{ campo: string; mensagem: string }> | undefined

  constructor(status: number, mensagem: string, detalhes?: Array<{ campo: string; mensagem: string }>) {
    super(mensagem)
    this.name = 'ErroApi'
    this.status = status
    this.detalhes = detalhes
  }
}

export function lerToken(): string | null {
  return localStorage.getItem(CHAVE_TOKEN)
}

export function gravarToken(token: string): void {
  localStorage.setItem(CHAVE_TOKEN, token)
}

export function limparToken(): void {
  localStorage.removeItem(CHAVE_TOKEN)
}

/** Disparado quando o token expirou, para a interface voltar à pré-página. */
export const EVENTO_SESSAO_EXPIRADA = 'quiz-arena:sessao-expirada'

type Requisicao = {
  metodo?: 'GET' | 'POST'
  corpo?: unknown
  /** Rotas de entrada não devem redirecionar em caso de token inválido. */
  anonima?: boolean
  /** Permite cancelar a requisição, para não vazar busca ao trocar de tela. */
  sinal?: AbortSignal
}

async function requisitar<T>(caminho: string, opcoes: Requisicao = {}): Promise<T> {
  const { metodo = 'GET', corpo, anonima = false, sinal } = opcoes
  const token = lerToken()

  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: sinal,
  })

  if (resposta.status === 204) return undefined as T

  const dados = (await resposta.json().catch(() => ({}))) as {
    erro?: string
    detalhes?: Array<{ campo: string; mensagem: string }>
  }

  if (!resposta.ok) {
    if (resposta.status === 401 && !anonima) {
      limparToken()
      window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    }
    throw new ErroApi(resposta.status, dados.erro ?? 'Não foi possível falar com o servidor.', dados.detalhes)
  }

  return dados as T
}

export const api = {
  entrar: (nickname: string, senha: string) =>
    requisitar<LoginResult>('/auth/entrar', {
      metodo: 'POST',
      corpo: { nickname, senha },
      anonima: true,
    }),

  eu: () => requisitar<{ jogador: LoginResult['jogador'] | null }>('/auth/eu'),

  rodada: () => requisitar<QuizArenaData>('/quiz/rodada'),

  responder: (questaoId: string, resposta: string, tempoDeResposta: number) =>
    requisitar<SubmitAnswerResult>('/quiz/respostas', {
      metodo: 'POST',
      corpo: { questaoId, resposta, tempoDeResposta },
    }),

  ranking: (termo?: string, sinal?: AbortSignal) =>
    requisitar<RankingSearchResult>(
      `/quiz/ranking${termo ? `?q=${encodeURIComponent(termo)}` : ''}`,
      { sinal },
    ),
}