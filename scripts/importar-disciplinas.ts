/**
 * Importador de disciplinas.
 *
 * Lê as disciplinas de origem — de outra coleção do Firestore ou de um JSON
 * exportado do console —, normaliza para o formato do Quiz Arena, completa os
 * campos que faltarem e substitui o conteúdo atual.
 *
 *   npm run importar -- --simular
 *   npm run importar -- --fonte Disciplina --aplicar --apagar-minhas
 *   npm run importar -- --arquivo exportacao.json --aplicar
 *
 * Por padrão nada é gravado: sem `--aplicar` o script só mostra o plano.
 */

import { readFileSync, existsSync } from 'node:fs'
import { FieldValue } from 'firebase-admin/firestore'

import { obterFirestore } from '../server/firebase'
import { COLECAO_DISCIPLINAS, SUBCOLECAO_ALTERNATIVAS, SUBCOLECAO_QUESTOES } from '../server/repositories/disciplinas.repo'
import { normalizar } from '../server/lib/texto'

// ---------------------------------------------------------------------------
// Tipo canônico de destino (o mesmo que o seed usa)
// ---------------------------------------------------------------------------

type AlternativaDestino = { slug: string; texto: string; correta: boolean }
type QuestaoDestino = {
  slug: string
  enunciado: string
  destaque: string
  categoria: string
  alternativas: AlternativaDestino[]
}
type DisciplinaDestino = {
  slug: string
  nome: string
  descricao: string
  questoes: QuestaoDestino[]
}

