import { FieldValue, type DocumentData } from 'firebase-admin/firestore'

import { obterFirestore } from '../firebase'

/**
 * Coleção Disciplina do fluxograma:
 *
 *   disciplinas/{disciplinaId}
 *   └── questoes/{questaoId}              (subcoleção)
 *       └── alternativas/{alternativaId}  (subcoleção)
 *           └── pontuacao/{data}          (peso dinâmico por dia)
 */

export const COLECAO_DISCIPLINAS = 'disciplinas'
export const SUBCOLECAO_QUESTOES = 'questoes'
export const SUBCOLECAO_ALTERNATIVAS = 'alternativas'
export const SUBCOLECAO_PONTUACAO = 'pontuacao'

export type Disciplina = {
  id: string
  nome: string
  descricao: string
  ativa: boolean
  criadaEm: Date | null
  atualizadaEm: Date | null
}

export type Questao = {
  id: string
  disciplinaId: string
  disciplinaNome: string
  /** Trecho do enunciado antes do termo a ser adivinhado. */
  enunciado: string
  /** Termo exibido em destaque no enunciado (o que o jogador deve digitar). */
  destaque: string
  categoria: string
  /** Sinalizador do fluxograma: compõe o quiz do dia atual. */
  selecionada: boolean
  ativa: boolean
  criadaEm: Date | null
  atualizadaEm: Date | null
}

/**
 * Uma alternativa é uma forma aceita de responder à questão. Pelo fluxograma o
 * documento de alternativas guarda **somente alternativas corretas**: não existe
 * distrator. Se o jogador digitar algo que case com qualquer uma delas, acertou.
 */
export type Alternativa = {
  id: string
  questaoId: string
  texto: string
  ordem: number
}

/** Referência do caminho completo de uma alternativa. */
export type CaminhoAlternativa = {
  disciplinaId: string
  questaoId: string
  alternativaId: string
}

function lerData(dados: DocumentData): Date | null {
  const valor = dados.criadaEm ?? dados.atualizadaEm
  return valor instanceof Date ? valor : null
}

function mapearDisciplina(id: string, dados: DocumentData): Disciplina {
  return {
    id,
    nome: dados.nome ?? id,
    descricao: dados.descricao ?? '',
    ativa: dados.ativa ?? true,
    criadaEm: lerData(dados),
    atualizadaEm: lerData(dados),
  }
}

function mapearQuestao(disciplinaId: string, id: string, dados: DocumentData): Questao {
  return {
    id,
    disciplinaId,
    disciplinaNome: dados.disciplinaNome ?? '',
    enunciado: dados.enunciado ?? '',
    destaque: dados.destaque ?? '',
    categoria: dados.categoria ?? '',
    selecionada: dados.selecionada ?? false,
    ativa: dados.ativa ?? true,
    criadaEm: lerData(dados),
    atualizadaEm: lerData(dados),
  }
}

export function colecaoQuestao(disciplinaId: string) {
  return obterFirestore().collection(COLECAO_DISCIPLINAS).doc(disciplinaId).collection(SUBCOLECAO_QUESTOES)
}

export function referenciaQuestao(disciplinaId: string, questaoId: string) {
  return colecaoQuestao(disciplinaId).doc(questaoId)
}

export function referenciaAlternativa(caminho: CaminhoAlternativa) {
  return referenciaQuestao(caminho.disciplinaId, caminho.questaoId).collection(
    SUBCOLECAO_ALTERNATIVAS,
  ).doc(caminho.alternativaId)
}

// ---------------------------------------------------------------------------
// Disciplinas
// ---------------------------------------------------------------------------

export async function listarDisciplinas(apenasAtivas = true): Promise<Disciplina[]> {
  const colecao = obterFirestore().collection(COLECAO_DISCIPLINAS)
  const busca = await (apenasAtivas ? colecao.where('ativa', '==', true) : colecao.orderBy('nome')).get()

  return busca.docs.map((doc) => mapearDisciplina(doc.id, doc.data()!))
}

export async function obterDisciplina(id: string): Promise<Disciplina | null> {
  const doc = await obterFirestore().collection(COLECAO_DISCIPLINAS).doc(id).get()
  return doc.exists ? mapearDisciplina(doc.id, doc.data()!) : null
}

// ---------------------------------------------------------------------------
// Questões
// ---------------------------------------------------------------------------

export async function listarQuestoesDaDisciplina(
  disciplinaId: string,
  apenasAtivas = true,
): Promise<Questao[]> {
  const colecao = colecaoQuestao(disciplinaId)
  const busca = await (apenasAtivas ? colecao.where('ativa', '==', true) : colecao).get()

  return busca.docs.map((doc) => mapearQuestao(disciplinaId, doc.id, doc.data()!))
}

export async function obterQuestao(
  disciplinaId: string,
  questaoId: string,
): Promise<Questao | null> {
  const doc = await referenciaQuestao(disciplinaId, questaoId).get()
  return doc.exists ? mapearQuestao(disciplinaId, doc.id, doc.data()!) : null
}

// ---------------------------------------------------------------------------
// Alternativas
// ---------------------------------------------------------------------------

export async function listarAlternativas(questaoId: string, disciplinaId: string): Promise<Alternativa[]> {
  const busca = await referenciaQuestao(disciplinaId, questaoId)
    .collection(SUBCOLECAO_ALTERNATIVAS)
    .orderBy('ordem')
    .get()

  return busca.docs.map((doc) => {
    const dados = doc.data()!
    return {
      id: doc.id,
      questaoId,
      texto: dados.texto ?? '',
      ordem: dados.ordem ?? 0,
    }
  })
}

