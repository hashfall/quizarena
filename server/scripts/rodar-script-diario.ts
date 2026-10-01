import { hojeISO } from '../lib/datas'
import { rodarScriptDiario } from '../services/script-diario.service'

/**
 * Dispara o Script Diário sob demanda, útil para conferir o resultado do peso
 * dinâmico e do ranking sem esperar a virada do dia.
 *
 *   npm run script:dia
 *   npm run script:dia -- 2026-10-01
 */
async function main(): Promise<void> {
  const argumento = process.argv[2]
  const hoje = argumento && /^\d{4}-\d{2}-\d{2}$/.test(argumento) ? argumento : hojeISO()

  const relatorio = await rodarScriptDiario(hoje)

  console.log('\n--- Script Diário ---')
  console.log(`Dia processado: ${relatorio.dataProcessada}`)
  console.log(`Dia gerado:      ${relatorio.dataGerada}`)
  console.log(`Novas questões:  ${relatorio.novasQuestoes}`)
  console.log(`Respostas repontuadas: ${relatorio.pesos.respostasRecalculadas}`)

  if (relatorio.disciplinasSemQuestao.length > 0) {
    console.log(`Disciplinas sem questão: ${relatorio.disciplinasSemQuestao.join(', ')}`)
  }

  console.log('\nTop do ranking:')
  for (const jogador of relatorio.ranking.top) {
    console.log(`  ${String(jogador.rank).padStart(2)}. ${jogador.nickname} — ${jogador.score} pts`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error('Script diário falhou:', erro)
    process.exit(1)
  })