type Relatorio = {
  origem: string
  disciplinas: number
  questoes: number
  alternativas: number
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Leitura da origem
// ---------------------------------------------------------------------------

const COLECAO_PADRAO = 'Disciplina'

async function lerDoFirestore(nomeColecao: string): Promise<DocumentoBruto[]> {
  const firestore = obterFirestore()
  const documentos: DocumentoBruto[] = []
  const disciplinaDocs = await firestore.collection(nomeColecao).get()

  for (const doc of disciplinaDocs.docs) {
    const sub = await doc.ref.listCollections()
    const comSub = sub.find((c) => /^(questoes|perguntas|itens)$/i.test(c.id))

    documentos.push({
      id: doc.id,
      campos: doc.data() as Record<string, unknown>,
      filhos: comSub ? await lerSubcolecao(doc.ref.collection(comSub.id)) : undefined,
    })
  }

  return documentos
}

async function lerSubcolecao(colecao: FirebaseFirestore.CollectionReference): Promise<DocumentoBruto[]> {
  const busca = await colecao.get()
  const documentos: DocumentoBruto[] = []

  for (const doc of busca.docs) {
    const sub = await doc.ref.listCollections()
    const comAlternativas = sub.find((c) => /^(alternativas|opcoes|respostas)$/i.test(c.id))

    const campos = doc.data() as Record<string, unknown>
    const filhos =
      comAlternativas !== undefined
        ? await lerSubcolecao(doc.ref.collection(comAlternativas.id))
        : lerComoArray(campos.alternativas ?? campos.opcoes ?? (comAlternativas ? undefined : campos.respostas))

    documentos.push({ id: doc.id, campos, filhos })
  }

  return documentos
}

/** Aceita tanto array de objetos quanto array de strings nas alternativas. */
function lerComoArray(valor: unknown): DocumentoBruto[] | undefined {
  if (!Array.isArray(valor) || valor.length === 0) return undefined

  return valor.map((item, indice) => {
    if (typeof item === 'string') {
      return { id: `alternativa-${indice + 1}`, campos: { texto: item }, filhos: undefined }
    }

    const campos = (item ?? {}) as Record<string, unknown>
    return {
      id: String(campos.id ?? campos.slug ?? `alternativa-${indice + 1}`),
      campos,
      filhos: undefined,
    }
  })
}

/** Lê um JSON exportado do console do Firebase. */
function lerDeArquivo(caminho: string): DocumentoBruto[] {
  const bruto = JSON.parse(readFileSync(caminho, 'utf8')) as unknown

  // Aceita o array direto, o envelope {disciplinas: [...]}, ou uma lista de
  // {name, fields, subcollections} vinda do `firebase firestore:export`.
  let itens: unknown[] = []
  if (Array.isArray(bruto)) itens = bruto
  else if (bruto && typeof bruto === 'object') {
    const objeto = bruto as Record<string, unknown>
    const alvo = objeto.disciplinas ?? objeto.Disciplina ?? objeto.documentos ?? objeto.docs
    if (Array.isArray(alvo)) itens = alvo
  }

  return itens.map((item, indice) => {
    const objeto = toObjeto(item)
    const id = ultimoSegmento(objeto.name) || toTexto(objeto.id) || `disciplina-${indice + 1}`
    const campos = 'fields' in objeto ? desnormalizarCampos(objeto.fields) : objeto

    return {
      id,
      campos,
      filhos: lerFilhosDoExport(objeto, /^(questoes|perguntas|itens)$/i, 'questao'),
    }
  })
}

/**
 * Lê os filhos de um documento de exportação. Aceita a subcoleção aninhada
 * (`subcollections`) e, quando não existe, um array dentro dos próprios campos
 * (`questoes: [...]`), que é como muitos alunos exportam.
 */
function lerFilhosDoExport(
  documento: Record<string, unknown>,
  nomeProcurado: RegExp,
  prefixo: string,
  camposAlternativos?: readonly string[],
): DocumentoBruto[] | undefined {
  const subcolecoes = documento.subcollections ?? documento.children

  if (Array.isArray(subcolecoes)) {
    const alvo = subcolecoes.find((s) => nomeProcurado.test(toTexto(toObjeto(s).name)))

    if (Array.isArray(alvo?.documents)) {
      return alvo.documents.map((bruto: unknown, indice: number) => {
        const objeto = toObjeto(bruto)
        const campos = 'fields' in objeto ? desnormalizarCampos(objeto.fields) : objeto

        return {
          id: ultimoSegmento(objeto.name) || toTexto(objeto.id) || `${prefixo}-${indice + 1}`,
          campos,
          filhos: lerFilhosDoExport(objeto, REGEX_ALTERNATIVAS, 'alternativa', NOMES_ALTERNATIVAS),
        }
      })
    }
  }

  // Formato plano: as questões (ou alternativas) são um array dentro dos campos.
  const campos = 'fields' in documento ? desnormalizarCampos(documento.fields) : documento
  const nomes = camposAlternativos ?? [...nomeProcurado.source.matchAll(/[a-z]+/gi)].map((m) => m[0]!)

  for (const chave of nomes) {
    const lista = lerComoArray(campos[chave])
    if (!lista) continue

    // Cada item da lista pode ter os próprios filhos em array (uma questão com
    // `alternativas: [...]`), então a leitura continua descendo.
    return lista.map((item) => ({
      ...item,
      filhos: item.filhos ?? lerFilhosDoExport(item.campos, REGEX_ALTERNATIVAS, 'alternativa', NOMES_ALTERNATIVAS),
    }))
  }

  return undefined
}

const REGEX_ALTERNATIVAS = /^(alternativas|opcoes)$/i
const NOMES_ALTERNATIVAS = ['alternativas', 'opcoes'] as const

function toObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function toTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

/** "projects/x/databases/(default)/documents/Disciplina/artes" -> "artes". */
function ultimoSegmento(caminho: unknown): string {
  const partes = toTexto(caminho).split('/').filter(Boolean)
  return partes[partes.length - 1] ?? ''
}

/** Converte {campo: {stringValue: "x"}} do formato de exportação para objeto. */
function desnormalizarCampos(bruto: unknown): Record<string, unknown> {
  const campos = toObjeto(bruto)
  const saida: Record<string, unknown> = {}

  for (const [chave, valor] of Object.entries(campos)) {
    const wrapper = toObjeto(valor)
    const chaves = Object.keys(wrapper)

    // Valor simples exportado pelo console: {campo: {stringValue: "x"}}.
    if (chaves.length === 1 && chaves[0]!.endsWith('Value')) {
      saida[chave] = desnormalizarValor(chave, wrapper[chaves[0]!])
      continue
    }

    saida[chave] = 'fields' in wrapper ? desnormalizarCampos(wrapper.fields) : wrapper
  }

  return saida
}

function desnormalizarValor(chave: string, valor: unknown): unknown {
  if (chave === 'nullValue') return null
  if (chave === 'timestampValue' || chave === 'dateValue') return valor
  if (chave === 'integerValue' || chave === 'doubleValue') return Number(valor)
  if (chave === 'booleanValue') return Boolean(valor)
  if (chave === 'arrayValue') {
    const valores = toObjeto(valor).values
    return Array.isArray(valores) ? valores.map((v) => desnormalizarCampos(toObjeto(v).fields ?? v)) : []
  }
  if (chave === 'mapValue') return desnormalizarCampos(toObjeto(valor).fields)
  return valor
}

/**
 * Documento de origem, já normalizado em "pai -> filhos", venha ele de uma
 * subcoleção do Firestore ou de um array dentro de um documento.
 *
 * `filhos` são as questões de uma disciplina e as alternativas de uma questão.
 */
type DocumentoBruto = {
  id: string
  campos: Record<string, unknown>
  filhos?: DocumentoBruto[]
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

function texto(...candidatos: unknown[]): string {
  for (const candidato of candidatos) {
    if (typeof candidato === 'string' && candidato.trim()) return candidato.trim()
    if (typeof candidato === 'number') return String(candidato)
  }
  return ''
}

function chaveDe(valor: string): string {
  return (
    normalizar(valor)
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  )
}

function normalizarDisciplinas(
  brutos: DocumentoBruto[],
  avisos: string[],
): DisciplinaDestino[] {
  const slugsUsados = new Set<string>()
  const destino: DisciplinaDestino[] = []

  for (const bruto of brutos) {
    const nome = texto(bruto.campos.nome, bruto.campos.name, bruto.campos.disciplina, bruto.campos.titulo, bruto.id)

    let slug = chaveDe(nome)
    if (slugsUsados.has(slug)) {
      slug = `${slug}-${chaveDe(bruto.id)}`
      avisos.push(`Disciplina "${nome}" repetiu o id "${chaveDe(nome)}"; usando "${slug}".`)
    }
    slugsUsados.add(slug)

    const questoes = (bruto.filhos ?? []).flatMap((q) => {
      const normalizada = normalizarQuestao(q, nome, avisos)
      return normalizada ? [normalizada] : []
    })

    if (questoes.length === 0) {
      avisos.push(`Disciplina "${nome}" ficou sem nenhuma questão jogável e não foi importada.`)
      slugsUsados.delete(slug)
      continue
    }

    destino.push({
      slug,
      nome,
      descricao: texto(bruto.campos.descricao, bruto.campos.description, bruto.campos.texto),
      questoes,
    })
  }

  return destino
}

function normalizarQuestao(
  bruto: DocumentoBruto,
  nomeDisciplina: string,
  avisos: string[],
): QuestaoDestino | null {
  const enunciado = texto(
    bruto.campos.enunciado,
    bruto.campos.pergunta,
    bruto.campos.prompt,
    bruto.campos.texto,
    bruto.campos.titulo,
    bruto.campos.nome,
    bruto.id,
  )

  if (!enunciado) {
    avisos.push(`Questão "${bruto.id}" sem enunciado foi descartada.`)
    return null
  }

  const alternativas = (bruto.filhos ?? []).flatMap((a) => {
    const item = texto(a.campos.texto, a.campos.text, a.campos.alternativa, a.campos.opcao, a.campos.nome, a.campos.resposta, a.campos.id)
    return item ? [{ item, correta: Boolean(a.campos.correta ?? a.campos.certa ?? a.campos.respostaCorreta ?? a.campos.verdadeiro), id: a.id }] : []
  })

  const completas = completarAlternativas(alternativas, `${nomeDisciplina}/${enunciado}`, avisos)

  // Questão sem alternativa alguma não tem resposta possível, então ela sai da
  // importação: nem o servidor nem o jogador conseguiriam jogá-la.
  if (completas.length === 0) return null

  return {
    slug: chaveDe(`${nomeDisciplina}-${bruto.id || enunciado}`),
    enunciado,
    destaque: texto(bruto.campos.destaque, bruto.campos.palavra, bruto.campos.destaqueTexto, bruto.campos.trecho),
    categoria: texto(bruto.campos.categoria, bruto.campos.materia, bruto.campos.topico, nomeDisciplina),
    alternativas: completas,
  }
}

/**
 * Normaliza as alternativas e avisa sobre casos duvidosos.
 *
 * Várias alternativas podem estar corretas: a resposta é digitada por extenso e
 * o enunciado costuma aceitar sinônimos. O que não pode acontecer é não haver
 * nenhuma correta (aí ninguém pontua) ou os sinônimos virarem distratores.
 */
function completarAlternativas(
  alternativas: Array<{ item: string; correta: boolean; id: string }>,
  contexto: string,
  avisos: string[],
): AlternativaDestino[] {
  if (alternativas.length === 0) {
    avisos.push(`"${contexto}" ficou sem alternativas e foi descartada.`)
    return []
  }

  if (!alternativas.some((a) => a.correta)) {
    avisos.push(`"${contexto}" não tinha alternativa marcada como correta; assumindo a primeira.`)
    alternativas[0]!.correta = true
  }

  const slugs = new Set<string>()
  return alternativas.map((alternativa) => {
    let slug = chaveDe(alternativa.id || alternativa.item)
    if (slugs.has(slug)) slug = `${slug}-${slugs.size + 1}`
    slugs.add(slug)
    return { slug, texto: alternativa.item, correta: alternativa.correta }
  })
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

async function gravar(disciplinas: DisciplinaDestino[]): Promise<void> {
  const firestore = obterFirestore()
  const timestamp = FieldValue.serverTimestamp()

  for (const disciplina of disciplinas) {
    const ref = firestore.collection(COLECAO_DISCIPLINAS).doc(disciplina.slug)

    await ref.set(
      { nome: disciplina.nome, descricao: disciplina.descricao, ativa: true, atualizadoEm: timestamp },
      { merge: true },
    )

    for (const questao of disciplina.questoes) {
      const refQuestao = ref.collection(SUBCOLECAO_QUESTOES).doc(questao.slug)

      await refQuestao.set(
        {
          enunciado: questao.enunciado,
          destaque: questao.destaque,
          categoria: questao.categoria,
          disciplinaNome: disciplina.nome,
          ativa: true,
          // Quem compõe o quiz do dia é o sorteio, não a importação.
          selecionada: false,
          atualizadoEm: timestamp,
        },
        { merge: true },
      )

      for (const [ordem, alternativa] of questao.alternativas.entries()) {
        await refQuestao
          .collection(SUBCOLECAO_ALTERNATIVAS)
          .doc(alternativa.slug)
          .set(
            { texto: alternativa.texto, correta: alternativa.correta, ordem, atualizadoEm: timestamp },
            { merge: true },
          )
      }
    }
  }
}

/** Remove conteúdo anterior de `disciplinas`, incluindo subcoleções. */
async function apagarDisciplinas(): Promise<number> {
  const firestore = obterFirestore()
  const busca = await firestore.collection(COLECAO_DISCIPLINAS).get()

  for (const doc of busca.docs) {
    const questoes = await doc.ref.collection(SUBCOLECAO_QUESTOES).get()

    for (const questao of questoes.docs) {
      const alternativas = await questao.ref.collection(SUBCOLECAO_ALTERNATIVAS).get()
      if (!alternativas.empty) {
        const lote = firestore.batch()
        for (const a of alternativas.docs) lote.delete(a.ref)
        await lote.commit()
      }

      const pesagens = await questao.ref.collection('pontuacao').get()
      if (!pesagens.empty) {
        const lote = firestore.batch()
        for (const p of pesagens.docs) lote.delete(p.ref)
        await lote.commit()
      }
    }

    if (!questoes.empty) {
      const lote = firestore.batch()
      for (const q of questoes.docs) lote.delete(q.ref)
      await lote.commit()
    }
  }

  const lote = firestore.batch()
  for (const doc of busca.docs) lote.delete(doc.ref)
  await lote.commit()

  return busca.size
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function opcao(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`)
  return indice === -1 ? undefined : process.argv[indice + 1]
}

async function main(): Promise<void> {
  const arquivo = opcao('arquivo')
  const nomeColecao = opcao('fonte') ?? COLECAO_PADRAO
  const aplicar = process.argv.includes('--aplicar')
  const apagarMinhas = process.argv.includes('--apagar-minhas')

  if (arquivo && !existsSync(arquivo)) {
    throw new Error(`Arquivo não encontrado: ${arquivo}`)
  }

  const origem = arquivo ?? `coleção Firestore "${nomeColecao}"`
  const brutos = arquivo ? lerDeArquivo(arquivo) : await lerDoFirestore(nomeColecao)

  if (brutos.length === 0) {
    console.log(`\nNada encontrado em ${origem}.`)
    console.log('Nada foi alterado.\n')
    return
  }

  const avisos: string[] = []
  const disciplinas = normalizarDisciplinas(brutos, avisos)

  const totalQuestoes = disciplinas.reduce((s, d) => s + d.questoes.length, 0)
  const totalAlternativas = disciplinas.reduce(
    (s, d) => s + d.questoes.reduce((t, q) => t + q.alternativas.length, 0),
    0,
  )

  const relatorio: Relatorio = {
    origem,
    disciplinas: disciplinas.length,
    questoes: totalQuestoes,
    alternativas: totalAlternativas,
    avisos,
  }

  console.log(`\n=== Importação de ${origem} ===\n`)
  for (const disciplina of disciplinas) {
    console.log(`${disciplina.nome}  [${disciplina.slug}]  — ${disciplina.questoes.length} questão(ões)`)
    for (const questao of disciplina.questoes) {
      console.log(`   · ${questao.enunciado}`)
      if (questao.destaque) console.log(`     destaque: ${questao.destaque}`)
      for (const alternativa of questao.alternativas) {
        console.log(`       ${alternativa.correta ? '*' : ' '} ${alternativa.texto}`)
      }
      if (questao.alternativas.length === 0) {
        console.log('       (sem alternativas — a questão não entra no sorteio)')
      }
    }
  }

  console.log(
    `\nTotal: ${relatorio.disciplinas} disciplina(s), ${relatorio.questoes} questão(ões), ` +
      `${relatorio.alternativas} alternativa(s).`,
  )

  if (avisos.length > 0) {
    console.log(`\nAvisos (${avisos.length}):`)
    for (const aviso of avisos) console.log(`  - ${aviso}`)
  }

  if (!aplicar) {
    console.log('\nSimulação apenas. Para gravar, rode de novo com --aplicar.')
    if (apagarMinhas) console.log('(vai usar --apagar-minhas para trocar o conteúdo atual)')
    console.log()
    return
  }

  if (apagarMinhas) {
    const apagadas = await apagarDisciplinas()
    console.log(`\n${apagadas} disciplina(s) anterior(es) removida(s).`)
  }

  await gravar(disciplinas)
  console.log(`\nImportação concluída em ${relatorio.disciplinas} disciplina(s).\n`)
}

main()
  .then(() => process.exit(0))
  .catch((erro: unknown) => {
    console.error('\nImportação falhou:', erro, '\n')
    process.exit(1)
  })