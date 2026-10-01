import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  CircleHelp,
  CircleX,
  Clock3,
  Gamepad2,
  History,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react'

import { useAuth } from './contexts/AuthContext'
import { api, ErroApi } from './lib/api'
import LoginPage from './pages/LoginPage'
import type {
  AnswerSubmissionStatus,
  CurrentQuestion,
  CurrentUser,
  QuizArenaData,
  RankingPlayer,
  SubmitAnswerResult,
  ThemeHistoryItem,
} from './types/quiz'

// -----------------------------------------------------------------------------
// Carregamento da rodada
// -----------------------------------------------------------------------------

/**
 * Carrega a rodada do jogador autenticado. Só busca quando há sessão, e busca
 * de novo sempre que o jogador muda (login e logout), porque o componente da
 * tela não é desmontado entre a pré-página e o quiz.
 */
function useRodada(playerId: string | null) {
  const [rodada, setRodada] = useState<QuizArenaData | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!playerId) return

    setCarregando(true)
    setErro(null)

    try {
      setRodada(await api.rodada())
    } catch (falha) {
      setErro(
        falha instanceof ErroApi ? falha.message : 'Não foi possível carregar as questões do dia.',
      )
    } finally {
      setCarregando(false)
    }
  }, [playerId])

  useEffect(() => {
    if (!playerId) {
      setRodada(null)
      setErro(null)
      setCarregando(false)
      return
    }

    void carregar()
  }, [playerId, carregar])

  return { rodada, carregando, erro, carregar, setRodada }
}

/**
 * A pergunta é sempre uma pergunta aberta, então o título é o enunciado mais o
 * ponto de interrogação. Se o enunciado já vem interrogativo, não repetimos.
 *
 * Conteúdo antigo grava a pergunta partida entre `enunciado` e `destaque`
 * (o trecho em destaque fecha a frase). Renderizar só o `enunciado` deixaria a
 * pergunta cortada, então os dois são remontados aqui — com o destaque no
 * `<span>` que o `.question-title span` pinta de ciano.
 */
function TituloQuestao({ enunciado, destaque }: { enunciado: string; destaque: string }) {
  const base = enunciado.trim()
  const trecho = destaque.trim()

  const texto = base.endsWith('?') ? base : `${base}?`
  const [corpo, fecho] = trecho ? [texto.slice(0, -1), texto.slice(-1)] : [texto, '']

  return (
    <h1 className="question-title">
      {corpo}
      {trecho ? <span> {trecho}</span> : ''}
      {fecho}
    </h1>
  )
}

// -----------------------------------------------------------------------------
// Componentes visuais reutilizáveis
// -----------------------------------------------------------------------------

function QuizArenaBrand() {
  return (
    <div className="flex items-center gap-3" aria-label="Quiz Arena">
      <img className="brand-logo" src="/quiz-arena-logo.png" alt="Quiz! Arena" />
    </div>
  )
}

type SectionHeadingProps = {
  icon: typeof Trophy
  children: string
  actionLabel?: string
}

