import { FieldValue } from 'firebase-admin/firestore'

import { obterFirestore } from '../server/firebase'
import { hojeISO } from '../server/lib/datas'
import { sortearQuizDoDia } from '../server/services/sorteio.service'

/**
 * Recomeça o dia do zero, para testar o ciclo de respostas sem esperar a
 * virada do dia.
 *
 *   npm run reset:dia
 *   npm run reset:dia -- --zerar-pontuacoes
 *   npm run reset:dia -- --apagar-jogadores e2e_
 *
 * Por que apagar jogadores é opcional: o Firestore não apaga subcoleções junto
 * com o documento do pai. Deletar `players/{id}` deixa as respostas órfãs em
 * `players/{id}/respostas/...`, e elas reaparecem assim que alguém com o mesmo
 * nickname entra de novo — com o 409 de "já respondeu" sem o jogador nunca ter
 * respondido. Por isso o caminho padrão só zera as respostas, e a remoção de
 * jogadores é opt-in.
 */
async function reset(opcoes: { apagarJogadores?: string; zerarPontuacoes: boolean }): Promise<void> {
  const firestore = obterFirestore()
  const data = hojeISO()

  const jogadores = await firestore.collection('players').get()
  const prefixo = opcoes.apagarJogadores
  const alvos = prefixo
    ? jogadores.docs.filter((doc) => doc.id.startsWith(prefixo))
    : jogadores.docs

  // Itens do dia de hoje, pelo caminho completo: o documento do dia não é
  // gravado no fluxo normal (só as folhas de `itens` existem), então o dia do
  // reset nunca apareceria na listagem.
  for (const doc of alvos) {
    await apagarColecao(doc.ref.collection('respostas').doc(data).collection('itens'))
  }

  const lote = firestore.batch()
  const timestamp = FieldValue.serverTimestamp()

  for (const doc of alvos) {
    if (opcoes.apagarJogadores) {
      lote.delete(doc.ref)
      continue
    }

    lote.update(
      doc.ref,
      opcoes.zerarPontuacoes
        ? { pontuacaoTotal: 0, pontuacaoDoDia: 0, respostasHoje: 0, ranking: 0, atualizadoEm: timestamp }
        : { pontuacaoDoDia: 0, respostasHoje: 0, atualizadoEm: timestamp },
    )
  }

  if (alvos.length > 0) await lote.commit()

  await firestore.collection('quiz_do_dia').doc(data).delete()

  const { quiz } = await sortearQuizDoDia(data)

  const alvo = opcoes.apagarJogadores
    ? `${alvos.length} jogador(es) com prefixo "${prefixo}" apagado(s)`
    : `${alvos.length} jogador(es) com as respostas de ${data} zeradas`

  console.log(`[reset] ${alvo}; dia reiniciado com ${quiz.questoes.length} questão(ões).`)
}

async function apagarColecao(colecao: FirebaseFirestore.CollectionReference): Promise<void> {
  const busca = await colecao.get()
  if (busca.empty) return

  const firestore = obterFirestore()
  for (let i = 0; i < busca.docs.length; i += 400) {
    const lote = firestore.batch()
    for (const doc of busca.docs.slice(i, i + 400)) lote.delete(doc.ref)
    await lote.commit()
  }
}

const indiceApagar = process.argv.indexOf('--apagar-jogadores')

reset({
  apagarJogadores: indiceApagar === -1 ? undefined : process.argv[indiceApagar + 1],
  zerarPontuacoes: process.argv.includes('--zerar-pontuacoes'),
})
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error('[reset] falhou:', erro)
    process.exit(1)
  })