import { FieldValue } from 'firebase-admin/firestore'

import { chaveDeAlternativa, validarConteudo } from '../../scripts/validar-conteudo.lib'

import { obterFirestore } from '../firebase'
import {
  COLECAO_DISCIPLINAS,
  SUBCOLECAO_ALTERNATIVAS,
  SUBCOLECAO_QUESTOES,
} from '../repositories/disciplinas.repo'
import { COLECAO_TEMAS } from '../repositories/quiz.repo'
import { DISCIPLINAS_SEED, TEMAS_SEED } from './dados-do-seed'

/**
 * Popula o Firestore com o conteúdo inicial.
 *
 * O seed é idempotente: os documentos usam slug como id e nada é sobrescrito
 * sem confirmação. Documentos que saíram do arquivo de seed continuam no banco
 * (e continuariam sendo sorteados) até você rodar com `--limpar`.
 *
 *   npm run seed
 *   npm run seed -- --limpar
 */
async function seed(limpar: boolean): Promise<void> {
  // Nada é gravado com conteúdo inconsistente: é mais barato corrigir o arquivo
  // do que descobrir depois que o quiz sorteou uma questão impossível.
  validarConteudo()

  const firestore = obterFirestore()
  const timestamp = FieldValue.serverTimestamp()

  for (const tema of TEMAS_SEED) {
    await firestore
      .collection(COLECAO_TEMAS)
      .doc(tema.slug)
      .set({ ...tema, atualizadoEm: timestamp }, { merge: true })
  }
  console.log(`Temas: ${TEMAS_SEED.length}`)

  let totalQuestoes = 0
  let totalAlternativas = 0

  for (const disciplina of DISCIPLINAS_SEED) {
    const refDisciplina = firestore.collection(COLECAO_DISCIPLINAS).doc(disciplina.slug)

    await refDisciplina.set(
      {
        nome: disciplina.nome,
        descricao: disciplina.descricao,
        ativa: true,
        atualizadoEm: timestamp,
      },
      { merge: true },
    )

    for (const questao of disciplina.questoes) {
      const refQuestao = refDisciplina.collection(SUBCOLECAO_QUESTOES).doc(questao.slug)

      await refQuestao.set(
        {
          enunciado: questao.enunciado,
          categoria: questao.categoria,
          disciplinaNome: disciplina.nome,
          ativa: true,
          // O sorteio do dia é quem marca `selecionada`.
          selecionada: false,
          atualizadoEm: timestamp,
        },
        { merge: true },
      )
      totalQuestoes += 1

      for (const [ordem, alternativa] of questao.alternativas.entries()) {
        const slugAlternativa = chaveDeAlternativa(alternativa)

        await refQuestao
          .collection(SUBCOLECAO_ALTERNATIVAS)
          .doc(slugAlternativa)
          .set({ texto: alternativa, ordem, atualizadoEm: timestamp }, { merge: true })

        totalAlternativas += 1
      }

      if (limpar) await apagarHouveirins(refQuestao, new Set(questao.alternativas.map(chaveDeAlternativa)))
    }

    if (limpar) await apagarHouveirinsQuestoes(refDisciplina)

    console.log(`Disciplina "${disciplina.nome}": ${disciplina.questoes.length} questão(ões).`)
  }

  console.log(
    `\nSeed concluído: ${DISCIPLINAS_SEED.length} disciplinas, ` +
      `${totalQuestoes} questões, ${totalAlternativas} alternativas, ` +
      `${TEMAS_SEED.length} temas.`,
  )
}

/** Remove alternativas que saíram do seed dentro de uma questão. */
async function apagarHouveirins(
  refQuestao: FirebaseFirestore.DocumentReference,
  slugsValidos: Set<string>,
): Promise<void> {
  const firestore = obterFirestore()
  const busca = await refQuestao.collection(SUBCOLECAO_ALTERNATIVAS).get()
  const docs = busca.docs.filter((doc) => !slugsValidos.has(doc.id))
  if (docs.length === 0) return

  const lote = firestore.batch()
  for (const doc of docs) lote.delete(doc.ref)
  await lote.commit()

  console.log(`  alternativa(s) removida(s): ${docs.map((doc) => doc.id).join(', ')}`)
}

/** Remove questões que saíram do seed dentro de uma disciplina. */
async function apagarHouveirinsQuestoes(
  refDisciplina: FirebaseFirestore.DocumentReference,
): Promise<void> {
  const disciplina = DISCIPLINAS_SEED.find((item) => item.slug === refDisciplina.id)
  if (!disciplina) return

  const firestore = obterFirestore()
  const slugs = new Set(disciplina.questoes.map((questao) => questao.slug))
  const busca = await refDisciplina.collection(SUBCOLECAO_QUESTOES).get()
  const docs = busca.docs.filter((doc) => !slugs.has(doc.id))
  if (docs.length === 0) return

  const lote = firestore.batch()
  for (const doc of docs) {
    // Apagar a questão não apaga as subcoleções: é preciso limpar antes.
    await apagarColecao(doc.ref.collection(SUBCOLECAO_ALTERNATIVAS))
    lote.delete(doc.ref)
  }
  await lote.commit()

  console.log(`  questão(ões) removida(s): ${docs.map((doc) => doc.id).join(', ')}`)
}

async function apagarColecao(colecao: FirebaseFirestore.CollectionReference): Promise<void> {
  const busca = await colecao.get()
  if (busca.empty) return

  const lote = obterFirestore().batch()
  for (const doc of busca.docs) lote.delete(doc.ref)
  await lote.commit()
}

seed(process.argv.includes('--limpar'))
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error('Seed falhou:', erro)
    process.exit(1)
  })