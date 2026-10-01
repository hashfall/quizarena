import { FieldValue } from 'firebase-admin/firestore'

import { obterFirestore } from '../firebase'

/**
 * Respostas do jogador. O fluxograma marca o bloco respostas / id_questao /
 * tempo_de_resposta como "TODO: ignorar por enquanto", mas o backend já grava
 * os três campos para não ter migração quando o recurso entrar.
 *
 *   players/{playerId}/respostas/{yyyy-mm-dd}/itens/{questaoId}
 */

const SUBCOLECAO_RESPOSTAS = 'respostas'

export type ItemResposta = {
  questaoId: string
  disciplinaId: string
  /** Resposta exatamente como o jogador digitou. */
  resposta: string
  /** Resposta normalizada, usada na comparação por palavra. */
  respostaNormalizada: string
  /** Alternativa que o word match encontrou (todas são corretas). */
  alternativaId: string | null
  alternativaTexto: string | null
  /** A resposta casou com alguma alternativa aceita. */
  casou: boolean
  /** Peso aplicado no momento da resposta (recalculado à noite pelo script). */
  pontos: number
  /** Segundos que o jogador levou. Guardado, mas ainda sem efeito. */
  tempoDeResposta: number
  respondidaEm: Date | null
  conferidaEm?: Date | null
}

function referenciaDia(playerId: string, data: string) {
  return obterFirestore()
    .collection('players')
    .doc(playerId)
    .collection(SUBCOLECAO_RESPOSTAS)
    .doc(data)
}

export async function gravarResposta(
  playerId: string,
  data: string,
  item: Omit<ItemResposta, 'respondidaEm' | 'conferidaEm'>,
): Promise<ItemResposta> {
  const ref = referenciaDia(playerId, data).collection('itens').doc(item.questaoId)
  await ref.set({
    ...item,
    respondidaEm: FieldValue.serverTimestamp(),
  })
  return { ...item, respondidaEm: new Date() }
}

/** Respostas de um jogador em um dia. */
export async function listarRespostasDoDia(
  playerId: string,
  data: string,
): Promise<ItemResposta[]> {
  const busca = await referenciaDia(playerId, data).collection('itens').get()
  return busca.docs.map((doc) => mapearItem(doc.id, doc.data()!))
}

export async function obterResposta(
  playerId: string,
  data: string,
  questaoId: string,
): Promise<ItemResposta | null> {
  const doc = await referenciaDia(playerId, data).collection('itens').doc(questaoId).get()
  return doc.exists ? mapearItem(doc.id, doc.data()!) : null
}

/**
 * Todas as respostas de um dia, de todos os jogadores informados (usado pelo
 * script diário). A lista de ids vem da coleção `players`, então nenhuma
 * consulta em collection group — e portanto nenhum índice composto — é preciso.
 */
export async function listarRespostasDoDiaDeTodos(
  data: string,
  playerIds: string[],
): Promise<Array<{ playerId: string; item: ItemResposta }>> {
  if (playerIds.length === 0) return []

  const resultados = await Promise.all(
    playerIds.map(async (playerId) => {
      const busca = await referenciaDia(playerId, data).collection('itens').get()
      return busca.docs.map((resposta) => ({
        playerId,
        item: mapearItem(resposta.id, resposta.data()!),
      }))
    }),
  )

  return resultados.flat()
}

/** Aplica o peso recalculado a uma resposta já conferida. */
export async function aplicarPontosRecalculados(
  atualizacoes: Array<{ playerId: string; questaoId: string; pontos: number }>,
  data: string,
): Promise<void> {
  if (atualizacoes.length === 0) return

  const firestore = obterFirestore()
  const timestamp = FieldValue.serverTimestamp()

  for (let i = 0; i < atualizacoes.length; i += 400) {
    const lote = firestore.batch()
    for (const item of atualizacoes.slice(i, i + 400)) {
      lote.update(
        referenciaDia(item.playerId, data).collection('itens').doc(item.questaoId),
        { pontos: item.pontos, pontosRecalculadosEm: timestamp },
      )
    }
    await lote.commit()
  }
}

/** Zera o contador diário ao virar o dia. */
export async function resetarContadorDiario(playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return
  const firestore = obterFirestore()
  for (let i = 0; i < playerIds.length; i += 400) {
    const lote = firestore.batch()
    for (const playerId of playerIds.slice(i, i + 400)) {
      lote.update(firestore.collection('players').doc(playerId), { respostasHoje: 0 })
    }
    await lote.commit()
  }
}

function mapearItem(questaoId: string, dados: FirebaseFirestore.DocumentData): ItemResposta {
  return {
    questaoId,
    disciplinaId: dados.disciplinaId ?? '',
    resposta: dados.resposta ?? '',
    respostaNormalizada: dados.respostaNormalizada ?? '',
    alternativaId: dados.alternativaId ?? null,
    alternativaTexto: dados.alternativaTexto ?? null,
    casou: dados.casou ?? dados.correta ?? false,
    pontos: dados.pontos ?? 0,
    tempoDeResposta: dados.tempoDeResposta ?? 0,
    respondidaEm: dados.respondidaEm instanceof Date ? dados.respondidaEm : null,
    conferidaEm: dados.conferidaEm instanceof Date ? dados.conferidaEm : null,
  }
}