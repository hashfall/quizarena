import { obterFirestore } from '../server/firebase'

/**
 * Panorama do Firestore: todas as coleções da raiz, com contagem de documentos
 * e total de questões/alternativas. Somente leitura.
 *
 *   npm run inspecionar
 */
async function main(): Promise<void> {
  const firestore = obterFirestore()
  const raizes = await firestore.listCollections()

  console.log('\n=== Coleções na raiz ===')

  for (const colecao of raizes.sort((a, b) => a.id.localeCompare(b.id))) {
    const busca = await colecao.get()
    console.log(`\n${colecao.id}/  ->  ${busca.size} documento(s)`)

    for (const doc of busca.docs) {
      const sub = await doc.ref.listCollections()
      if (sub.length === 0) {
        console.log(`  ${doc.id}  ${JSON.stringify(doc.data()).slice(0, 120)}`)
        continue
      }

      console.log(`  ${doc.id}  ${JSON.stringify(doc.data()).slice(0, 90)}`)
      for (const s of sub.sort((a, b) => a.id.localeCompare(b.id))) {
        const itens = await s.get()
        console.log(`    ${s.id}/ -> ${itens.size}`)

        let subQuestoes = 0
        let alternativas = 0
        for (const item of itens.docs) {
          for (const d of await item.ref.listCollections()) {
            const n = (await d.get()).size
            if (d.id === 'alternativas') alternativas += n
            if (d.id === 'questoes') subQuestoes += n
          }
        }
        if (subQuestoes > 0 || alternativas > 0) {
          console.log(`      ${s.id}: ${subQuestoes} questão(ões), ${alternativas} alternativa(s)`)
        }
      }
    }
  }

  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error('Falhou:', erro)
    process.exit(1)
  })