function SectionHeading({ icon: Icon, children, actionLabel }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={17} className="text-cyan" strokeWidth={2.2} />
        <h2 className="text-[14px] font-bold tracking-wide text-slate-100">{children}</h2>
      </div>
      {actionLabel && (
        <button className="section-action" type="button">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Coluna esquerda: tema atual e histórico
// -----------------------------------------------------------------------------

type LeftSidebarProps = {
  tema: ThemeHistoryItem | null
  historico: ThemeHistoryItem[]
  respondidas: number
  total: number
}

function LeftSidebar({ tema, historico, respondidas, total }: LeftSidebarProps) {
  return (
    <aside className="space-y-4">
      <section className="panel p-4">
        <SectionHeading icon={CalendarDays}>Tema do Dia</SectionHeading>

        <div className="topic-card">
          <div className="topic-icon"><Gamepad2 size={23} /></div>
          <div>
            <h3 className="text-[16px] font-extrabold text-white">{tema?.titulo ?? 'Em preparação'}</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-400">
              {tema?.descricao ?? 'O próximo tema será revelado no sorteio das 00h.'}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-[10px] border border-line/70 bg-ink/50 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>Seu progresso hoje</span>
            <span className="tabular-nums text-cyan">
              {respondidas}/{total}
            </span>
          </div>
          <div className="progress-track mt-2" style={{ margin: '8px 0 0' }}>
            <div
              className="progress-value"
              style={{ width: `${total === 0 ? 0 : (respondidas / total) * 100}%` }}
            />
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <SectionHeading icon={History} actionLabel="ver tudo">
          Histórico de Temas
        </SectionHeading>
        <p className="mb-3 -mt-2 text-[11px] text-slate-500">Últimos temas</p>

        <div>
          {historico.length === 0 && (
            <p className="px-2 py-3 text-[12px] text-slate-500">Nenhum tema cadastrado ainda.</p>
          )}
          {historico.map((temaItem) => (
            <button className="history-row group" key={temaItem.id} type="button">
              <div className={`history-icon ${temaItem.tom}`}>
                <Gamepad2 size={15} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12px] font-semibold text-slate-200">{temaItem.titulo}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{temaItem.dataLabel}</p>
              </div>
              <ArrowRight size={13} className="history-arrow" />
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}

// -----------------------------------------------------------------------------
// Coluna direita: ranking e busca por nickname
// -----------------------------------------------------------------------------

type RankingSidebarProps = {
  rankingInicial: RankingPlayer[]
  jogadorAtual: CurrentUser
}

function RankingSidebar({ rankingInicial, jogadorAtual }: RankingSidebarProps) {
  const [searchText, setSearchText] = useState('')
  const [busca, setBusca] = useState<RankingPlayer[] | null>(null)
  const [buscando, setBuscando] = useState(false)

  // Sem termo de busca o painel usa o ranking que já veio na rodada; só a
  // pesquisa por nickname vai ao servidor, com um atraso curto para não pedir
  // uma requisição por tecla digitada.
  useEffect(() => {
    const termo = searchText.trim()
    if (!termo) {
      setBusca(null)
      setBuscando(false)
      return
    }

    const controlador = new AbortController()
    const temporizador = window.setTimeout(async () => {
      setBuscando(true)
      try {
        const resposta = await api.ranking(termo, controlador.signal)
        if (!controlador.signal.aborted) setBusca(resposta.resultados)
      } catch (falha) {
        // Busca cancelada ou rede instável: mantém a lista anterior.
      } finally {
        if (!controlador.signal.aborted) setBuscando(false)
      }
    }, 280)

    return () => {
      window.clearTimeout(temporizador)
      controlador.abort()
    }
  }, [searchText])

  function clearPlayerSearch() {
    setSearchText('')
  }

  const resultados = busca ?? rankingInicial
  const medalhas = ['gold', 'silver', 'bronze'] as const

  return (
    <aside className="panel p-4">
      <SectionHeading icon={Trophy}>Ranking</SectionHeading>

      <div className="search-box mb-4">
        <Search size={16} className="shrink-0 text-slate-500" />
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Pesquisar jogador"
          aria-label="Pesquisar jogador"
        />
        {searchText && (
          <button onClick={clearPlayerSearch} aria-label="Limpar busca" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {buscando && resultados.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-slate-500">Buscando...</p>
        )}

        {!buscando && resultados.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-slate-500">
            {searchText.trim() ? 'Nenhum jogador encontrado.' : 'Ranking ainda sem jogadores.'}
          </p>
        )}

        {resultados.map((jogador) => (
          <div
            className={`rank-row ${jogador.rank <= 3 ? `top-rank ${medalhas[jogador.rank - 1] ?? ''}` : ''}`}
            key={jogador.id}
          >
            <span className="rank-number">{jogador.rank}</span>
            <div className="avatar">{jogador.iniciais}</div>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-200">
              {jogador.nickname}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-slate-400">
              {jogador.score.toLocaleString('pt-BR')} <em>pts</em>
            </span>
          </div>
        ))}
      </div>

      <div className="my-rank mt-4">
        <span className="text-[12px] font-extrabold text-violet-300">{jogadorAtual.rank || '—'}</span>
        <div className="avatar me">{jogadorAtual.iniciais}</div>
        <span className="flex-1 text-[12px] font-semibold text-white">{jogadorAtual.nickname}</span>
        <span className="text-[11px] font-bold tabular-nums text-cyan">
          {jogadorAtual.score.toLocaleString('pt-BR')} <em>pts</em>
        </span>
      </div>
    </aside>
  )
}

// -----------------------------------------------------------------------------
// Área principal: pergunta e envio da resposta
// -----------------------------------------------------------------------------

type QuestionCardProps = {
  questao: CurrentQuestion
  jogador: CurrentUser
  onResposta: (resultado: SubmitAnswerResult) => Promise<void>
}

function QuestionCard({ questao, jogador, onResposta }: QuestionCardProps) {
  const [respostaTexto, setRespostaTexto] = useState('')
  const [status, setStatus] = useState<AnswerSubmissionStatus>('idle')
  const [resultado, setResultado] = useState<SubmitAnswerResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Cronômetro da questão: o tempo é gravado, mas ainda não pontua (item
  // "tempo_de_resposta" marcado como TODO no fluxograma).
  const inicioRef = useRef(Date.now())

  useEffect(() => {
    inicioRef.current = Date.now()
    setRespostaTexto('')
    setStatus('idle')
    setResultado(null)
    setErro(null)
  }, [questao.id])

  // Espelha a validação do backend: basta uma letra ou um número, para o "7"
  // da questão de número primo passar. Texto só com pontuação fica inerte em vez
  // de habilitar o botão e tomar um 422.
  const podeEnviar = /[\p{L}\p{N}]/u.test(respostaTexto) && status === 'idle'

  async function enviar() {
    if (!podeEnviar) return

    setStatus('sending')
    setErro(null)

    const tempo = Math.round((Date.now() - inicioRef.current) / 1000)

    try {
      const retorno = await api.responder(questao.id, respostaTexto.trim(), tempo)
      setResultado(retorno)
      setStatus('checked')
      await onResposta(retorno)
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível enviar a resposta. Tente novamente.',
      )
      setStatus('idle')
    }
  }

  function handleRespostaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void enviar()
  }

  /**
   * Enter envia, Shift+Enter quebra linha. A resposta é curta e o envio é o
   * caminho principal, mas a quebra de linha continua acessível — e continua
   * inofensiva, porque o *word match* normaliza quebra em espaço.
   */
  function handleTeclaResposta(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    // Digitação por composição (IME): o Enter está confirmando o caractere.
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    void enviar()
  }

  return (
    <section className="question-shell">
      <div className="question-topline">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[12px] font-semibold text-slate-300">Sua vez</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] font-medium text-slate-500">
          <Clock3 size={14} />
          Tempo livre
          <span className="text-slate-300">•</span>
          {questao.progressPercent}%
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-value" style={{ width: `${questao.progressPercent}%` }} />
      </div>

      <div className="question-body">
        <div className="question-tag">
          <Gamepad2 size={15} /> {questao.categoria || questao.disciplinaNome}
        </div>
        <p className="mt-6 text-center text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Pergunta {questao.questionNumber} de {questao.totalQuestions}
        </p>
        <TituloQuestao enunciado={questao.prompt} destaque={questao.destaque} />
        <p className="question-helper">
          <CircleHelp size={15} />
          Escreva uma resposta curta. Várias respostas valem ponto, e a mais rara rende mais.
        </p>

        <form onSubmit={handleRespostaSubmit} className="mt-8">
          <label htmlFor="answer" className="sr-only">Sua resposta</label>
          <div
            className={`answer-wrap ${
              resultado?.casou ? 'success' : status === 'checked' ? 'error' : ''
            }`}
          >
            <textarea
              id="answer"
              value={respostaTexto}
              onChange={(event) => setRespostaTexto(event.target.value)}
              onKeyDown={handleTeclaResposta}
              disabled={status !== 'idle'}
              maxLength={120}
              placeholder="Escreva sua resposta aqui..."
              rows={3}
            />
            <span className="answer-count">{respostaTexto.length}/120</span>
          </div>

          {erro && (
            <p className="mt-3 text-[11px] text-rose-300" role="alert">
              {erro}
            </p>
          )}

          {resultado && (
            <p
              className={`mt-3 text-[12px] font-semibold ${
                resultado.casou ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {resultado.casou ? (
                <>
                  <Check size={13} className="mr-1 inline" />
                  Resposta aceita! Vale {resultado.pontos} pontos provisórios — o peso real
                  sai da raridade, fechado às 00h.
                </>
              ) : (
                <>
                  <CircleX size={13} className="mr-1 inline" />
                  Nenhuma resposta aceita combina com o que você escreveu.
                </>
              )}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              {status === 'checked'
                ? `Pontuação de hoje: ${jogador.pontosDoDia} pts (o peso final é fechado às 00h).`
                : 'Uma resposta por pergunta.'}
            </p>

            <div className="flex shrink-0 items-center gap-3">
              {status === 'idle' && (
                <span className="hidden text-[11px] text-slate-500 sm:inline">
                  <kbd className="kbd-hint">Enter</kbd> envia
                </span>
              )}
              <button
                type="submit"
                disabled={!podeEnviar}
                className="primary-button shrink-0"
              >
                {status === 'sending' ? (
                  <><span className="spinner" /> Checando...</>
                ) : (
                  <>Enviar resposta <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="question-footer">
        <ShieldCheck size={15} />
        Suas respostas ficam privadas até o resultado da rodada.
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Fim da rodada
// -----------------------------------------------------------------------------

function RodadaEncerrada({ jogador, total }: { jogador: CurrentUser; total: number }) {
  return (
    <section className="question-shell">
      <div className="question-topline">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="text-[12px] font-semibold text-slate-300">Rodada concluída</span>
        </div>
      </div>

      <div className="question-body">
        <div className="topic-icon"><Trophy size={23} /></div>
        <h1 className="question-title mt-5">Você respondeu as {total} questões de hoje</h1>
        <p className="question-helper mt-3">
          <Sparkles size={15} />
          O peso de cada resposta é recalculado à meia-noite conforme a raridade das respostas dos
          demais jogadores. Volte amanhã para o novo sorteio.
        </p>

        <div className="my-rank mt-7 w-full max-w-[340px]">
          <span className="text-[12px] font-extrabold text-violet-300">{jogador.rank || '—'}</span>
          <div className="avatar me">{jogador.iniciais}</div>
          <span className="flex-1 text-[12px] font-semibold text-white">{jogador.nickname}</span>
          <span className="text-[11px] font-bold tabular-nums text-cyan">
            {jogador.score.toLocaleString('pt-BR')} <em>pts</em>
          </span>
        </div>
      </div>

      <div className="question-footer">
        <ShieldCheck size={15} />
        As questões de amanhã são sorteadas automaticamente pelo script diário.
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Shell da página
// -----------------------------------------------------------------------------

export default function App() {
  const { jogador, carregando: carregandoSessao, sair, atualizarJogador } = useAuth()
  const { rodada, carregando, erro, carregar, setRodada } = useRodada(jogador?.id ?? null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  function toggleMobileMenu() {
    setIsMobileMenuOpen((isOpen) => !isOpen)
  }

  /** Recarrega a rodada depois de uma resposta. */
  const aoResponder = useCallback(async () => {
    setRodada(await api.rodada())
  }, [setRodada])

  const ranking = useMemo(() => rodada?.ranking ?? [], [rodada])

  // A rodada é a fonte da verdade do placar: o login devolve a posição gravada
  // no último fechamento do dia, que ainda é 0 para quem entrou depois.
  useEffect(() => {
    if (rodada) atualizarJogador(rodada.jogador)
  }, [rodada, atualizarJogador])

  if (carregandoSessao) {
    return (
      <div className="login-shell">
        <div className="login-backdrop" aria-hidden="true" />
        <span className="spinner" role="status" aria-label="Carregando" />
      </div>
    )
  }

  if (!jogador) return <LoginPage />

  return (
    <div className="app-shell">
      <header className="app-header">
        <QuizArenaBrand />

        <button
          className="mobile-menu-button"
          onClick={toggleMobileMenu}
          aria-label="Abrir menu"
          type="button"
        >
          {isMobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>

        <div className={`header-actions ${isMobileMenuOpen ? 'open' : ''}`}>
          <div className="header-user">
            <div className="header-avatar"><UserRound size={17} /></div>
            <div>
              <span>Jogando como</span>
              <strong>@{jogador.nickname}</strong>
            </div>
          </div>

          {rodada?.tema && (
            <div className="header-topic">
              <div className="header-topic-icon"><Sparkles size={16} /></div>
              <div>
                <span>Tema da dia</span>
                <strong>{rodada.tema.titulo}</strong>
              </div>
            </div>
          )}

          <button className="header-logout" type="button" onClick={sair}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      </header>

      <main className="dashboard-grid">
        <LeftSidebar
          tema={rodada?.tema ?? null}
          historico={rodada?.historico ?? []}
          respondidas={rodada?.respondidas ?? 0}
          total={rodada?.total ?? 0}
        />

        {carregando && (
          <section className="question-shell">
            <div className="question-body">
              <span className="spinner" role="status" aria-label="Carregando questões" />
            </div>
          </section>
        )}

        {!carregando && erro && (
          <section className="question-shell">
            <div className="question-body">
              <p className="question-helper">{erro}</p>
              <button className="primary-button mt-6" type="button" onClick={() => void carregar()}>
                <RefreshCw size={14} /> Tentar de novo
              </button>
            </div>
          </section>
        )}

        {!carregando && !erro && rodada?.questaoAtual && (
          <QuestionCard
            questao={rodada.questaoAtual}
            jogador={jogador}
            onResposta={aoResponder}
          />
        )}

        {!carregando && !erro && rodada && !rodada.questaoAtual && (
          <RodadaEncerrada jogador={jogador} total={rodada.total} />
        )}

        <RankingSidebar rankingInicial={ranking} jogadorAtual={jogador} />
      </main>

      <footer className="app-footer">
        <span>Quiz Arena</span>
        <span>Feito para quem gosta de saber um pouco mais (A turminha de DS da Etec Darcy 😉).</span>
        <span className="flex items-center gap-1"><Award size={13} /> Rodada diária</span>
      </footer>
    </div>
  )
}