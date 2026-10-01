import { deslocarDia, hojeISO } from '../lib/datas'
import { calcularPesosDasAlternativas, type ResultadoPesos } from './peso.service'
import { fecharRankingDoDia } from './ranking.service'
import { sortearQuizDoDia } from './sorteio.service'

/**
 * Script Diário — roda às 00h00 por cron job.
 *
 * A ordem abaixo respeita a dependência do fluxograma: o ranking é calculado
 * "com base no peso das alternativas", então o peso precisa existir antes.
 *
 *   1. Cálculo de peso das alternativas e update dos pesos no Firebase
 *   2. Ranking: calcular o ranking dos players e salvar no Firebase
 *   3. Sorteie 7 novas questões, sem repetir disciplina,
 *      desmarcando [false] as questões anteriormente sorteadas
 *
 * A pontuação e o sorteio usam o dia que acabou de fechar (ontem), para que a
 * rodada encerrada seja pontuada antes de virar o novo dia.
 */

export type RelatorioScriptDiario = {
  /** Dia fechado por este ciclo. */
  dataProcessada: string
  /** Dia do novo sorteio. */
  dataGerada: string
  pesos: ResultadoPesos
  ranking: Awaited<ReturnType<typeof fecharRankingDoDia>>
  novasQuestoes: number
  disciplinasSemQuestao: string[]
}

export async function rodarScriptDiario(
  hoje = hojeISO(),
): Promise<RelatorioScriptDiario> {
  const inicio = Date.now()
  const diaFechado = deslocarDia(hoje, -1)

  console.log(`[script-diario] iniciando ciclo em ${hoje} (fechando ${diaFechado})`)

  // 1. Peso dinâmico das alternativas, comparando as respostas de todos.
  const pesos = await calcularPesosDasAlternativas(diaFechado)
  console.log(
    `[script-diario] pesos calculados para ${pesos.questoes.length} questão(ões), ` +
      `${pesos.respostasRecalculadas} resposta(s) repontuada(s).`,
  )

  // 2. Ranking cumulativo dos jogadores com base no peso das alternativas.
  const ranking = await fecharRankingDoDia(diaFechado)
  console.log(`[script-diario] ranking de ${ranking.jogadores} jogador(es) atualizado.`)

  // 3. Sorteio do novo dia, desmarcando as questões anteriores.
  const sorteio = await sortearQuizDoDia(hoje)

  const relatorio: RelatorioScriptDiario = {
    dataProcessada: diaFechado,
    dataGerada: hoje,
    pesos,
    ranking,
    novasQuestoes: sorteio.quiz.questoes.length,
    disciplinasSemQuestao: sorteio.disciplinasSemQuestao,
  }

  console.log(`[script-diario] concluído em ${Date.now() - inicio}ms`)
  return relatorio
}