import { hojeISO, rotuloData } from '../lib/datas'
import {
  obterPlayer,
  buscarPorNickname,
  listarRanking,
  type PlayerPublico,
} from '../repositories/players.repo'
import { listarRespostasDoDia } from '../repositories/respostas.repo'
import { listarTemas, obterQuizDoDia, type QuizDoDia } from '../repositories/quiz.repo'
import { garantirQuizDeHoje } from './sorteio.service'

/**
 * Monta o payload que alimenta a tela: tema, histórico, ranking e a questão da
 * vez. É o "buscar questões do dia (7 questões)" + "pesquisar nickname" do
 * fluxograma, servido numa chamada só para a tela abrir de uma vez.
 */

export type CategoriaTons = 'cyan' | 'coral' | 'amber' | 'green' | 'blue'

/**
 * Quantos jogadores a lateral da frente exibe. A posição global de quem ficou
 * fora do recorte não se perde: vem de `players.ranking`, que o Script Diário
 * calcula sobre todos os jogadores, não sobre a lista da tela.
 */
const LIMITE_RANKING_FRENTE = 20

export type TemaParaTela = {
  id: string
  titulo: string
  descricao: string
  dataLabel: string
  tom: CategoriaTons
}

export type QuestaoParaTela = {
  id: string
  disciplinaNome: string
  categoria: string
  prompt: string
  /** Trecho em destaque do `prompt`, renderizado separado no título. */
  destaque: string
  questionNumber: number
  totalQuestions: number
  progressPercent: number
  respondida: boolean
  /** A resposta do jogador casou com alguma alternativa aceita. */
  casou: boolean | null
}

export type EstadoDaRodada = {
  data: string
  quiz: QuizDoDia
  questoes: QuestaoParaTela[]
  questaoAtual: QuestaoParaTela | null
  respondidas: number
  total: number
  encerrada: boolean
  jogador: {
    id: string
    nickname: string
    iniciais: string
    score: number
    rank: number
    pontosDoDia: number
    respondidas: number
  }
  ranking: PlayerPublico[]
  tema: TemaParaTela | null
  historico: TemaParaTela[]
}

export async function montarEstadoDaRodada(
  playerId: string,
  data = hojeISO(),
): Promise<EstadoDaRodada> {
  // Se o cron ainda não rodou hoje, sorteia sob demanda para a tela não ficar vazia.
  let quiz = await obterQuizDoDia(data)
  if (!quiz) quiz = await garantirQuizDeHoje()

  const player = await obterPlayer(playerId)
  if (!player) throw new Error('Jogador não encontrado.')

  const [respostas, ranking, temas] = await Promise.all([
    listarRespostasDoDia(playerId, data),
    listarRanking(LIMITE_RANKING_FRENTE),
    listarTemas(6),
  ])

  const respondidasPorQuestao = new Map(respostas.map((item) => [item.questaoId, item]))
  const total = quiz.questoes.length

  const questoes: QuestaoParaTela[] = quiz.questoes.map((questao) => {
    const resposta = respondidasPorQuestao.get(questao.questaoId)
    const respondida = Boolean(resposta)

    return {
      id: questao.questaoId,
      disciplinaNome: questao.disciplinaNome,
      categoria: questao.categoria || questao.disciplinaNome,
      prompt: questao.enunciado,
      destaque: questao.destaque,
      questionNumber: questao.ordem,
      totalQuestions: total,
      progressPercent: total === 0 ? 0 : Math.round((respondidasPorQuestao.size / total) * 100),
      respondida,
      casou: resposta ? resposta.casou : null,
    }
  })

  const temaDoDia = temas[0] ?? null

  // `players.ranking` só é escrito pelo script diário, então um jogador novo
  // (ou que entrou depois do fechamento) fica sem posição. Derivamos a posição
  // provisória a partir do ranking atual para a lateral não mostrar "—".
  const posicaoAtual = ranking.findIndex((jogador) => jogador.id === player.id)
  const rankProvisorio =
    player.ranking > 0 ? player.ranking : posicaoAtual >= 0 ? posicaoAtual + 1 : 0

  return {
    data,
    quiz,
    questoes,
    // A tela segue para a próxima questão ainda não respondida.
    questaoAtual: questoes.find((questao) => !questao.respondida) ?? null,
    respondidas: respondidasPorQuestao.size,
    total,
    encerrada: respondidasPorQuestao.size >= total && total > 0,
    jogador: {
      id: player.id,
      nickname: player.nickname,
      iniciais: player.iniciais,
      score: player.pontuacaoTotal + player.pontuacaoDoDia,
      rank: rankProvisorio,
      pontosDoDia: player.pontuacaoDoDia,
      respondidas: respondidasPorQuestao.size,
    },
    ranking,
    tema: temaDoDia
      ? {
          id: temaDoDia.id,
          titulo: temaDoDia.titulo,
          descricao: temaDoDia.descricao,
          dataLabel: rotuloData(temaDoDia.data),
          tom: temaDoDia.tom,
        }
      : null,
    historico: temas.map((tema) => ({
      id: tema.id,
      titulo: tema.titulo,
      descricao: tema.descricao,
      dataLabel: rotuloData(tema.data),
      tom: tema.tom,
    })),
  }
}

/** Campo de pesquisa de nickname da lateral direita. */
export async function pesquisarJogadores(termo: string, playerId: string): Promise<{
  resultados: PlayerPublico[]
  jogador: PlayerPublico | null
}> {
  const [resultados, player] = await Promise.all([
    termo.trim() ? buscarPorNickname(termo.trim()) : listarRanking(LIMITE_RANKING_FRENTE),
    obterPlayer(playerId),
  ])

  return {
    resultados,
    jogador: player
      ? {
          id: player.id,
          nickname: player.nickname,
          iniciais: player.iniciais,
          score: player.pontuacaoTotal + player.pontuacaoDoDia,
          rank: posicaoProvisoria(resultados, player),
        }
      : null,
  }
}

/** Mesma regra do estado da rodada: usa a posição gravada ou a do ranking atual. */
function posicaoProvisoria(ranking: PlayerPublico[], player: { id: string; ranking: number }): number {
  if (player.ranking > 0) return player.ranking
  const indice = ranking.findIndex((jogador) => jogador.id === player.id)
  return indice >= 0 ? indice + 1 : 0
}