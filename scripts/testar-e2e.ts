/**
 * Teste ponta a ponta do ciclo diário contra o servidor em execução.
 *
 *   1. reinicia o dia no Firestore
 *   2. cria jogadores com padrões de resposta diferentes (para gerar raridade)
 *   3. cada um responde às 7 questões
 *   4. roda o Script Diário, que fecha o dia anterior
 *   5. confere o peso das alternativas e o ranking
 *
 *   npm run teste:e2e
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:6767'

let falhas = 0
function conferir(condicao: boolean, mensagem: string) {
  if (condicao) {
    console.log(`  ok  ${mensagem}`)
    return
  }
  falhas += 1
  console.log(`  FALHOU  ${mensagem}`)
}

type Corpo =
  | { token?: string; jogador?: { nickname: string }; erro?: string; detalhes?: unknown }
  | { correta?: boolean; pontos?: number; erro?: string }
  | Record<string, never>

async function chamar(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<{ status: number; corpo: Corpo }> {
  const resposta = await fetch(`${BASE}/api${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
  })
  const corpo = (await resposta.json().catch(() => ({}))) as Corpo
  return { status: resposta.status, corpo }
}

async function entrar(nickname: string, senha = 'teste1234'): Promise<string> {
  const { corpo } = await chamar('/auth/entrar', {
    method: 'POST',
    body: JSON.stringify({ nickname, senha }),
  })
  const token = (corpo as { token?: string }).token
  if (!token) throw new Error(`login de ${nickname} falhou: ${JSON.stringify(corpo)}`)
  return token
}

type RespostaEnvio = { casou?: boolean; pontos?: number; erro?: string }

async function responder(
  token: string,
  questaoId: string,
  resposta: string,
): Promise<{ status: number; corpo: RespostaEnvio }> {
  const resultado = await chamar('/quiz/respostas', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ questaoId, resposta, tempoDeResposta: 5 }),
  })
  return { status: resultado.status, corpo: resultado.corpo as RespostaEnvio }
}

// ---------------------------------------------------------------------------
// 1. Reinicia o dia
// ---------------------------------------------------------------------------

console.log('\n1. Reiniciando o dia no Firestore')
const { execFileSync } = await import('node:child_process')
// Sem `--apagar-jogadores`: apagar o documento do jogador deixaria as respostas
// órfãs no Firestore e a próxima rodada do teste bateria em 409.
const saidaReset = execFileSync('npx', ['tsx', 'scripts/reset-dia.ts', '--zerar-pontuacoes'], {
  encoding: 'utf8',
})
for (const linha of saidaReset.split('\n').filter((l) => l.includes('reset'))) {
  console.log(`     ${linha}`)
}
conferir(saidaReset.includes('reiniciado'), 'respostas de hoje apagadas e questões sorteadas novamente')

// ---------------------------------------------------------------------------
// 2. Jogadores com padrões diferentes
// ---------------------------------------------------------------------------

const tokenMurilo = await entrar('e2e_voujo')

const { corpo: dados } = await chamar('/quiz/rodada', {
  headers: { Authorization: `Bearer ${tokenMurilo}` },
})
const rodada = dados as unknown as {
  data: string
  questoes: Array<{ id: string; disciplinaNome: string }>
}
const questoes = rodada.questoes
const diaDeHoje = rodada.data

console.log(`\n2. Sorteio com ${questoes.length} questões`)
conferir(questoes.length === 7, `foram sorteadas 7 questões (veio ${questoes.length})`)
conferir(
  new Set(questoes.map((q) => q.disciplinaNome)).size === questoes.length,
  'nenhuma disciplina se repetiu',
)

// Voujo: acerta quase tudo. Mediano: acerta metade. Errado: erra tudo.
const respostasPorJogador: Array<{ nome: string; acertos: number }> = [
  { nome: 'e2e_medio1', acertos: 1 },
  { nome: 'e2e_medio2', acertos: 1 },
  { nome: 'e2e_erro1', acertos: 0 },
]

const alternativasPorQuestao = await carregarAlternativas(questoes.map((q) => q.id))

console.log('\n3. Respondendo como 3 jogadores')

// Voujo responde primeiro para poder reaproveitar as alternativas dos demais.
for (const [indice, questao] of questoes.entries()) {
  const aceitas = alternativasPorQuestao.get(questao.id)!.aceitas
  const naoAceita = alternativasPorQuestao.get(questao.id)!.naoAceita

  // Voujo usa uma forma rara; os dois medianos repetem a mesma, mais comum.
  const { corpo } = await responder(tokenMurilo, questao.id, aceitas[0]!)
  conferir(corpo.casou === true, `Voujo acertou: ${questao.disciplinaNome}`)
  void indice

  for (const jogador of respostasPorJogador) {
    const token = await entrar(jogador.nome)
    const resposta =
      indiceDoJogador(jogador.nome, indice) < jogador.acertos ? aceitas[1]! : naoAceita
    const r = await responder(token, questao.id, resposta)
    const deviaAcertar = indiceDoJogador(jogador.nome, indice) < jogador.acertos
    conferir(
      r.corpo.casou === deviaAcertar,
      `${jogador.nome} ${deviaAcertar ? 'acertou' : 'errou'}: ${questao.disciplinaNome}` +
        (r.corpo.casou === deviaAcertar
          ? ''
          : ` [HTTP ${r.status} casou=${r.corpo.casou} pts=${r.corpo.pontos} ` +
            `resposta="${resposta}" aceitas=${aceitas.join('/')} naoAceitaUsada="${naoAceita}" ` +
            `erro=${r.corpo.erro ?? '-'}]`),
    )
  }
}

// ---------------------------------------------------------------------------
// 4. Uma resposta repetida deve ser bloqueada
// ---------------------------------------------------------------------------

console.log('\n4. Regra de uma resposta por questão')
const repetida = await responder(tokenMurilo, questoes[0]!.id, 'qqq')
conferir(repetida.status === 409, `segunda resposta na mesma questão dá 409 (veio ${repetida.status})`)

// ---------------------------------------------------------------------------
// 5. Fechamento do dia
// ---------------------------------------------------------------------------

console.log('\n5. Rodando o Script Diário simulando a virada para amanhã')
const amanha = deslocarDia(diaDeHoje, 1)
const { corpo: relatorio } = await chamar('/admin/script-diario', {
  method: 'POST',
  body: JSON.stringify({ hoje: amanha }),
})
const resumo = relatorio as {
  dataProcessada: string
  novasQuestoes: number
  pesos: {
    questoes: Array<{
      questaoId: string
      alternativas: Array<{
        alternativaId: string
        peso: number
        escolhas: number
        totalRespostas: number
      }>
    }>
  }
  ranking: { jogadores: number; top: Array<{ nickname: string; score: number; rank: number }> }
}

conferir(resumo.dataProcessada === diaDeHoje, `o dia de hoje foi fechado (${resumo.dataProcessada})`)
conferir(resumo.novasQuestoes > 0, `novas questões sorteadas: ${resumo.novasQuestoes}`)

console.log('\n   Peso da alternativa CORRETA de cada questão:')
const pesosCorretos: number[] = []

for (const [indice, questao] of questoes.entries()) {
  const alternativa = alternativasPorQuestao.get(questao.id)!
  const porQuestao = resumo.pesos.questoes.find((p) => p.questaoId === questao.id)
  const calculada = porQuestao?.alternativas.find((a) => a.alternativaId === alternativa.aceitasIds[0])

  if (!calculada) {
    console.log(`     ${indice + 1}. ${questao.disciplinaNome.padEnd(16)} (peso nao encontrado)`)
    continue
  }

  pesosCorretos.push(calculada.peso)
  console.log(
    `     ${indice + 1}. ${questao.disciplinaNome.padEnd(16)} peso=${String(calculada.peso).padStart(3)} ` +
      `escolhas=${calculada.escolhas}/${calculada.totalRespostas}  "${alternativa.aceitas[0]}"`,
  )
}

const pesos = pesosCorretos
conferir(pesos.length > 0, 'houve peso calculado')
conferir(
  pesos.every((p) => p >= 10 && p <= 100),
  `todo peso ficou entre ${10} e ${100} (encontrados: ${Math.min(...pesos)}..${Math.max(...pesos)})`,
)
conferir(
  new Set(pesos).size > 1,
  'questões com respostas de raridade diferente receberam pesos diferentes',
)

console.log('\n   Ranking final:')
for (const jogador of resumo.ranking.top.slice(0, 5)) {
  console.log(`     ${String(jogador.rank).padStart(2)}. ${jogador.nickname.padEnd(12)} ${jogador.score} pts`)
}
conferir(resumo.ranking.jogadores >= 4, `ranking com todos os jogadores (${resumo.ranking.jogadores})`)
conferir(
  resumo.ranking.top[0]?.nickname === 'e2e_voujo',
  'quem mais acertou ficou em primeiro no ranking',
)

console.log(falhas === 0 ? '\nTodos os testes ponta a ponta passaram.' : `\n${falhas} teste(s) falharam.`)
process.exit(falhas === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function deslocarDia(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function indiceDoJogador(nome: string, indice: number): number {
  // Faz os dois "mediano" acertarem a mesma meia parte das questões.
  return nome.startsWith('e2e_medio') ? indice % 2 : indice
}

/**
 * Todas as alternativas são aceitas (o documento de alternativas guarda somente
 * alternativas corretas). Para testar o erro, usamos uma palavra inventada que
 * não casa com nenhuma delas.
 */
