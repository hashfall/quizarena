// Contratos da API. O backend responde exatamente neste formato.

export type ThemeTone = 'cyan' | 'coral' | 'amber' | 'green' | 'blue'
export type AnswerSubmissionStatus = 'idle' | 'sending' | 'checked'

export type ThemeHistoryItem = {
  id: string
  titulo: string
  descricao: string
  dataLabel: string
  tom: ThemeTone
}

export type RankingPlayer = {
  id: string
  nickname: string
  iniciais: string
  score: number
  rank: number
}

export type CurrentUser = {
  id: string
  nickname: string
  iniciais: string
  score: number
  rank: number
  pontosDoDia: number
  respondidas: number
}

export type CurrentQuestion = {
  id: string
  disciplinaNome: string
  categoria: string
  prompt: string
  questionNumber: number
  totalQuestions: number
  progressPercent: number
  respondida: boolean
  /** A resposta do jogador casou com alguma das formas aceitas. */
  casou: boolean | null
}

export type QuizArenaData = {
  data: string
  questoes: CurrentQuestion[]
  questaoAtual: CurrentQuestion | null
  respondidas: number
  total: number
  encerrada: boolean
  jogador: CurrentUser
  ranking: RankingPlayer[]
  tema: ThemeHistoryItem | null
  historico: ThemeHistoryItem[]
}

export type LoginResult = {
  token: string
  jogador: CurrentUser
  criado: boolean
}

export type SubmitAnswerResult = {
  registrada: boolean
  /** A resposta casou com alguma alternativa aceita. */
  casou: boolean
  pontos: number
  jaRespondida: boolean
}

export type RankingSearchResult = {
  resultados: RankingPlayer[]
  jogador: RankingPlayer | null
}