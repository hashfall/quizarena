import bcrypt from 'bcryptjs'
import { FieldValue } from 'firebase-admin/firestore'

import { obterFirestore } from '../firebase'
import { chaveDeNickname, iniciaisDoNickname } from '../lib/texto'

/**
 * Coleção Player do fluxograma:
 *
 *   players/{playerId}   (playerId = chave normalizada do nickname)
 *   └── respostas/{dia}   -> respostas/{respostaId}
 */

export const COLECAO_PLAYERS = 'players'

const SALT_ROUNDS = 10

export type Player = {
  id: string
  nickname: string
  iniciais: string
  senhaHash: string
  /** Acumulado histórico, atualizado pelo script diário. */
  pontuacaoTotal: number
  /** Placar provisório do dia, recalculado a cada resposta. */
  pontuacaoDoDia: number
  /** Posição no ranking global, recomputada diariamente. */
  ranking: number
  respostasHoje: number
  criadoEm: Date | null
  ultimoAcessoEm: Date | null
}

export type PlayerPublico = {
  id: string
  nickname: string
  iniciais: string
  score: number
  rank: number
}

export async function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS)
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash)
}

export async function obterPlayerPorNickname(nickname: string): Promise<Player | null> {
  const id = chaveDeNickname(nickname)
  if (!id) return null

  const doc = await obterFirestore().collection(COLECAO_PLAYERS).doc(id).get()
  if (!doc.exists) return null

  return mapearPlayer(doc.id, doc.data()!)
}

export async function obterPlayer(id: string): Promise<Player | null> {
  const doc = await obterFirestore().collection(COLECAO_PLAYERS).doc(id).get()
  return doc.exists ? mapearPlayer(doc.id, doc.data()!) : null
}

export async function listarPlayers(): Promise<Player[]> {
  const busca = await obterFirestore().collection(COLECAO_PLAYERS).get()
  return busca.docs.map((doc) => mapearPlayer(doc.id, doc.data()!))
}

/**
 * Ranking global, do maior para a menor pontuação acumulada. Empates são
 * desempatados pelo nickname para a ordenação ser estável entre execuções.
 */
export async function listarRanking(limite = 100): Promise<PlayerPublico[]> {
  const busca = await obterFirestore()
    .collection(COLECAO_PLAYERS)
    .orderBy('pontuacaoTotal', 'desc')
    .limit(limite)
    .get()

  const jogadores = busca.docs.map((doc) => mapearPlayer(doc.id, doc.data()!))

  return jogadores
    .map((player, indice) => ({
      id: player.id,
      nickname: player.nickname,
      iniciais: player.iniciais,
      score: player.pontuacaoTotal,
      rank: indice + 1,
    }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'pt-BR'))
    .map((jogador, indice) => ({ ...jogador, rank: indice + 1 }))
}

/** Busca por nickname no ranking; usado pelo campo de pesquisa da lateral. */
export async function buscarPorNickname(termo: string, limite = 20): Promise<PlayerPublico[]> {
  const busca = await obterFirestore()
    .collection(COLECAO_PLAYERS)
    .where('nicknameLower', '>=', termo.toLowerCase())
    .where('nicknameLower', '<=', `${termo.toLowerCase()}\uf8ff`)
    .limit(limite)
    .get()

  const jogadores = busca.docs.map((doc) => {
    const player = mapearPlayer(doc.id, doc.data()!)
    return {
      id: player.id,
      nickname: player.nickname,
      iniciais: player.iniciais,
      score: player.pontuacaoTotal,
      rank: player.ranking,
    }
  })

  return jogadores.sort((a, b) => a.rank - b.rank || b.score - a.score)
}

/**
 * Cria o jogador. O documento usa a chave normalizada do nickname, o que
 * garante unicidade no Firestore mesmo com concurrentes.
 */
export async function criarPlayer(nickname: string, senhaHash: string): Promise<Player> {
  const id = chaveDeNickname(nickname)
  const agora = FieldValue.serverTimestamp()

  await obterFirestore().collection(COLECAO_PLAYERS).doc(id).set({
    nickname,
    nicknameLower: nickname.toLowerCase(),
    iniciais: iniciaisDoNickname(nickname),
    senhaHash,
    pontuacaoTotal: 0,
    pontuacaoDoDia: 0,
    ranking: 0,
    respostasHoje: 0,
    criadoEm: agora,
    ultimoAcessoEm: agora,
  })

  const criado = await obterPlayer(id)
  if (!criado) throw new Error('Falha ao criar jogador.')
  return criado
}

export async function registrarAcesso(playerId: string): Promise<void> {
  await obterFirestore()
    .collection(COLECAO_PLAYERS)
    .doc(playerId)
    .update({ ultimoAcessoEm: FieldValue.serverTimestamp() })
}

/**
 * Soma o placar provisório de uma resposta e incrementa o contador diário.
 * O placar do dia é descartado no fechamento, quando o peso real é conhecido.
 */
export async function somarPontuacaoDoDia(playerId: string, pontos: number): Promise<void> {
  const ref = obterFirestore().collection(COLECAO_PLAYERS).doc(playerId)
  await ref.update({
    pontuacaoDoDia: FieldValue.increment(pontos),
    respostasHoje: FieldValue.increment(1),
  })
}

/**
 * Grava a pontuação acumulada e a posição no ranking (chamado pelo script
 * diário). O placar provisório do dia é zerado junto.
 */
export async function atualizarPontuacoes(
  atualizacoes: Array<{ playerId: string; pontuacaoTotal: number; ranking: number }>,
): Promise<void> {
  if (atualizacoes.length === 0) return

  const firestore = obterFirestore()
  const timestamp = FieldValue.serverTimestamp()

  for (let i = 0; i < atualizacoes.length; i += 400) {
    const lote = firestore.batch()
    for (const item of atualizacoes.slice(i, i + 400)) {
      lote.update(firestore.collection(COLECAO_PLAYERS).doc(item.playerId), {
        pontuacaoTotal: item.pontuacaoTotal,
        ranking: item.ranking,
        pontuacaoDoDia: 0,
        atualizadoEm: timestamp,
      })
    }
    await lote.commit()
  }
}

function mapearPlayer(id: string, dados: FirebaseFirestore.DocumentData): Player {
  return {
    id,
    nickname: dados.nickname ?? id,
    iniciais: dados.iniciais ?? iniciaisDoNickname(dados.nickname ?? id),
    senhaHash: dados.senhaHash ?? '',
    pontuacaoTotal: dados.pontuacaoTotal ?? 0,
    pontuacaoDoDia: dados.pontuacaoDoDia ?? 0,
    ranking: dados.ranking ?? 0,
    respostasHoje: dados.respostasHoje ?? 0,
    criadoEm: dados.criadoEm instanceof Date ? dados.criadoEm : null,
    ultimoAcessoEm: dados.ultimoAcessoEm instanceof Date ? dados.ultimoAcessoEm : null,
  }
}