type AlternativasDaQuestao = {
  /** Formas aceitas: cada jogador usa uma diferente para gerar raridade. */
  aceitas: string[]
  aceitasIds: string[]
  /** Palavra inventada, que não casa com nenhuma alternativa. */
  naoAceita: string
}

async function carregarAlternativas(questoesIds: string[]) {
  const { obterFirestore } = await import('../server/firebase')
  const { listarDisciplinas, listarAlternativas } = await import('../server/repositories/disciplinas.repo')
  const firestore = obterFirestore()
  const porId = new Map<string, AlternativasDaQuestao>()

  for (const disciplina of await listarDisciplinas()) {
    const { docs } = await firestore
      .collection('disciplinas')
      .doc(disciplina.id)
      .collection('questoes')
      .get()

    for (const doc of docs) {
      if (!questoesIds.includes(doc.id)) continue
      const alternativas = await listarAlternativas(doc.id, disciplina.id)
      if (alternativas.length < 3) continue

      porId.set(doc.id, {
        aceitas: alternativas.slice(0, 3).map((a) => a.texto),
        aceitasIds: alternativas.slice(0, 3).map((a) => a.id),
        // Palavra sem relação com o tema: não casa com nenhuma alternativa.
        naoAceita: `zzqqx${doc.id.replace(/-/g, '')}w`,
      })
    }
  }

  return porId
}