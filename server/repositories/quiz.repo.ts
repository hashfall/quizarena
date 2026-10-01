import { FieldValue } from 'firebase-admin/firestore'

import { obterFirestore } from '../firebase'

/**
 * Sorteio do dia. Guardado em documento único para que todos os jogadores
 * enxerguem exatamente as mesmas 7 questões, independentemente de quando
 * entraram na rodada.
 *
 *   quiz_do_dia/{yyyy-mm-dd}
 *   temas/{temaId}
 */

export const COLECAO_QUIZ_DO_DIA = 'quiz_do_dia'
export const COLECAO_TEMAS = 'temas'

export type QuestaoDoDia = {
  ordem: number
  questaoId: string
  disciplinaId: string
  disciplinaNome: string
  categoria: string
  enunciado: string
}

export type QuizDoDia = {
  data: string
  total: number
  questoes: QuestaoDoDia[]
  geradoEm: Date | null
}

export type Tema = {
  id: string
  titulo: string
  descricao: string
  data: string
  tom: 'cyan' | 'coral' | 'amber' | 'green' | 'blue'
}

export async function obterQuizDoDia(data: string): Promise<QuizDoDia | null> {
  const doc = await obterFirestore().collection(COLECAO_QUIZ_DO_DIA).doc(data).get()
  if (!doc.exists) return null

  const dados = doc.data()!
  return {
    data,
    total: dados.total ?? (dados.questoes?.length ?? 0),
    questoes: (dados.questoes ?? []) as QuestaoDoDia[],
    geradoEm: dados.geradoEm instanceof Date ? dados.geradoEm : null,
  }
}

/** Cria o sorteio do dia se ainda não existir; devolve sempre o documento válido. */
export async function garantirQuizDoDia(
  data: string,
  questoes: QuestaoDoDia[],
): Promise<QuizDoDia> {
  const ref = obterFirestore().collection(COLECAO_QUIZ_DO_DIA).doc(data)
  const existente = await ref.get()

  if (existente.exists) {
    const dados = existente.data()!
    return {
      data,
      total: dados.total ?? 0,
      questoes: (dados.questoes ?? []) as QuestaoDoDia[],
      geradoEm: dados.geradoEm instanceof Date ? dados.geradoEm : null,
    }
  }

  await ref.create({
    data,
    total: questoes.length,
    questoes,
    geradoEm: FieldValue.serverTimestamp(),
  })

  return { data, total: questoes.length, questoes, geradoEm: new Date() }
}

export async function listarTemas(limite = 6): Promise<Tema[]> {
  const busca = await obterFirestore()
    .collection(COLECAO_TEMAS)
    .orderBy('data', 'desc')
    .limit(limite)
    .get()

  return busca.docs.map((doc) => {
    const dados = doc.data()!
    return {
      id: doc.id,
      titulo: dados.titulo ?? doc.id,
      descricao: dados.descricao ?? '',
      data: dados.data ?? '',
      tom: dados.tom ?? 'cyan',
    }
  })
}