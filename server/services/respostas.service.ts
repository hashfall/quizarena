import { hojeISO } from '../lib/datas'
import { erroConflito, erroValidacao } from '../lib/http'
import { casarPorWord, higienizarResposta, normalizar, palavrasSignificativas } from '../lib/texto'
import { listarAlternativas, type Alternativa } from '../repositories/disciplinas.repo'
import { obterQuizDoDia, type QuestaoDoDia } from '../repositories/quiz.repo'
import { somarPontuacaoDoDia } from '../repositories/players.repo'
import { gravarResposta, obterResposta } from '../repositories/respostas.repo'
import { pesoProvisional } from './peso.service'

export type RegistrarRespostaEntrada = {
  playerId: string
  questaoId: string
  resposta: string
  tempoDeResposta: number
}

export type RegistrarRespostaSaida = {
  registrada: boolean
  /**
   * A resposta casou com alguma das alternativas aceitas. Como o documento de
   * alternativas guarda somente alternativas corretas, não existe resposta
   * errada: ou a palavra bateu com uma forma aceita, ou não bateu com nenhuma.
   */
  casou: boolean
  pontos: number
  jaRespondida: boolean
}

export type ResultadoMatch = {
  alternativa: Alternativa | null
  precisao: number
}

/**
 * Word match da resposta do jogador contra as alternativas da questão
 * (fluxograma: "é dado um match like por word para tentar encontrar a
 * alternativa correta no firebase", ignorando case e acentos).
 *
 * Todas as alternativas do documento são corretas, então basta descobrir qual
 * delas o jogador usou — é essa forma que define a raridade da resposta.
 *
 * Em empate vence a alternativa mais específica: quem escreve "o Rio Una" casa
 * com "Rio Una" e não com o genérico "Rio". Empates exatos vão para a primeira
 * alternativa do banco.
 */
export function melhorAlternativa(
  resposta: string,
  alternativas: Alternativa[],
): ResultadoMatch {
  let melhor: ResultadoMatch = { alternativa: null, precisao: 0 }

  for (const alternativa of alternativas) {
    const { casou, precisao } = casarPorWord(resposta, alternativa.texto)
    if (!casou) continue

    const pesoPalavras = palavrasSignificativas(alternativa.texto).length
    const melhorPeso = melhor.alternativa
      ? palavrasSignificativas(melhor.alternativa.texto).length
      : 0

    const melhorou =
      melhor.alternativa === null ||
      precisao > melhor.precisao ||
      (precisao === melhor.precisao && pesoPalavras > melhorPeso)

    if (melhorou) {
      melhor = { alternativa, precisao }
    }
  }

  return melhor
}

/** Localiza a questão dentro do sorteio do dia. */
async function localizarQuestaoDoDia(questaoId: string, data: string): Promise<QuestaoDoDia> {
  const quiz = await obterQuizDoDia(data)
  if (!quiz) throw erroConflito('O quiz do dia ainda não foi sorteado.')

  const questao = quiz.questoes.find((item) => item.questaoId === questaoId)
  if (!questao) throw erroValidacao('Esta questão não faz parte do quiz de hoje.')
  return questao
}

/**
 * Registra a resposta do jogador: faz o word match, grava a resposta e soma o
 * placar provisório do dia. Uma resposta por questão.
 */
export async function registrarResposta(
  entrada: RegistrarRespostaEntrada,
  data = hojeISO(),
): Promise<RegistrarRespostaSaida> {
  const resposta = higienizarResposta(entrada.resposta)
  // Um caractere alfanumérico basta: a questão de número primo aceita "2", "3",
  // "5" e "7". O que não passa é texto sem letra nem número, que o `normalizar`
  // reduz a string vazia.
  if (normalizar(resposta).length < 1) {
    throw erroValidacao('Escreva a resposta antes de enviar.')
  }

  const questaoDoDia = await localizarQuestaoDoDia(entrada.questaoId, data)

  const existente = await obterResposta(entrada.playerId, data, entrada.questaoId)
  if (existente) {
    throw erroConflito('Você já respondeu esta questão hoje.')
  }

  const alternativas = await listarAlternativas(questaoDoDia.questaoId, questaoDoDia.disciplinaId)
  const match = melhorAlternativa(resposta, alternativas)
  const pontos = pesoProvisional(match.alternativa)

  await gravarResposta(entrada.playerId, data, {
    questaoId: questaoDoDia.questaoId,
    disciplinaId: questaoDoDia.disciplinaId,
    resposta,
    respostaNormalizada: normalizar(resposta),
    alternativaId: match.alternativa?.id ?? null,
    alternativaTexto: match.alternativa?.texto ?? null,
    casou: match.alternativa !== null,
    pontos,
    tempoDeResposta: Math.max(0, Math.round(entrada.tempoDeResposta || 0)),
  })

  await somarPontuacaoDoDia(entrada.playerId, pontos)

  return {
    registrada: true,
    casou: match.alternativa !== null,
    pontos,
    jaRespondida: false,
  }
}