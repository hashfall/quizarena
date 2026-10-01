import {
  DISCIPLINAS_ESPERADAS,
  MIN_ALTERNATIVAS,
  MIN_QUESTOES,
  resumoDoConteudo,
  validarConteudo,
} from './validar-conteudo.lib'

/**
 * Confere o conteúdo do seed sem gravar nada.
 *
 *   npm run validar:conteudo
 *
 * As mesmas regras rodam dentro de `npm run seed`, que se recusa a gravar
 * conteúdo inconsistente.
 */
const problemas = validarConteudo()

for (const problema of problemas) {
  console.log(`  ✗ ${problema}`)
}

const resumo = resumoDoConteudo()
console.log(`\n${resumo.disciplinas} disciplinas, ${resumo.questoes} questões, ${resumo.alternativas} alternativas.`)
console.log(`Esperado: ${DISCIPLINAS_ESPERADAS.join(', ')}`)
console.log(`Mínimo: ${MIN_QUESTOES} questões por disciplina, ${MIN_ALTERNATIVAS} alternativas por questão.\n`)

if (problemas.length > 0) {
  console.log(`${problemas.length} problema(s).\n`)
  process.exit(1)
}

console.log('Conteúdo válido.\n')