/**
 * Alternativas de várias questões do dia. São apenas 7 questões por rodada,
 * então uma consulta por questão é barata e evita índices compostos.
 */
export async function listarAlternativasDeQuestoes(
  questoes: Array<{ disciplinaId: string; questaoId: string }>,
): Promise<Map<string, Alternativa[]>> {
  const resultados = await Promise.all(
    questoes.map(async (referencia) => {
      const alternativas = await listarAlternativas(referencia.questaoId, referencia.disciplinaId)
      return [referencia.questaoId, alternativas] as const
    }),
  )
  return new Map(resultados)
}

// ---------------------------------------------------------------------------
// Pontuação (peso dinâmico das alternativas)
// ---------------------------------------------------------------------------

export type PontuacaoAlternativa = {
  questaoId: string
  alternativaId: string
  peso: number
  /** Quantos jogadores responderam exatamente esta forma. */
  escolhas: number
  /** Total de respostas do dia para a questão. */
  totalRespostas: number
  geradoEm: Date | null
}

export async function gravarPesos(
  pesos: Array<{
    caminho: CaminhoAlternativa
    peso: number
    escolhas: number
    totalRespostas: number
  }>,
  data: string,
): Promise<void> {
  const firestore = obterFirestore()
  const timestamp = FieldValue.serverTimestamp()

  // Firestore aceita no máximo 500 escritas por lote.
  for (let i = 0; i < pesos.length; i += 400) {
    const lote = firestore.batch()
    for (const item of pesos.slice(i, i + 400)) {
      lote.set(
        referenciaAlternativa(item.caminho).collection(SUBCOLECAO_PONTUACAO).doc(data),
        {
          peso: item.peso,
          escolhas: item.escolhas,
          totalRespostas: item.totalRespostas,
          geradoEm: timestamp,
        },
        { merge: true },
      )
    }
    await lote.commit()
  }
}

export async function lerPesosDoDia(
  questoes: Array<{ disciplinaId: string; questaoId: string }>,
  data: string,
): Promise<Map<string, PontuacaoAlternativa>> {
  const resultados = await Promise.all(
    questoes.map(async (referencia) => {
      const busca = await referenciaQuestao(referencia.disciplinaId, referencia.questaoId)
        .collection(SUBCOLECAO_ALTERNATIVAS)
        .get()

      const mapa = new Map<string, PontuacaoAlternativa>()
      for (const doc of busca.docs) {
        const pontuacao = await doc.ref.collection(SUBCOLECAO_PONTUACAO).doc(data).get()
        if (!pontuacao.exists) continue
        const dados = pontuacao.data()!
        mapa.set(doc.id, {
          questaoId: referencia.questaoId,
          alternativaId: doc.id,
          peso: dados.peso ?? 0,
          escolhas: dados.escolhas ?? 0,
          totalRespostas: dados.totalRespostas ?? 0,
          geradoEm: dados.geradoEm instanceof Date ? dados.geradoEm : null,
        })
      }
      return mapa
    }),
  )

  const unificado = new Map<string, PontuacaoAlternativa>()
  for (const mapa of resultados) {
    for (const [id, valor] of mapa) unificado.set(`${valor.questaoId}/${id}`, valor)
  }
  return unificado
}

// ---------------------------------------------------------------------------
// Sorteio
// ---------------------------------------------------------------------------

/**
 * Desmarca todas as questões atualmente selecionadas (fluxograma: "desmarcar
 * [false] as questões anteriormente sorteadas").
 *
 * Recebe os ids das disciplinas para não precisar de uma consulta em collection
 * group — que exigiria um índice composto.
 */
export async function desmarcarQuestaoSelecionadas(disciplinaIds: string[]): Promise<number> {
  if (disciplinaIds.length === 0) return 0

  const firestore = obterFirestore()

  const porDesmarcar: Array<{ ref: FirebaseFirestore.DocumentReference; dados: DocumentData }> = []

  await Promise.all(
    disciplinaIds.map(async (disciplinaId) => {
      const busca = await colecaoQuestao(disciplinaId)
        .where('selecionada', '==', true)
        .get()

      for (const doc of busca.docs) {
        porDesmarcar.push({ ref: doc.ref, dados: doc.data()! })
      }
    }),
  )

  if (porDesmarcar.length === 0) return 0

  // Firestore aceita no máximo 500 escritas por lote.
  for (let i = 0; i < porDesmarcar.length; i += 400) {
    const lote = firestore.batch()
    for (const item of porDesmarcar.slice(i, i + 400)) {
      lote.update(item.ref, { selecionada: false, atualizadaEm: FieldValue.serverTimestamp() })
    }
    await lote.commit()
  }

  return porDesmarcar.length
}

export async function marcarQuestaoSelecionada(
  disciplinaId: string,
  questaoId: string,
  selecionada: boolean,
): Promise<void> {
  await referenciaQuestao(disciplinaId, questaoId).update({
    selecionada,
    atualizadaEm: FieldValue.serverTimestamp(),
  })
}

/** Escolhe um item aleatório de uma lista não vazia. */
export function sortear<T>(itens: T[]): T {
  if (itens.length === 0) throw new Error('sortear() recebeu lista vazia')
  return itens[Math.floor(Math.random() * itens.length)]!
}

/** Embaralha uma cópia da lista. */
export function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  }
  return copia
}