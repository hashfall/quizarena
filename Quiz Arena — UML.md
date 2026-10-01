---
title: Quiz Arena — Diagramas UML
tags: [quiz-arena, uml, plantuml, arquitetura, dominio, fluxograma]
status: vivo
criado: 2026-09-30
atualizado: 2026-09-30
---

# Quiz Arena — Diagramas UML

Suíte completa de diagramas UML do Quiz Arena, escrita em **PlantUML** (blocos
```` ```plantuml ````, renderizados pelo plugin do Obsidian).

> [!important] Origem e precedência
> Os diagramas foram transcritos de duas fontes, nesta ordem:
>
> 1. **`fluxograma.png`** — a fonte da verdade do produto (as caixas do Script Diário,
>    a ordem peso → ranking → sorteio, o bloco vermelho "TODO: ignorar por enquanto").
> 2. **O código** (`server/`, `src/`) — nomes reais de função, campos reais do Firestore.
>
> Se um diagrama contradizer o código, o diagrama está errado. Se contradizer o
> fluxograma, o código está errado — e isso precisa ser dito em voz alta, não
> resolvido em silêncio. Detalhes: `AGENTS.md` e `Quiz Arena — Documentação.md`.

## Índice

| # | Diagrama | Tipo | O que fixa |
| --- | --- | --- | --- |
| 1 | [Casos de uso](#1-casos-de-uso) | `usecase` | Fronteira do sistema e as caixas do fluxograma |
| 2 | [Modelo de domínio](#2-modelo-de-domínio--documentos-do-firestore) | `class` | Documentos do Firestore e suas invariantes |
| 3 | [Componentes do backend](#3-componentes-do-backend) | `class` | As camadas `routes → services → repositories → Firestore` |
| 4 | [Modelo do frontend](#4-modelo-do-frontend) | `class` | Componentes React e o contrato espelhado da API |
| 5 | [Sessão: entrar ou criar](#5-sessão-entrar-ou-criar) | `sequence` | `POST /api/auth/entrar` |
| 6 | [Rodada do dia](#6-rodada-do-dia) | `sequence` | `GET /api/quiz/rodada` |
| 7 | [Resposta a uma questão](#7-resposta-a-uma-questão) | `sequence` | `POST /api/quiz/respostas` e as duas fases de pontuação |
| 8 | [Motor de word match](#8-motor-de-word-match) | `activity` | `casarPorWord` + `melhorAlternativa` |
| 9 | [Script Diário](#9-script-diário--às-00h00) | `sequence` | Ordem obrigatória peso → ranking → sorteio |
| 10 | [Peso dinâmico](#10-peso-dinâmico-por-raridade) | `activity` | Fórmula de `calcularPeso` |
| 11 | [Ciclo de vida da rodada](#11-ciclo-de-vida-da-rodada) | `state` | Estados da tela e do dia no Firestore |
| 12 | [Componentes do sistema](#12-componentes-do-sistema) | `component` | As três zonas do fluxograma |
| 13 | [Implantação](#13-implantação) | `deployment` | Dev, produção e o cron |

## Legenda de notação

- `«interface»` contrato; `«middleware»` função que intercepta requisição;
  `«repository»` único lugar que toca o Firestore; `«service»` regra de negócio.
- `<<repository>>` marca o único lugar que toca o Firestore; `<<service>>`, regra de
  negócio; `<<router>>` e `<<middleware>>`, a camada HTTP.
- `<<include>>` sempre executado; `<<extend>>` condicional.
- Rótulo `⚠️` marca armadilha conhecida do repositório (ver `AGENTS.md`).

---

## 1. Casos de uso

O quadrante "Frontend Vite" e o quadrante "Backend Vite" do fluxograma, com os
atores reais: o jogador, o agendador das 00h00 e quem opera o servidor.

```plantuml
@startuml
title Quiz Arena — Casos de uso
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

actor "Jogador\n(nickname + senha)" as Jogador
actor "Script Diário\n(cron 00h00)" as Cron
actor "Operador\n(CLI / HTTP)" as Operador

rectangle "Frontend Vite" {
  usecase "UC1 Entrada de Nickname e Senha" as UC1
  usecase "UC2 Exibir uma questão por vez" as UC2
  usecase "UC3 Ranking global na lateral" as UC3
  usecase "UC4 Pesquisar nickname" as UC4
}

rectangle "Backend Vite — API endpoint" {
  usecase "UC5 Buscar questões do dia\n(7 questões)" as UC5
  usecase "UC6 Salvar respostas" as UC6
  usecase "UC7 Revalidar sessão" as UC7
}

rectangle "Backend Vite — Script Diário" {
  usecase "UC8 Cálculo de Peso\ndas alternativas" as UC8
  usecase "UC9 Ranking dos players\ncom base no peso" as UC9
  usecase "UC10 Sortear 7 questões\nsem repetir disciplina" as UC10
  usecase "UC11 Rodar o Script Diário" as UC11
}

rectangle "Operação" {
  usecase "UC12 Gravar conteúdo (seed)" as UC12
  usecase "UC13 Validar conteúdo" as UC13
  usecase "UC14 Reiniciar o dia" as UC14
  usecase "UC15 Diagnóstico do servidor" as UC15
}

Jogador -- UC1
Jogador -- UC2
Jogador -- UC3
Jogador -- UC4
Jogador --> UC6 : escreve por extenso

UC1 ..> UC5 : <<include>> só se houver sessão
UC2 ..> UC5 : <<include>>
UC2 ..> UC6 : <<include>>
UC5 ..> UC7 : <<extend>> quando existe token
UC3 ..> UC5 : <<include>> ranking vem na rodada
UC4 ..> UC9 : <<include>> versão filtrada

Cron --> UC11
Operador --> UC11 : simula a virada
Operador --> UC12
Operador --> UC13
UC12 ..> UC13 : <<include>> recusa gravar se falhar
Operador --> UC14
Operador --> UC15

UC11 ..> UC8 : <<include>> 1
UC8 ..> UC9 : <<include>> 2\nranking depende do peso
UC9 ..> UC10 : <<include>> 3

UC5 ..> UC10 : <<extend>> sorteia sob demanda
UC14 ..> UC10 : <<include>>

note bottom of UC8
  Alternativas guardam SOMENTE
  formas corretas. A raridade é
  a frequência da forma escrita.
end note

note bottom of UC6
  Grava tempoDeResposta, mas
  NÃO pontua por tempo:
  bloco "TODO: ignorar por enquanto".
end note

@enduml
```

> [!warning] A ordem de `UC11` não é preferência
> O fluxograma liga Script Diário → Peso → Ranking → Sorteio com **setas de
> dependência**, não de lista de tarefas. `UC9` lê os pontos que `UC8` acabou de
> reescrever; reordenar quebra o cálculo.

---

## 2. Modelo de domínio — documentos do Firestore

Uma classe por documento. Os nomes das propriedades são exatamente os campos gravados
pelo backend, e a composição reproduz o caminho real das subcoleções.

```plantuml
@startuml
!pragma layout elk
title Quiz Arena — Modelo de domínio (documentos do Firestore)
skinparam classAttributeIconSize 0
skinparam shadowing false

package "disciplinas/ (conteúdo, gravado pelo seed)" {
  class Disciplina {
    +id: string <<chave=slug>>
    +nome: string
    +descricao: string
    +ativa: boolean
    +criadaEm: Date?
    +atualizadaEm: Date?
  }

  class Questao {
    +id: string <<chave=slug>>
    +disciplinaNome: string
    +enunciado: string
    +destaque: string
    +categoria: string
    +selecionada: boolean
    +ativa: boolean
    +criadaEm: Date?
    +atualizadaEm: Date?
  }

  class Alternativa <<forma aceita>> {
    +id: string <<chave=chaveDeAlternativa>>
    +texto: string
    +ordem: number
  }

  class Pontuacao <<peso do dia>> {
    +peso: number
    +escolhas: number
    +totalRespostas: number
    +geradoEm: Date?
  }

  Disciplina "1" *-- "0..*" Questao : questoes/{questaoId}
  Questao "1" *-- "1..*" Alternativa : alternativas/{slug}
  Alternativa "1" *-- "0..*" Pontuacao : pontuacao/{yyyy-mm-dd}
}

package "players/" {
  class Player {
    +id: string <<chave=chaveDeNickname>>
    +nickname: string
    +nicknameLower: string
    +iniciais: string
    +senhaHash: string <<bcrypt>>
    +pontuacaoTotal: number <<acumulado>>
    +pontuacaoDoDia: number <<provisório>>
    +ranking: number <<só no fechamento>>
    +respostasHoje: number
    +criadoEm: Date?
    +ultimoAcessoEm: Date?
  }

  class ItemResposta <<respostas/{dia}/itens/{questaoId}>> {
    +questaoId: string
    +disciplinaId: string
    +resposta: string <<o que foi digitado>>
    +respostaNormalizada: string
    +alternativaId: string?
    +alternativaTexto: string? <<NUNCA sai da API>>
    +casou: boolean
    +pontos: number <<recalculado à noite>>
    +tempoDeResposta: number <<não pontua>>
    +respondidaEm: Date?
    +pontosRecalculadosEm: Date?
  }

  Player "1" *-- "0..7" ItemResposta : respostas/{yyyy-mm-dd}/itens
  Questao "1" <-- "0..*" ItemResposta : "casou com" 
}

package "quiz_do_dia/ e temas/" {
  class QuizDoDia <<quiz_do_dia/{yyyy-mm-dd}>> {
    +data: string
    +total: number
    +geradoEm: Date?
  }

  class QuestaoDoDia <<array embutido>> {
    +ordem: number
    +questaoId: string
    +disciplinaId: string
    +disciplinaNome: string
    +categoria: string
    +enunciado: string
  }

  class Tema <<temas/{slug}>> {
    +titulo: string
    +descricao: string
    +data: string
    +tom: ThemeTones
  }

  QuizDoDia "1" *-- "0..7" QuestaoDoDia : questoes[]
  QuestaoDoDia ..> Questao : "copia o enunciado\n(não é referência viva)"
}

package "suporte" {
  enum ThemeTones {
    cyan
    coral
    amber
    green
    blue
  }
}

note top of Alternativa
  **Não existe distrator.**
  Toda alternativa é uma forma
  que o sistema dá como certa.
  Consequência: casou = true
  quer dizer "escrevi uma das
  formas aceitas", não "acertei
  a resposta única".
end note

note right of Pontuacao
  peso = PESO_MINIMO
       + (PESO_BASE - PESO_MINIMO)
         * (1 - escolhas/total)
  piso 10, teto 100.
end note

note bottom of Player
  Apagar players/{id} NÃO apaga
  as subcoleções: as respostas
  ficam órfãs e reaparecem
  quando o mesmo nickname volta,
  gerando 409 "que não aconteceu".
end note

note bottom of ItemResposta
  Uma resposta por questão por dia.
  id_questao e tempo_de_resposta
  existem no documento, mas estão
  fora do escopo (TODO do fluxograma):
  o tempo é gravado e não pontua.
end note

@enduml
```

### Invariantes do modelo

| # | Invariante | Onde aparece no diagrama |
| --- | --- | --- |
| 1 | `alternativas` guarda **só** formas corretas | Nota em `Alternativa` |
| 2 | O match exige `precisao === 1`; apelido/abreviação/sobrenome são alternativas próprias | `casarPorWord` (diagrama 8) |
| 3 | Pontuação em **duas fases**: `pesoProvisional` no envio, peso real no fechamento | `ItemResposta.pontos` (diagrama 7 e 10) |
| 4 | Ordem do Script Diário é dependência: peso → ranking → sorteio | Diagrama 9 |
| 5 | **Uma** resposta por questão por dia (`409`) | Diagrama 7 |
| 6 | Apagar `players/{id}` deixa respostas órfãs | Nota em `Player` |
| 7 | Questão sem alternativa é **injogável** e sai do sorteio | `Alternativa` 1..* |
| 8 | `chaveDeAlternativa` deriva o id do texto normalizado; colisão é erro de seed | Nota em `Alternativa.id` |
| 9 | `sortearQuizDoDia` é idempotente | `QuizDoDia` (diagrama 9) |

---

## 3. Componentes do backend

As camadas fixas, uma direção só. `→` é dependência de módulo; ninguém pula etapa.

```plantuml
@startuml
!pragma layout elk
title Quiz Arena — Componentes do backend (server/)
skinparam classAttributeIconSize 0
skinparam shadowing false

package "server/ (Vite middleware em dev, Express em produção)" {
  class Bootstrap <<bootstrap>> {
    +createApiApp(): Express
    +iniciar(): Promise<void>
    +iniciarCronDoScriptDiario(): ScheduledTask?
  }
}

package "server/routes/ (só valida e responde)" {
  class AuthRoutes <<router>> {
    +POST /api/auth/entrar
    +GET /api/auth/eu
  }
  class QuizRoutes <<router>> {
    +GET /api/quiz/rodada
    +POST /api/quiz/respostas
    +GET /api/quiz/ranking
  }
  class AdminRoutes <<router>> {
    +POST /api/admin/script-diario
    +GET /api/admin/saude
  }
  class SessaoMiddleware <<middleware>> {
    +carregarSessao(req, res, next)
    +exigirSessao(req): SessaoPlayer
    +gerarTokenSessao(sessao): string
    +verificarTokenSessao(token): SessaoPlayer
  }
  class HttpLib <<middleware>> {
    +rota(handler): RequestHandler
    +corpo(req, schema): T
    +tratadorDeErros(erro, req, res, next)
  }
  class ErroHttp <<exception>> {
    +status: number
    +detalhes?: unknown
  }
}

package "server/services/ (regra de negócio)" {
  class AuthService <<service>> {
    +entrarOuCriar(entrada): SaidaLogin
    +sessaoAtual(playerId): Jogador?
    +validarCredenciais(nickname, senha): void
  }
  class QuizService <<service>> {
    +montarEstadoDaRodada(playerId, data): EstadoDaRodada
    +pesquisarJogadores(termo, playerId): Resultado
  }
  class RespostasService <<service>> {
    +registrarResposta(entrada, data): Saida
    +melhorAlternativa(resposta, alternativas): ResultadoMatch
  }
  class PesoService <<service>> {
    +calcularPeso(escolhas, total): number
    +calcularPesosDasAlternativas(data): ResultadoPesos
    +pesoProvisional(alternativa): number
  }
  class RankingService <<service>> {
    +ordenarRanking(entradas): EntradaOrdenada[]
    +somarPontosDoDia(data, playerIds): Map
    +fecharRankingDoDia(data): RelatorioRanking
  }
  class SorteioService <<service>> {
    +sortearQuizDoDia(data): ResultadoSorteio
    +garantirQuizDeHoje(): QuizDoDia
  }
  class ScriptDiarioService <<service>> {
    +rodarScriptDiario(hoje): RelatorioScriptDiario
  }
}

package "server/repositories/ (ÚNICO lugar que toca o Firestore)" {
  class DisciplinasRepo <<repository>> {
    +listarDisciplinas(apenasAtivas): Disciplina[]
    +listarQuestoesDaDisciplina(id): Questao[]
    +listarAlternativas(questaoId, disciplinaId): Alternativa[]
    +listarAlternativasDeQuestoes(refs): Map
    +gravarPesos(pesos, data): void
    +desmarcarQuestaoSelecionadas(ids): number
    +marcarQuestaoSelecionada(d, q, flag): void
    +sortear(itens): T
    +embaralhar(itens): T[]
  }
  class PlayersRepo <<repository>> {
    +obterPlayerPorNickname(nick): Player?
    +criarPlayer(nick, hash): Player
    +listarPlayers(): Player[]
    +listarRanking(limite): PlayerPublico[]
    +buscarPorNickname(termo): PlayerPublico[]
    +somarPontuacaoDoDia(id, pontos): void
    +atualizarPontuacoes(lista): void
    +gerarHashSenha(senha): string
    +conferirSenha(senha, hash): boolean
  }
  class QuizRepo <<repository>> {
    +obterQuizDoDia(data): QuizDoDia?
    +garantirQuizDoDia(data, questoes): QuizDoDia
    +listarTemas(limite): Tema[]
  }
  class RespostasRepo <<repository>> {
    +gravarResposta(playerId, data, item): ItemResposta
    +obterResposta(playerId, data, questaoId): ItemResposta?
    +listarRespostasDoDia(playerId, data): ItemResposta[]
    +listarRespostasDoDiaDeTodos(data, playerIds): Resposta[]
    +aplicarPontosRecalculados(lista, data): void
    +resetarContadorDiario(playerIds): void
  }
}

package "server/lib/ e infraestrutura" {
  class TextoLib <<lib>> {
    +normalizar(texto): string
    +tokenizar(texto): string[]
    +palavrasSignificativas(texto): string[]
    +casarPorWord(resposta, alternativa): ResultadoMatch
    +higienizarResposta(texto): string
    +chaveDeNickname(nick): string
    +chaveDeAlternativa(texto): string
    +iniciaisDoNickname(nick): string
  }
  class DatasLib <<lib>> {
    +hojeISO(): string
    +deslocarDia(dataISO, dias): string
    +rotuloData(dataISO): string
  }
  class FirebaseAdmin <<singleton>> {
    +obterApp(): App
    +obterFirestore(): Firestore
  }
  class Config <<config>> {
    +porta: number
    +segredoSessao: string
    +segredoCron: string?
    +cronHabilitado: boolean
    +fusoHorario: string
    +totalQuestoesDia: number
    +pesoBaseAlternativa: number
    +pesoMinimo: number
  }
  class CronJob <<scheduler>> {
    +iniciarCronDoScriptDiario()
  }
  class Firestore <<database>> {
    +disciplinas/
    +players/
    +quiz_do_dia/
    +temas/
  }
}

Bootstrap ..> AuthRoutes
Bootstrap ..> QuizRoutes
Bootstrap ..> AdminRoutes
Bootstrap ..> SessaoMiddleware
Bootstrap ..> HttpLib
Bootstrap ..> Config
Bootstrap ..> CronJob
Bootstrap ..> SorteioService : "garantirQuizDeHoje() no boot"

HttpLib ..> ErroHttp
SessaoMiddleware ..> ErroHttp
SessaoMiddleware ..> Config
SessaoMiddleware ..> TextoLib : indirectly

AuthRoutes ..> AuthService
AuthRoutes ..> SessaoMiddleware
AuthRoutes ..> HttpLib
QuizRoutes ..> QuizService
QuizRoutes ..> RespostasService
QuizRoutes ..> SessaoMiddleware
QuizRoutes ..> DatasLib : hojeISO()
AdminRoutes ..> ScriptDiarioService
AdminRoutes ..> Config : segredoCron
AdminRoutes ..> DatasLib

AuthService ..> PlayersRepo
AuthService ..> TextoLib
AuthService ..> SessaoMiddleware
QuizService ..> PlayersRepo
QuizService ..> QuizRepo
QuizService ..> RespostasRepo
QuizService ..> SorteioService
QuizService ..> DatasLib
RespostasService ..> RespostasRepo
RespostasService ..> DisciplinasRepo
RespostasService ..> QuizRepo
RespostasService ..> PlayersRepo
RespostasService ..> TextoLib
RespostasService ..> PesoService
RespostasService ..> HttpLib
PesoService ..> DisciplinasRepo
PesoService ..> PlayersRepo
PesoService ..> RespostasRepo
PesoService ..> Config
RankingService ..> PlayersRepo
RankingService ..> RespostasRepo
SorteioService ..> DisciplinasRepo
SorteioService ..> QuizRepo
SorteioService ..> Config
SorteioService ..> DatasLib
ScriptDiarioService ..> PesoService
ScriptDiarioService ..> RankingService
ScriptDiarioService ..> SorteioService
ScriptDiarioService ..> DatasLib
CronJob ..> ScriptDiarioService

DisciplinasRepo ..> FirebaseAdmin
PlayersRepo ..> FirebaseAdmin
QuizRepo ..> FirebaseAdmin
RespostasRepo ..> FirebaseAdmin
FirebaseAdmin ..> Firestore : obtainFirestore() <<único acesso>>
Config ..> FirebaseAdmin : resolverCredenciais()

note right of ScriptDiarioService
  A seta ScriptDiarioService →
  PesoService → RankingService →
  SorteioService é a ordem do
  fluxograma e não pode ser
  reordenada.
end note

note bottom of RespostasRepo
  ⚠️ Nenhum índice composto por
  design. listarRespostasDoDiaDeTodos
  recebe playerIds e varre um a
  um em vez de usar collection
  group.
end note

@enduml
```

---

## 4. Modelo do frontend

`src/types/quiz.ts` espelha 1:1 o payload da API — mudar um lado exige mudar o outro.
No diagrama, os tipos do cliente aparecem como as mesmas classes do modelo de domínio
com o prefixo de tela (`Current*`).

```plantuml
@startuml
!pragma layout elk
title Quiz Arena — Modelo do frontend (src/)
skinparam classAttributeIconSize 0
skinparam shadowing false

package "src/lib/ (único cliente HTTP)" {
  class Api <<client>> {
    +entrar(nickname, senha): LoginResult
    +eu(): { jogador }
    +rodada(): QuizArenaData
    +responder(questaoId, resposta, tempo): SubmitAnswerResult
    +ranking(termo?, sinal?): RankingSearchResult
    +lerToken(): string?
    +gravarToken(token): void
    +limparToken(): void
  }
  class ErroApi <<exception>> {
    +status: number
    +detalhes: Detalhe[]?
  }
  class LocalStorage <<storage>> {
    +quiz-arena:token
  }
  class EventoSessao <<evento>> {
    +quiz-arena:sessao-expirada
  }
}

package "src/contexts/" {
  class AuthContext <<context>> {
    +jogador: CurrentUser?
    +carregando: boolean
    +entrouRecem: boolean
    +entrar(nickname, senha): Promise
    +sair(): void
    +atualizarJogador(j): void
  }
}

package "src/pages/ e src/App.tsx" {
  class App <<component>> {
    +tema: ThemeHistoryItem?
    +rodada: QuizArenaData?
    +aoResponder(): Promise
  }
  class LoginPage <<component>> {
    +nickname: string
    +senha: string
    +estado: idle | sending
  }
  class LeftSidebar <<component>> {
    +tema: ThemeHistoryItem?
    +historico: ThemeHistoryItem[]
  }
  class QuestionCard <<component>> {
    +respostaTexto: string
    +status: idle | sending | checked
    +resultado: SubmitAnswerResult?
    +tempoEmSegundos: number
  }
  class RodadaEncerrada <<component>> {
    +jogador: CurrentUser
    +total: number
  }
  class RankingSidebar <<component>> {
    +searchText: string
    +busca: RankingPlayer[]?
    +debounceMs: 280
  }
}

package "src/types/ (espelha o payload da API)" {
  class QuizArenaData <<contrato>> {
    +data: string
    +questoes: CurrentQuestion[]
    +questaoAtual: CurrentQuestion?
    +respondidas: number
    +total: number
    +encerrada: boolean
    +jogador: CurrentUser
    +ranking: RankingPlayer[]
    +tema: ThemeHistoryItem?
    +historico: ThemeHistoryItem[]
  }
  class CurrentQuestion <<contrato>> {
    +id: string
    +disciplinaNome: string
    +categoria: string
    +prompt: string
    +questionNumber: number
    +totalQuestions: number
    +progressPercent: number
    +respondida: boolean
    +casou: boolean?
  }
  class CurrentUser <<contrato>> {
    +id: string
    +nickname: string
    +iniciais: string
    +score: number
    +rank: number
    +pontosDoDia: number
    +respondidas: number
  }
  class SubmitAnswerResult <<contrato>> {
    +registrada: boolean
    +casou: boolean
    +pontos: number
    +jaRespondida: boolean
  }
  class RankingPlayer <<contrato>> {
    +id: string
    +nickname: string
    +iniciais: string
    +score: number
    +rank: number
  }
}

App ..> AuthContext : useAuth()
App ..> QuizArenaData : useRodada()
App *-- LeftSidebar
App *-- QuestionCard
App *-- RodadaEncerrada
App *-- RankingSidebar
App ..> Api
LoginPage ..> AuthContext
LoginPage ..> ErroApi
QuestionCard ..> Api
QuestionCard ..> SubmitAnswerResult
RankingSidebar ..> Api
RankingSidebar ..> RankingPlayer

Api ..> LocalStorage : token
Api ..> EventoSessao : dispara em 401
Api ..> ErroApi : lança
Api ..> QuizArenaData : GET /api/quiz/rodada
Api ..> SubmitAnswerResult : POST /api/quiz/respostas
Api ..> RankingPlayer : GET /api/quiz/ranking
AuthContext ..> Api
AuthContext ..> EventoSessao : escuta
AuthContext ..> CurrentUser

QuizArenaData *-- CurrentQuestion
QuizArenaData *-- CurrentUser
QuizArenaData *-- RankingPlayer

note right of Api
  ⚠️ A API só devolve
  casou: boolean e
  pontos: number.
  alternativaTexto NUNCA
  atravessa a rede.
end note

note bottom of RankingSidebar
  Sem termo de busca o painel
  usa o ranking que já veio
  na rodada; só a pesquisa
  vai ao servidor, com 280ms
  de atraso e AbortController.
end note

@enduml
```

---

## 5. Sessão: entrar ou criar

`POST /api/auth/entrar` — a mesma tela serve cadastro e login, porque a regra do
fluxograma é: nickname novo é criado com a senha informada; nickname existente exige a
senha correta.

```plantuml
@startuml
title Sequência — Sessão: entrar ou criar jogador
autonumber
skinparam shadowing false
skinparam responseMessageBelowArrow true

actor "Jogador" as J
participant "LoginPage" as LP
participant "AuthContext" as AC
participant "api" as API
participant "Express\nrotasAuth" as R
participant "SessaoMiddleware" as SM
participant "auth.service\nentrarOuCriar" as AS
participant "texto.ts\nchaveDeNickname" as TX
participant "players.repo" as PR
database "Firestore\nplayers/" as FS
participant "jwt" as JWT

J -> LP : nickname e senha
LP -> LP : habilita o botão\n(nick >= 2, senha >= 4)
LP -> AC : entrar(nick, senha)
AC -> API : POST /auth/entrar\n{ nickname, senha }
API -> R : fetch /api/auth/entrar\nanonima = true

R -> R : zod\nnickname 1..40, senha 1..72
alt token ausente ou inválido
  R -> SM : carregarSessao já rodou
  SM -> SM : token inválido = "sem sessão"
end

R -> AS : entrarOuCriar({ nickname, senha })
AS -> AS : validarCredenciais\n2..20 chars, senha >= 4
AS -> TX : chaveDeNickname(nickname)
TX --> AS : "lula_da_silva"
AS -> PR : obterPlayerPorNickname(nickname)
PR -> FS : players/{chaveDeNickname}
FS --> PR : Player | null
PR --> AS : Player?

alt nickname já existe
  AS -> PR : conferirSenha(senha, senhaHash)
  PR -> PR : bcrypt.compare
  PR --> AS : true | false
  alt senha incorreta
    AS --> R : erroNaoAutenticado(401)
    R --> API : 401 { erro }
    API --> AC : lança ErroApi
    AC --> LP : erro na tela, campo senha limpo
  else senha confere
    AS -> PR : registrarAcesso(playerId)
    PR -> FS : update ultimoAcessoEm
    AS -> JWT : gerarTokenSessao({ playerId, nickname })
    JWT --> AS : token (30d)
    AS --> R : { token, jogador, criado: false }
    R --> API : 200
  end
else nickname novo
  AS -> PR : gerarHashSenha(senha)
  PR --> AS : bcrypt hash (10 rounds)
  AS -> PR : criarPlayer(nickname, hash)
  PR -> FS : set players/{chave}\nscore 0, ranking 0
  AS -> JWT : gerarTokenSessao
  JWT --> AS : token
  AS --> R : { token, jogador, criado: true }
  R --> API : 201
end

API --> AC : LoginResult
AC -> API : gravarToken(token)
API -> FS : localStorage quiz-arena:token
AC -> AC : setJogador, setEntrouRecem
AC --> LP : estado pronto
LP --> J : abre a rodada do dia

note over AS,PR
  O id do documento é a chave
  normalizada do nickname.
  É isso que garante unicidade
  sem Firebase Auth e sem e-mail:
  "Lula" e "lula" são a mesma
  pessoa por construção.
end note

note over R
  Diferente das rotas de
  escrita, /auth/entrar não
  chama exigirSessao — é a
  porta de entrada.
end note

@enduml
```

---

## 6. Rodada do dia

`GET /api/quiz/rodada` — uma chamada só devolve tema, histórico, ranking, lista de
questões e a questão da vez. É o "buscar questões do dia (7 questões)" do fluxograma.

```plantuml
@startuml
title Sequência — GET /api/quiz/rodada
autonumber
skinparam shadowing false

actor "Jogador" as J
participant "App / useRodada" as APP
participant "api" as API
participant "Express\ncarregarSessao" as SM
participant "quiz.service\nmontarEstadoDaRodada" as QS
participant "quiz.repo" as QR
participant "sorteio.service" as SS
participant "disciplinas.repo" as DR
participant "respostas.repo" as RR
participant "players.repo" as PR
database "Firestore" as FS

APP -> API : GET /quiz/rodada\nAuthorization: Bearer
API -> SM : req
alt token válido
  SM -> SM : verifica JWT (30d)
  SM -> SM : req.sessao = { playerId, nickname }
else token ausente ou expirado
  SM -> SM : segue sem sessão
end
SM -> QS : exigirSessao(req) ou 401
QS -> QR : obterQuizDoDia(hojeISO())
QR -> FS : quiz_do_dia/{dia}
FS --> QR : QuizDoDia | null

alt ainda não há sorteio do dia
  QS -> SS : garantirQuizDeHoje()
  SS -> QR : obterQuizDoDia(hoje)
  SS -> DR : listarDisciplinas(ativa = true)
  SS -> DR : listarQuestoesDaDisciplina(id)
  SS -> DR : listarAlternativasDeQuestoes(refs)
  SS -> DR : descarta questão sem alternativa
  SS -> DR : desmarcarQuestaoSelecionadas(ids)
  SS -> DR : marcarQuestaoSelecionada(..., true)
  SS -> QR : garantirQuizDoDia(hoje, questoes)
  QR -> FS : create quiz_do_dia/{dia}
  SS --> QS : QuizDoDia
end

note right of SS
  Idempotente: se o documento
  já existe com questões,
  não sorteia de novo.
end note

QR --> QS : QuizDoDia
QS -> PR : obterPlayer(playerId)
PR --> QS : Player

par respostas do dia
  QS -> RR : listarRespostasDoDia(playerId, dia)
  RR -> FS : .../respostas/{dia}/itens
  RR --> QS : ItemResposta[]
else ranking global
  QS -> PR : listarRanking(50)
  PR -> FS : orderBy pontuacaoTotal desc, limit 50
  PR --> QS : PlayerPublico[]
else tema e histórico
  QS -> QR : listarTemas(6)
  QR -> FS : temas orderBy data desc
  QR --> QS : Tema[]
end

QS -> QS : mapeia QuestaoParaTela\n(casou, respondida, progresso)
QS -> QS : rank = players.ranking > 0\n? gravado : posição atual + 1
QS --> APP : EstadoDaRodada
APP -> APP : setRodada\natualizarJogador(rodada.jogador)
APP --> J : uma questão por vez,\nsidebar de ranking e tema

note over QS
  A API nunca envia
  alternativaTexto. O front
  só sabe casou e pontos.
end note

note over SM
  Token inválido não rejeita
  a requisição: a UI não
  quebra por token velho,
  a rota decide o que fazer.
end note

@enduml
```

---

## 7. Resposta a uma questão

`POST /api/quiz/respostas` — o núcleo do jogo. Word match no servidor, gravação da
resposta e **fase 1** da pontuação (`pesoProvisional`).

```plantuml
@startuml
title Sequência — POST /api/quiz/respostas (fase 1 do peso)
autonumber
skinparam shadowing false

actor "Jogador" as J
participant "QuestionCard" as QC
participant "api" as API
participant "quiz.routes" as R
participant "respostas.service\nregistrarResposta" as RS
participant "texto.ts" as TX
participant "quiz.repo" as QR
participant "respostas.repo" as RR
participant "disciplinas.repo" as DR
participant "peso.service\npesoProvisional" as PS
participant "players.repo" as PR
database "Firestore" as FS

J -> QC : escreve a resposta por extenso
QC -> QC : mede tempo em segundos\n(mede, não pontua)
QC -> API : POST /quiz/respostas\n{ questaoId, resposta, tempoDeResposta }
API -> R : rota(): rejeição vai ao tratadorDeErros
R -> R : zod: questaoId, resposta 1..120
R -> RS : registrarResposta({ playerId, questaoId, resposta, tempo })

RS -> TX : higienizarResposta(resposta)
TX --> RS : colapsa espaços, corta em 120
RS -> TX : normalizar(resposta)
TX --> RS : "the legend of zelda"
RS -> RS : se normalizar == "" então 422

RS -> QR : obterQuizDoDia(hoje)
QR -> FS : quiz_do_dia/{dia}
QR --> RS : QuizDoDia | null
alt sorteio do dia inexistente
  RS --> R : 409 "quiz ainda não foi sorteado"
end
RS -> RS : localiza a questão no array do dia
alt questão não pertence a hoje
  RS --> R : 422 "não faz parte do quiz de hoje"
end

RS -> RR : obterResposta(playerId, dia, questaoId)
RR -> FS : .../respostas/{dia}/itens/{questaoId}
RR --> RS : ItemResposta | null
alt já respondeu esta questão hoje
  RS --> R : 409 "já respondeu esta questão hoje"
end

RS -> DR : listarAlternativas(questaoId, disciplinaId)
DR -> FS : alternativas orderBy ordem
DR --> RS : Alternativa[] (todas corretas)
RS -> TX : melhorAlternativa(resposta, alternativas)
loop para cada alternativa
  RS -> TX : casarPorWord(resposta, alternativa.texto)
  TX --> RS : { casou, precisao }
end
RS -> RS : desempata por especificidade\n(mais palavras significativas)

RS -> PS : pesoProvisional(alternativa encontrada)
PS --> RS : 100 se casou, senão 0
note right of PS
  Fase 1: peso base cheio.
  O peso real só existe no
  fechamento (diagrama 10).
end note

RS -> RR : gravarResposta(playerId, dia, { ... })
RR -> FS : set itens/{questaoId}\nresposta, respostaNormalizada,\nalternativaId, casou, pontos,\ntempoDeResposta
RS -> PR : somarPontuacaoDoDia(playerId, pontos)
PR -> FS : increment pontuacaoDoDia, respostasHoje
RS --> R : { registrada, casou, pontos, jaRespondida }
R --> API : 201
API --> QC : SubmitAnswerResult

alt casou
  QC --> J : "Resposta aceita! Vale 100 pontos\nprovisórios"
else não casou
  QC --> J : "Nenhuma resposta aceita\ncombina com o que você escreveu"
end
QC -> API : GET /quiz/rodada (recarrega)
API --> QC : próxima questão da vez

note over RS, FS
  alternativaTexto é gravado no
  documento, mas a resposta HTTP
  leva apenas casou e pontos.
end note

note over RS
  Uma resposta por questão por
  dia. A checagem é leitura antes
  da escrita: dois envios
  simultâneos ainda podem
  passar os dois.
end note

@enduml
```

---

## 8. Motor de word match

`server/lib/texto.ts` + `respostas.service.ts`. A regra é `precisao === 1`: o jogador
pode escrever **mais** que a alternativa, nunca **menos**.

```plantuml
@startuml
title Atividade — casarPorWord e melhorAlternativa
skinparam shadowing false
skinparam activityDiamondFontSize 12

start

:normalizar(texto)
NFD -> remove marcas combinantes
-> minúsculas -> não-alfanumérico vira espaço
-> colapsa espaços -> trim;

if (texto normalizado vazio?) then (sim)
  :casou = false\nprecisao = 0;
  stop
endif

:tokenizar(resposta)\nSet de palavras da resposta;
:palavrasSignificativas(alternativa)\nremove stop words\na, o, de, the, of...;
if (não sobrou palavra significativa?) then (sim)
  :usa todos os tokens;
endif

:encontradas = palavras da alternativa\npresentes na resposta;
:precisao = encontradas / total;

if (precisao = 1?) then (sim)
  :casou = true;
else (não)
  :casou = false;
endif

note right
  Ordem das palavras não
  importa, acento não
  importa, caixa não
  importa. "1889 de
  novembro 15" casa.
end note

if (casarPorWord) then (não, fim de uma alternativa)
  :descarta esta alternativa;
else (sim)
  :compara com a melhor\nalternativa até agora;
  if (melhorou?) then (sim)
    :guarda como melhor\n(precisao, depois nº de\npalavras significativas);
  endif
endif

if (houve alternativa casada?) then (sim)
  :pontos = pesoProvisional(alternativa)\n100 se casou, senão 0;
  :casou = true;
else (não)
  :casou = false\npontos = 0;
  :guarda o texto digitado\npara o histórico;
endif

stop

note right
  <b>Desempate por especificidade</b>
  alternativas: "Luiz Inácio Lula da Silva" | "Lula da Silva" | "Lula"
  jogador escreve "Lula da Silva" -> 2/2 na longa e 1/1 em "Lula"
  -> vence a de mais palavras
  jogador escreve "Lula" -> sobe no balde curto
  É isso que permite forma curta e longa lado a lado.
end note

@enduml
```

> [!danger] Não afrouxe o matcher
> A alternativa casada **é** o balde de raridade. Se match parcial passasse, o peso
> passaria a depender do desempate arbitrário entre alternativas equivalentes e
> **escrever menos renderia mais**. Apelido, abreviação e sobrenome precisam existir
> como alternativa própria ("Lula" tem precisão 0.25 contra "Luiz Inácio Lula da
> Silva"). O defeito, quando existe, é de conteúdo — não de código.

---

## 9. Script Diário — às 00h00

A seta do fluxograma é sequência obrigatória: **peso → ranking → sorteio**. O script
fecha `hoje - 1` e gera o sorteio de `hoje`.

```plantuml
@startuml
title Sequência — Script Diário (00h00, fuso America/Sao_Paulo)
autonumber
skinparam shadowing false

participant "node-cron\n'0 0 * * *'" as C
participant "Express\nadmin.routes" as R
participant "script-diario.service" as SD
participant "datas.ts" as D
participant "peso.service" as PS
participant "ranking.service" as RS
participant "sorteio.service" as SS
participant "respostas.repo" as RR
participant "players.repo" as PR
participant "disciplinas.repo" as DR
participant "quiz.repo" as QR
database "Firestore" as FS

group Gatilho
  alt CRON_HABILITADO = true
    C -> SD : rodarScriptDiario(hojeISO())
  else agendador externo
    R -> R : confere header x-cron-segredo
    R -> SD : rodarScriptDiario(hoje ?? hojeISO())
  end
end

SD -> D : deslocarDia(hoje, -1)
D --> SD : diaFechado (ontem)

== 1. Cálculo de Peso das alternativas ==
SD -> PS : calcularPesosDasAlternativas(diaFechado)
PS -> PR : listarPlayers()
PR -> FS : players
PR --> PS : Player[]
PS -> RR : listarRespostasDoDiaDeTodos(dia, playerIds)
note right of RR
  Recebe os ids e varre um a
  um: nenhum collection group,
  nenhum índice composto.
end note
RR -> FS : players/{id}/respostas/{dia}/itens
RR --> PS : [{ playerId, item }]
PS -> PS : agrupa por questão\ne conta escolhas por alternativaId
PS -> PS : descarta quem não casou\n(fez 0 e não influenceia)
PS -> DR : listarAlternativasDeQuestoes(refs)
DR --> PS : Map<questaoId, Alternativa[]>
PS -> PS : calcularPeso(escolhas, total) para cada alternativa
PS -> DR : gravarPesos(lista, dia) em lotes de 400
DR -> FS : alternativas/{slug}/pontuacao/{dia}\npeso, escolhas, totalRespostas
PS -> RR : aplicarPontosRecalculados(lista, dia)
RR -> FS : update itens/{questaoId}.pontos\n+ pontosRecalculadosEm
PS --> SD : ResultadoPesos

== 2. Ranking dos players com base no peso ==
SD -> RS : fecharRankingDoDia(diaFechado)
RS -> RR : listarRespostasDoDiaDeTodos(dia, playerIds)
RR --> RS : respostas do dia (com os pesos novos)
RS -> RS : soma pontos do dia por player
RS -> RS : ordenarRanking\n(total desc, pontos do dia desc, nickname pt-BR)
RS -> PR : atualizarPontuacoes(lista)
PR -> FS : pontuacaoTotal = acumulado + pontos do dia\nranking = posição\npontuacaoDoDia = 0
RS --> SD : { jogadores, top }

== 3. Sorteio de 7 novas questões ==
SD -> SS : sortearQuizDoDia(hoje)
SS -> QR : obterQuizDoDia(hoje)
alt quiz_do_dia/{hoje} já tem questões
  QR --> SS : QuizDoDia existente
  SS --> SD : jaExistia = true (não sorteia de novo)
else ainda não existe
  SS -> DR : listarDisciplinas(ativa = true)
  SS -> DR : listarQuestoesDaDisciplina(id)
  SS -> DR : listarAlternativasDeQuestoes(refs)
  SS -> SS : descarta questão sem alternativa\n(injogável: o match não teria contra o que casar)
  SS -> SS : embaralha disciplinas, uma questão cada\naté completar TOTAL_QUESTOES_DIA
  SS -> DR : desmarcarQuestaoSelecionadas(ids)
  SS -> DR : marcarQuestaoSelecionada(..., true)
  SS -> QR : garantirQuizDoDia(hoje, questoes)
  QR -> FS : create quiz_do_dia/{hoje}
  SS --> SD : jaExistia = false
end

SD --> SD : monta o RelatorioScriptDiario
SD --> R : { dataProcessada, dataGerada, pesos, ranking, novasQuestoes }
R --> C : HTTP 200

note over SD
  A ordem é dependência, não
  preferência: o ranking é
  "calculado com base no peso
  das alternativas", então o
  peso precisa existir antes.
  Nunca reordene.
end note

note over RS
  ⚠️ Este passo NÃO é idempotente.
  Rodar o script duas vezes no
  mesmo dia infla o ranking:
  os pontos do dia vêm das
  respostas (imutáveis) e não
  do placar provisório, que é
  zerado. Exatamente um
  agendador, sempre.
end note

note over R
  ⚠️ Sem CRON_SEGREDO no
  ambiente a rota fica aberta.
  Em produção defina a variável
  e envie x-cron-segredo.
end note

@enduml
```

### Simular a virada

```plantuml
@startuml
title Atividade — Simulação manual do fechamento
skinparam shadowing false

start
:rodarScriptDiario(hoje = hojeISO())\nou o argumento AAAA-MM-DD do CLI;
:hoje = hojeISO()\n(ex: 2026-10-01);
:diaFechado = deslocarDia(hoje, -1)\n(ex: 2026-09-30);
:calcularPesosDasAlternativas(diaFechado);
:fecharRankingDoDia(diaFechado);
:sortearQuizDoDia(hoje);
:imprimir relatório\n(dia processado, dia gerado,\nnovas questões, repontuadas, top 10);
stop

note right
  <b>Comandos</b>
  npm run script:dia -- 2026-10-01
  npm run reset:dia -- --zerar-pontuacoes
  npm run reset:dia -- --apagar-jogadores e2e_
end note

@enduml
```

---

## 10. Peso dinâmico por raridade

Como a raridade vira pontos. A forma que menos gente escreveu vale o teto; a que todo
mundo escreveu vale o piso.

```plantuml
@startuml
title Atividade — calcularPesosDasAlternativas (fechamento do dia)
skinparam shadowing false
skinparam activityDiamondFontSize 12

start
:listar todos os players;
:listarRespostasDoDiaDeTodos(dia, playerIds);
:para cada resposta do dia;
while (tem resposta com alternativaId?) is (sim)
  if (casou == false?) then (sim)
    :ignora\n(fez 0, não influenceia a raridade);
  else (não)
    :total[questao] += 1;
    :escolhas[questao][alternativaId] += 1;
  endif
endwhile (fim das respostas)

if (nenhuma resposta casou no dia?) then (sim)
  :devolve resultado vazio\nrespostasRecalculadas = 0;
  stop
endif

:para cada questão respondida;
while (tem questão?) is (sim)
  :para cada alternativa da questão;
  while (tem alternativa?) is (sim)
    :e = escolhas[alternativa] (0 se ninguém escreveu);
    :t = total[questao];
    if (t = 0 ou e = 0?) then (sim)
      :peso = PESO_BASE (100)\nninguém escreveu igual: teto;
    else (não)
      :peso = PESO_MINIMO + (PESO_BASE - PESO_MINIMO)\n* (1 - e / t);
      :peso = round(max(peso, PESO_MINIMO));
    endif
    :acumula para gravar\nalternativas/{slug}/pontuacao/{dia};
  endwhile (fim das alternativas)
endwhile (fim das questões)

:gravarPesos em lotes de 400;
:aplicarPontosRecalculados\nreescreve itens/{questaoId}.pontos;
:devolve { data, questoes, respostasRecalculadas };
stop

note right
  <b>Cenários</b>
  Ninguém escreveu igual -> 100
  Todo mundo escreveu igual -> 10
  A mais rara das 7 questões\nfica com o teto.
end note

note right
  <b>Fase 1 vs fase 2</b>
  No envio da resposta vale
  pesoProvisional = 100
  (peso base, se casou).
  O peso real só sai daqui.
  Por isso o placar mostrado
  na tela é provisório e o
  texto da UI diz isso.
end note

@enduml
```

---

## 11. Ciclo de vida da rodada

Estados que a tela e o Firestore atravessam, do login ao fechamento das 00h00.

```plantuml
@startuml
title Estado — ciclo de vida da rodada e da resposta na tela
hide empty description
skinparam shadowing false

[*] --> SemSessao

state SemSessao
state Carregando
state Jogando {
  [*] --> AguardandoResposta
  state AguardandoResposta
  state Enviando
  state Conferida
  state Falha
  state RodadaEncerrada
}

state Enviando : status = sending
state Conferida : status = checked
state Falha : status = idle + erro na tela

SemSessao --> Carregando : abrir a aplicação\ne token em quiz-arena:token
Carregando --> SemSessao : token ausente,\nrevalidou e não achou jogador
Carregando --> Jogando : GET /api/auth/eu devolve jogador
Carregando --> SemSessao : erro ou token expirado

SemSessao --> Jogando : POST /auth/entrar OK\n(201 criou, 200 entrou)

state AguardandoResposta {
  AguardandoResposta --> Enviando : Enviar resposta
  Enviando --> Conferida : 201 { casou, pontos }
  Enviando --> Falha : 401 / 409 / 422 / 500
  Falha --> AguardandoResposta : corrigir e reenviar
  Conferida --> RodadaEncerrada : todas as 7 respondidas
  Conferida --> AguardandoResposta : GET /rodada devolve\nquestaoAtual
}

RodadaEncerrada --> AguardandoResposta : novo dia\n(GET /rodada)
Jogando --> SemSessao : Sair\n(token apagado)

note right of Conferida
  casou = true
  "Resposta aceita! Vale 100
  pontos provisórios"
  casou = false
  "Nenhuma resposta aceita
  combina com o que você
  escreveu"
  alternativaTexto nunca
  aparece.
end note

note right of RodadaEncerrada
  Rodada encerrada mostra
  posição e pontuação e avisa
  que o peso real sai da
  raridade à meia-noite.
end note

@enduml
```

### Estado do dia no Firestore

```plantuml
@startuml
title Estado — o dia no Firestore
hide empty description
skinparam shadowing false

[*] --> SemSortear : primeiro acesso do dia

state SemSortear : quiz_do_dia/{dia} não existe
state EmJogo : quiz_do_dia/{dia} gravado
state Fechando : cron das 00h00 começou
state Fechado : dia virado

SemSortear --> EmJogo : sortearQuizDoDia(hoje)\nou garantirQuizDeHoje()\n(boot do servidor / GET /rodada)
EmJogo --> EmJogo : respostas do dia\n(selecionada = true)
Fechando --> Fechado : pesos gravados
Fechando --> Fechado : ranking fechado\n(pontuacaoTotal, ranking;\npontuacaoDoDia = 0)
Fechado --> EmJogo : sortearQuizDoDia(dia seguinte)

note right of EmJogo
  Todos os jogadores veem as
  mesmas questões: o sorteio é
  um documento único e
  idempotente.
end note

note right of Fechando
  <b>Não reordenar:</b>
  1 peso -> 2 ranking -> 3 sorteio
  O ranking depende do peso.
end note

note left of Fechado
  Reexecutar o fechamento no
  mesmo dia infla o ranking
  (passo 2 não idempotente).
end note

@enduml
```

---

## 12. Componentes do sistema

As três zonas do fluxograma, com as interfaces entre elas.

```plantuml
@startuml
title Quiz Arena — Componentes do sistema
skinparam componentStyle rectangle
skinparam shadowing false

package "Frontend Vite" {
  [SPA React\nsrc/] as SPA
  [api.ts\núnico cliente HTTP] as CLIENT
  [localStorage\nquiz-arena:token] as LS
}

package "Backend Vite" {
  [API Express\n/api] as API
  [Middleware de sessão\nJWT + bcrypt] as MID
  [Regras de negócio\nservices/] as SVC
  [Acesso a dados\nrepositories/] as REPO
  [Script Diário\npeso, ranking, sorteio] as SD
  [node-cron\n00h00] as CRON
}

package "Firebase" {
  database "Firestore" as FS
  [firestore.rules\nbloqueia o cliente] as RULES
}

package "Fora do sistema" {
  [Agendador externo\n(curl / Cloud Scheduler)] as EXT
  [Operador\nnpm run seed / reset:dia] as OPS
}

SPA --> CLIENT : fetch /api/...
CLIENT --> LS : token
CLIENT --> API : "Authorization: Bearer"
API --> MID : antes de toda rota
MID --> SVC : regra de negócio
SVC --> REPO : "única porta para o banco"
REPO --> FS : Admin SDK
SD --> SVC : mesmo conjunto de serviços
CRON --> SD : 00h00 no fuso
EXT --> API : POST /api/admin/script-diario
OPS --> REPO : scripts npm
SPA -[hidden]-> RULES : bloqueado

note bottom of RULES
  O SDK web do Firebase não
  está instalado no front e
  não deve estar. É esta regra
  que impede o jogador de
  abrir o console e ver as
  alternativas aceitas.
end note

note bottom of REPO
  Nenhum índice composto por
  design: nenhum collection
  group, ids passados
  explicitamente.
end note

@enduml
```

---

## 13. Implantação

Onde cada peça roda. Um site, uma porta (6767) — em desenvolvimento e em produção.

```plantuml
@startuml
title Quiz Arena — Implantação
skinparam shadowing false
skinparam packageStyle rectangle

node "Navegador do jogador" as NAV {
  artifact "SPA React (dist/)\nlogin, questão da vez,\nranking lateral" as SPA
  storage "localStorage\nquiz-arena:token" as LS
}

node "Desenvolvimento\nnpm run dev" as DEV {
  artifact "Vite 6\nporta 6767" as VITE
  artifact "createApiApp()\ncomo middleware\n(server/app.ts:19)" as MIDDEV
  database "Firestore\nprojeto de desenvolvimento" as FSDEV
}

node "Produção\nnpm start" as PROD {
  artifact "Express 5\nporta 6767" as EXPR
  artifact "express.static(dist/)\n+ fallback do SPA" as STATIC
  artifact "node-cron\n'0 0 * * *'" as CRON
  database "Firestore\nprojeto de produção" as FSPROD
}

node "Processo dedicado\nnpm run cron" as CRONPROC {
  artifact "node-cron\n(quando CRON_HABILITADO=false\nno servidor web)" as CRONONLY
}

node "Máquina do operador" as OPS {
  artifact "tsx\nseed, script:dia,\nreset:dia, testes" as CLI
}

node "nginx / balanceador" as LB {
  artifact "proxy_pass :6767" as NGINX
}

SPA --> VITE : dev, http://localhost:6767
VITE --> MIDDEV : middleware
MIDDEV --> FSDEV

LB --> SPA : arquivos estáticos
LB --> EXPR
SPA --> EXPR : POST/GET /api
EXPR --> STATIC : dist/
EXPR --> FSPROD
CRON --> FSPROD
CRONONLY --> FSPROD
SPA --> LS
CLI --> FSPROD : "credencial Admin versionada"

note bottom of VITE
  ⚠️ A porta tem duas fontes
  independentes: server.port
  (dev) e config.porta (prod).
  O script dev NÃO pode passar
  --port, senão a flag da CLI
  sobrescreve o vite.config.ts
  e os dois divergem em
  silêncio. 6767 nos dois lados.
end note

note bottom of CRON
  Exatamente um agendador.
  Cron interno e crontab juntos,
  ou pm2 em cluster, rodam o
  fechamento duas vezes e
  inflam o ranking.
end note

note bottom of CLI
  <b>Credenciais</b>
  A Admin SDK está versionada
  no repositório; os padrões de
  secret do .gitignore também
  estão comentados. Não confie
  no .gitignore para isso.
end note

@enduml
```

---

## Mapa: caixa do fluxograma → elemento do UML

| Caixa do fluxograma | Onde está no UML |
| --- | --- |
| **Frontend Vite** | Diagrama 12 (`SPA React`), diagrama 4 (componentes e contratos) |
| Entrada de Nickname e Senha | `UC1`, diagrama 5, `LoginPage` no diagrama 4 |
| Exibir uma questão por vez + 7 questões do dia | `UC2`/`UC5`, diagrama 6, `QuestionCard`/`RodadaEncerrada` |
| Ranking global na lateral + busca de nickname | `UC3`/`UC4`, `RankingSidebar` no diagrama 4 |
| **Backend Vite / API endpoint** | Diagrama 3 (rotas), diagrama 12 (`API Express`) |
| Salvar respostas | `UC6`, diagrama 7 |
| Buscar questões do dia | `UC5`, diagrama 6 |
| Pesquisar nickname | `UC4`, `buscarPorNickname` no diagrama 3 |
| **Script Diário 00h00 (cron)** | `UC11`, diagrama 9, `CronJob` no diagrama 13 |
| 1. Cálculo de Peso das alternativas | `UC8`, diagrama 10, `PesoService` no diagrama 3 |
| 2. Ranking (depende do peso) | `UC9`, diagrama 9, `RankingService` |
| 3. Sorteio de 7, sem repetir disciplina | `UC10`, diagrama 9, `SorteioService` |
| **Firebase / Disciplinas** | `Disciplina`, `Questao`, `Alternativa`, `Pontuacao` no diagrama 2 |
| **Firebase / Player**: ranking, nickname, senha | `Player` e `Pontuacao` no diagrama 2 |
| Respostas → `id_questao` → `tempo_de_resposta` (vermelho, TODO) | `ItemResposta` no diagrama 2, nota no diagrama 7 |
| "as respostas são sempre por extenso" / match like por word | Diagrama 8 |
| "documento de alternativas possui somente alternativas corretas" | Nota em `Alternativa` no diagrama 2 |

---

## Convenção e verificação

- Cada bloco abre com `@startuml` e fecha com `@enduml`, para o plugin renderizar
  sozinho. Sem `skinparam` compartilhado entre diagramas — cada um é independente.
- Nomes de classe e método são os reais do código, em pt-BR sem acento no
  identificador (`sortearQuizDoDia`, `casarPorWord`, `pontuacaoDoDia`).
- Ao mexer em regra de negócio, modelo de dados, fluxo de tela, rota de API ou ordem do
  Script Diário: atualize o diagrama **e** este mapa no mesmo commit do código.
- Diagramas que descrevem comportamento de temporização (10 e 11) descrevem o estado
  desejado; o comportamento real está em `server/services/peso.service.ts` e
  `server/services/script-diario.service.ts`. Se divergirem, o código ganha — e o
  diagrama precisa ser corrigido junto, sem parar para perguntar.

> [!success] Verificado com o PlantUML 1.2024.7
> Os 15 blocos passaram no `-checkonly` **e** foram renderizados para SVG.
>
> Três armadilhas do PlantUML já encontradas e corrigidas aqui, para quem for mexer
> nos diagramas depois:
>
> - `note` **solta com `bottom`** dentro de `activityDiagram` é rejeitado. Use
>   `note right` / `note left`, ou ancore a nota numa atividade.
> - `note` **não** pode ficar dentro de `alt` / `else` de `sequenceDiagram`. Mova a
>   nota para o nível de cima da lista.
> - Em `sequenceDiagram`, os ramos de `par` depois do primeiro usam `else`, não `and`.
>
> Os diagramas de classe (2, 3 e 4) abrem com `!pragma layout elk`: eles são densos
> demais e o motor Smetana (usado quando o `dot` do Graphviz não está instalado) não
> consegue dar layout neles. Se a sua versão do plugin reclamar do `!pragma`, pode
> apagar a linha — o diagrama continua válido, só o layout muda.
