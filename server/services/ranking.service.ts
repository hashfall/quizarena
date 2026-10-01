import {
  atualizarPontuacoes,
  listarPlayers,
  type Player,
  type PlayerPublico,
} from '../repositories/players.repo'
import { listarRespostasDoDiaDeTodos } from '../repositories/respostas.repo'

export type EntradaRanking = {
  playerId: string
  nickname: string
  iniciais: string
  /** Acumulado já existente no Firestore. */
  acumulado: number
  /** Pontos finais do dia, depois do peso dinâmico das alternativas. */
  pontosDoDia: number
}

/**
 * "Ranking: cálculo do ranking dos players com base no peso das alternativas e
 * salvar no firebase". O ranking é cumulativo: o total do dia entra no
 * acumulado e a posição é recalculada sobre todos os jogadores.
 */
export function ordenarRanking(entradas: EntradaRanking[]): Array<EntradaRanking & { pontuacaoTotal: number; ranking: number }> {
  const comTotal = entradas.map((entrada) => ({
    ...entrada,
    pontuacaoTotal: entrada.acumulado + entrada.pontosDoDia,
  }))

  comTotal.sort(
    (a, b) =>
      b.pontuacaoTotal - a.pontuacaoTotal ||
      b.pontosDoDia - a.pontosDoDia ||
      a.nickname.localeCompare(b.nickname, 'pt-BR'),
  )

  return comTotal.map((entrada, indice) => ({ ...entrada, ranking: indice + 1 }))
}

/** Soma os pontos finais do dia por jogador, a partir das respostas gravadas. */
export async function somarPontosDoDia(data: string, playerIds: string[]): Promise<Map<string, number>> {
  const respostas = await listarRespostasDoDiaDeTodos(data, playerIds)
  const total = new Map<string, number>()

  for (const { playerId, item } of respostas) {
    total.set(playerId, (total.get(playerId) ?? 0) + item.pontos)
  }

  return total
}

/**
 * Fecha o ranking do dia: soma os pontos de cada jogador ao acumulado e grava a
 * nova posição. O placar provisório do dia é zerado junto, porque a pontuação
 * que vale é a definitiva.
 */
export async function fecharRankingDoDia(data: string): Promise<{
  data: string
  jogadores: number
  top: PlayerPublico[]
}> {
  const players = await listarPlayers()
  const pontosDoDia = await somarPontosDoDia(
    data,
    players.map((player) => player.id),
  )

  const entradas: EntradaRanking[] = players.map((player: Player) => ({
    playerId: player.id,
    nickname: player.nickname,
    iniciais: player.iniciais,
    acumulado: player.pontuacaoTotal,
    pontosDoDia: pontosDoDia.get(player.id) ?? 0,
  }))

  const ordenado = ordenarRanking(entradas)

  await atualizarPontuacoes(
    ordenado.map((item) => ({
      playerId: item.playerId,
      pontuacaoTotal: item.pontuacaoTotal,
      ranking: item.ranking,
    })),
  )

  return {
    data,
    jogadores: ordenado.length,
    top: ordenado.slice(0, 10).map((item) => ({
      id: item.playerId,
      nickname: item.nickname,
      iniciais: item.iniciais,
      score: item.pontuacaoTotal,
      rank: item.ranking,
    })),
  }
}