import { config } from '../config'
import {
  gravarPesos,
  listarAlternativasDeQuestoes,
  type Alternativa,
} from '../repositories/disciplinas.repo'
import { listarPlayers } from '../repositories/players.repo'
import {
  aplicarPontosRecalculados,
  listarRespostasDoDiaDeTodos,
} from '../repositories/respostas.repo'

/**
 * Nó "Pontuação" do fluxograma:
 *
 * "Com peso dinâmico que dependendo da raridade de respostas, comparando
 *  respostas entre todos os players e fazendo o cálculo ao final do dia através
 *  do Script Diário no Backend."
 *
 * Como o documento de alternativas guarda somente alternativas corretas, a
 * raridade é medida por **forma de resposta**: quantos jogadores escreveram
 * exatamente aquela forma. A resposta que ninguém mais deu é a mais cara.
 */

export type PesoCalculado = {
  alternativaId: string
  peso: number
  escolhas: number
  totalRespostas: number
}

export type ResultadoPesos = {
  data: string
  questoes: Array<{
    questaoId: string
    alternativas: PesoCalculado[]
  }>
  /** Respostas que receberam pontos após o recálculo. */
  respostasRecalculadas: number
}

/**
 * Peso dinâmico de uma forma de resposta.
 *
 * `peso = piso + (teto - piso) * (1 - escolhas/total)` — ninguém escreveu igual
 * vale o teto; todo mundo escreveu igual vale o piso.
 */
export function calcularPeso(escolhas: number, totalRespostas: number): number {
  const teto = config.pesoBaseAlternativa
  const piso = config.pesoMinimo

  if (totalRespostas <= 0) return teto
  if (escolhas <= 0) return teto

  const proporcao = Math.min(escolhas, totalRespostas) / totalRespostas
  const peso = piso + (teto - piso) * (1 - proporcao)

  return Math.round(Math.max(peso, piso))
}

/**
 * Calcula e grava o peso de cada forma de resposta aceita, comparando as
 * respostas de todos os jogadores, e reaplica os pontos das respostas do dia.
 */
export async function calcularPesosDasAlternativas(data: string): Promise<ResultadoPesos> {
  const players = await listarPlayers()
  const respostas = await listarRespostasDoDiaDeTodos(
    data,
    players.map((player) => player.id),
  )

  // Só entram no cálculo as respostas que casaram com alguma alternativa; quem
  // não casou fez zero e não influencia a raridade dos demais.
  const porQuestao = new Map<
    string,
    { disciplinaId: string; escolhas: Map<string, number>; total: number }
  >()

  for (const { item } of respostas) {
    if (!item.alternativaId) continue

    const registro = porQuestao.get(item.questaoId) ?? {
      disciplinaId: item.disciplinaId,
      escolhas: new Map<string, number>(),
      total: 0,
    }

    registro.total += 1
    registro.escolhas.set(
      item.alternativaId,
      (registro.escolhas.get(item.alternativaId) ?? 0) + 1,
    )

    porQuestao.set(item.questaoId, registro)
  }

  const questoesComResposta = [...porQuestao.entries()].map(([questaoId, registro]) => ({
    questaoId,
    disciplinaId: registro.disciplinaId,
    escolhas: registro.escolhas,
    total: registro.total,
  }))

  if (questoesComResposta.length === 0) {
    return { data, questoes: [], respostasRecalculadas: 0 }
  }

  const alternativasPorQuestao = await listarAlternativasDeQuestoes(
    questoesComResposta.map((item) => ({ disciplinaId: item.disciplinaId, questaoId: item.questaoId })),
  )

  const paraGravar: Parameters<typeof gravarPesos>[0] = []
  const resultado: ResultadoPesos['questoes'] = []

  for (const item of questoesComResposta) {
    const alternativas: Alternativa[] = alternativasPorQuestao.get(item.questaoId) ?? []

    const calculados: PesoCalculado[] = alternativas.map((alternativa) => {
      const escolhas = item.escolhas.get(alternativa.id) ?? 0
      const peso = calcularPeso(escolhas, item.total)

      paraGravar.push({
        caminho: {
          disciplinaId: item.disciplinaId,
          questaoId: item.questaoId,
          alternativaId: alternativa.id,
        },
        peso,
        escolhas,
        totalRespostas: item.total,
      })

      return { alternativaId: alternativa.id, peso, escolhas, totalRespostas: item.total }
    })

    resultado.push({ questaoId: item.questaoId, alternativas: calculados })
  }

  await gravarPesos(paraGravar, data)

  // Reaplica os pesos reais nas respostas já gravadas.
  const atualizacoes = respostas
    .filter((registro) => registro.item.alternativaId !== null)
    .map((registro) => ({
      playerId: registro.playerId,
      questaoId: registro.item.questaoId,
      pontos: pesoDeAlternativa(resultado, registro.item.questaoId, registro.item.alternativaId!),
    }))

  await aplicarPontosRecalculados(atualizacoes, data)

  return { data, questoes: resultado, respostasRecalculadas: atualizacoes.length }
}

function pesoDeAlternativa(
  resultado: ResultadoPesos['questoes'],
  questaoId: string,
  alternativaId: string,
): number {
  const questao = resultado.find((item) => item.questaoId === questaoId)
  return questao?.alternativas.find((item) => item.alternativaId === alternativaId)?.peso ?? 0
}

/**
 * Peso usado para pontuar uma resposta antes do fechamento do dia, quando ainda
 * não existe cálculo de raridade: se ainda não houver peso gravado, vale o peso
 * base cheio.
 */
export function pesoProvisional(alternativa: Alternativa | null): number {
  return alternativa ? config.pesoBaseAlternativa : 0
}
