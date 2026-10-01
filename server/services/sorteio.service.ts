import { config } from '../config'
import { hojeISO } from '../lib/datas'
import {
  desmarcarQuestaoSelecionadas,
  embaralhar,
  listarDisciplinas,
  listarQuestoesDaDisciplina,
  listarAlternativasDeQuestoes,
  marcarQuestaoSelecionada,
  sortear,
  type Questao,
} from '../repositories/disciplinas.repo'
import {
  garantirQuizDoDia,
  obterQuizDoDia,
  type QuestaoDoDia,
  type QuizDoDia,
} from '../repositories/quiz.repo'

export type ResultadoSorteio = {
  quiz: QuizDoDia
  /** Disciplinas que ficaram sem questão no sorteio. */
  disciplinasSemQuestao: string[]
  jaExistia: boolean
}

/**
 * Sorteia as questões do dia: uma por disciplina, sem repetir disciplina
 * (fluxograma: "sorteie 7 questões dentre as disciplinas, sem repetir a mesma
 * disciplina").
 *
 * Retorna `jaExistia: true` sem refazer o sorteio quando o documento do dia já
 * foi criado, o que mantém todos os jogadores no mesmo quiz mesmo se o script
 * rodar mais de uma vez.
 */
export async function sortearQuizDoDia(data = hojeISO()): Promise<ResultadoSorteio> {
  const existente = await obterQuizDoDia(data)
  if (existente && existente.questoes.length > 0) {
    return { quiz: existente, disciplinasSemQuestao: [], jaExistia: true }
  }

  const disciplinas = await listarDisciplinas()
  if (disciplinas.length === 0) {
    throw new Error('Nenhuma disciplina ativa cadastrada. Rode o seed primeiro.')
  }

  const candidatas = await Promise.all(
    disciplinas.map(async (disciplina) => {
      const questoes = (await listarQuestoesDaDisciplina(disciplina.id)).filter(
        // O `destaque` é cosmético: só o enunciado é obrigatório para a questão
        // ser jogável, senão conteúdo importado sem destaque nunca entraria no
        // sorteio.
        (questao) => questao.ativa && questao.enunciado.trim().length > 0,
      )
      return { disciplina, questoes }
    }),
  )

  const comQuestao = candidatas.filter((item) => item.questoes.length > 0)
  const semQuestao = candidatas
    .filter((item) => item.questoes.length === 0)
    .map((item) => item.disciplina.nome)

  if (comQuestao.length === 0) {
    throw new Error('Nenhuma disciplina possui questão ativa. Rode o seed primeiro.')
  }

  // Uma questão por disciplina, embaralhado até completar o total do dia.
  const sorteadas: Array<{ questao: Questao; disciplinaNome: string }> = []
  for (const item of embaralhar(comQuestao)) {
    sorteadas.push({ questao: sortear(item.questoes), disciplinaNome: item.disciplina.nome })
    if (sorteadas.length >= config.totalQuestoesDia) break
  }

  if (sorteadas.length < config.totalQuestoesDia) {
    console.warn(
      `[quiz-arena] only ${sorteadas.length} of ${config.totalQuestoesDia} questions ` +
        'could be drawn: there are not enough active disciplines.',
    )
  }

  // Questão sem alternativa alguma é injogável: o word match não teria contra o
  // que casar. O filtro vale para qualquer origem dos dados, inclusive quando a
  // questão é cadastrada direto no console do Firebase.
  const alternativasPorQuestao = await listarAlternativasDeQuestoes(
    sorteadas.map((item) => ({ disciplinaId: item.questao.disciplinaId, questaoId: item.questao.id })),
  )

  const jogaveis = sorteadas.filter(
    (item) => (alternativasPorQuestao.get(item.questao.id)?.length ?? 0) > 0,
  )
  const descartadas = sorteadas.length - jogaveis.length

  if (descartadas > 0) {
    console.warn(
      `[quiz-arena] ${descartadas} drawn question(s) were dropped for having no alternatives.`,
    )
  }

  if (jogaveis.length === 0) {
    throw new Error(
      'As questões sorteadas não têm alternativas cadastradas. Nada pode ser jogado hoje.',
    )
  }

  // Só desmarca as anteriores quando o sorteio realmente vai acontecer.
  const desativadas = await desmarcarQuestaoSelecionadas(disciplinas.map((item) => item.id))

  const questoes: QuestaoDoDia[] = []
  for (const [indice, item] of jogaveis.entries()) {
    const { questao } = item
    questoes.push({
      ordem: indice + 1,
      questaoId: questao.id,
      disciplinaId: questao.disciplinaId,
      disciplinaNome: item.disciplinaNome || questao.disciplinaNome,
      categoria: questao.categoria,
      enunciado: questao.enunciado,
    })
    await marcarQuestaoSelecionada(questao.disciplinaId, questao.id, true)
  }

  const quiz = await garantirQuizDoDia(data, questoes)
  console.log(
    `[quiz-arena] quiz de ${data} montado com ${questoes.length} questão(ões); ` +
      `${desativadas} questão(ões) anterior(es) desmarcada(s).`,
  )

  return { quiz, disciplinasSemQuestao: semQuestao, jaExistia: false }
}

/**
 * Garante que exista um quiz para hoje. Chamado no boot e no primeiro acesso,
 * para o servidor funcionar mesmo antes da primeira execução do cron.
 */
export async function garantirQuizDeHoje(): Promise<QuizDoDia> {
  const { quiz } = await sortearQuizDoDia(hojeISO())
  return quiz
}