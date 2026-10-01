---
title: Quiz Arena — Documentação Técnica
tags: [quiz-arena, documentacao, firestore, api, deploy]
status: vivo
criado: 2026-09-30
atualizado: 2026-09-30
---

# Quiz Arena — Documentação Técnica

> [!important] Esta documentação
> Cobre arquitetura, modelo de dados completo no Firestore, API, motor de pontuação e
> operação. **Não contém nenhuma credencial.** Nomes de arquivos de credencial aparecem
> como máscara (`*-firebase-adminsdk-*.json`); valores de `JWT_SECRET`, `CRON_SEGREDO`
> e chaves privadas são sempre referenciados apenas pelo nome da variável de ambiente.

---

## 1. Visão geral

Quiz diário de **7 questões por rodada** com resposta **por extenso**. O jogador entra
com *nickname* e senha, responde uma questão por vez e compete num ranking global
cumulativo.

O diferencial do projeto é que **não existe resposta errada**. Cada questão
faz uma pergunta aberta ("Qual é o nome de um animal mamífero?") e o documento de
alternativas guarda **somente as formas aceitas** — cavalo, elefante, golfinho, baleia
todas valem ponto. Quem escreve a forma que **menos gente** usou fica no topo do peso.

**Três zones, um único domínio e uma única porta:**

| Zona | Responsabilidade |
| --- | --- |
| **Frontend Vite** | SPA React: entrada, questão da vez, ranking na lateral |
| **Backend Vite** | API Express + Script Diário |
| **Firestore** | Persistência exclusiva, inacessível por clientes |

---

## 2. Conceito central — e por que ele é frágil

> [!warning] Toda alternativa é uma resposta que o sistema dá como certa
> A subcoleção `alternativas` **não guarda distratores**. Isso é uma decisão de produto
> deliberada, herdada do fluxograma original, e tem duas consequências que é preciso
> entender antes de mexer em qualquer coisa:
>
> 1. `casou: true` significa *"escrevi uma das formas aceitas"* — **não** *"acertei a
>    resposta única"*. Não existe gabarito escondido para comparar.
> 2. **Uma alternativa que não é resposta correta da pergunta faz o jogador ganhar ponto
>    errado.** Não há como o sistema detectar isso: ele não sabe a verdade, só conhece a
>    lista que o seed gravou.

A segunda consequência é a origem de praticamente todo o problema de conteúdo do projeto,
descrito na seção 14.

---

## 3. Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19, Vite 6, TypeScript, TailwindCSS 3, lucide-react |
| Backend | Express 5, Node 22 (mínimo 22 por causa do `firebase-admin` 14) |
| Banco | Firestore via **Admin SDK** (somente backend) |
| Auth | Sessão própria: JWT assinado + bcrypt — **sem Firebase Auth** |
| Agendamento | `node-cron` **interno ao processo** |
| Execução | `tsx` para rodar TypeScript direto |

Não há runner de testes, ESLint nem Prettier. `npm run lint` **é** o typecheck.

---

## 4. Arquitetura e fluxo de execução

### Camadas fixas, uma direção só

```
routes  ->  services  ->  repositories  ->  Firestore
```

- Só `server/repositories/*` chama `obterFirestore()`.
- `server/config.ts` valida ambiente com zod, resolve credenciais e define o fuso.
- `server/firebase.ts` faz singleton do Admin SDK por processo.
- `server/lib/` tem `texto.ts` (normalização + word match), `datas.ts`, `sessao.ts` (JWT),
  `http.ts` (`ErroHttp`, wrapper `rota()`, handler de erro).
- `server/services/` tem a regra de negócio: `peso`, `ranking`, `sorteio`, `respostas`,
  `auth`, `quiz`, `script-diario`.

### Um servidor só, dois contextos

`createApiApp()` (`server/app.ts:19`) é montado em **dois lugares**:

| Contexto | Montagem | Quem serve `dist/` |
| --- | --- | --- |
| Desenvolvimento | middleware do Vite (`vite.config.ts`) | Vite |
| Produção | dentro de `server/index.ts` | Express (`express.static`) |

> [!tip] Não existe segundo servidor
> `npm run dev` sobe **um** processo. Publicar é `npm run build` + `npm start`, não
> "subir o front e a API separados".

### Fluxo de uma requisição

```
Browser -> /api/... -> carregarSessao (JWT, tolerante a token invalido)
                       -> rota -> exigeSessao() nas rotas de escrita
                       -> service -> repository -> Firestore
                       -> tratadorDeErros (sempre JSON)
```

`carregarSessao` **não** rejeita token inválido: ele segue sem sessão, e cada rota decide
o que fazer. Assim a interface não quebra por um token velho.

---

## 5. Estrutura do Firestore

Raiz do projeto: nome do projeto definido na credencial (ver §12). Todas as coleções de
primeiro nível:

```
disciplinas/      conteúdo do quiz (seed)
players/          jogadores e suas respostas
quiz_do_dia/      sorteio de cada dia
temas/            tema exibido na lateral
```

### 5.1 Mapa completo

```text
disciplinas/{disciplinaId}
├── nome, descricao, ativa
├── criadoEm, atualizadoEm
└── questoes/{questaoId}
    ├── enunciado, destaque, categoria, disciplinaNome
    ├── selecionada            # true quando compõe o quiz do dia atual
    ├── ativa
    ├── criadoEm, atualizadoEm
    └── alternativas/{alternativaId}      # SOMENTE alternativas corretas
        ├── texto, ordem, atualizadoEm
        └── pontuacao/{yyyy-mm-dd}        # peso do dia
            ├── peso                      # 10..100
            ├── escolhas                   # quantos escreveram esta forma
            ├── totalRespostas
            └── geradoEm

players/{playerId}                # playerId = chave normalizada do nickname
├── nickname, nicknameLower, iniciais
├── senhaHash                     # bcrypt, nunca texto puro
├── pontuacaoTotal                # acumulado, fechado pelo Script Diário
├── pontuacaoDoDia                # provisório, refeito a cada resposta
├── ranking                       # posição global, só escrita no fechamento
├── respostasHoje
├── criadoEm, ultimoAcessoEm, atualizadoEm
└── respostas/{yyyy-mm-dd}/itens/{questaoId}
    ├── questaoId, disciplinaId
    ├── resposta                  # exatamente o que o jogador digitou
    ├── respostaNormalizada       # sem acento/pontuação, minúscula
    ├── alternativaId             # null quando nada casou
    ├── alternativaTexto          # NUNCA sai para a API
    ├── casou
    ├── pontos                    # peso aplicado; recalculado à noite
    ├── tempoDeResposta           # gravado, não pontua (TODO do fluxograma)
    ├── respondidaEm
    ├── conferidaEm
    └── pontosRecalculadosEm

quiz_do_dia/{yyyy-mm-dd}
├── data, total
├── questoes[]                   # array embutido, não subcoleção
│   └── { ordem, questaoId, disciplinaId, disciplinaNome, categoria, enunciado }
└── geradoEm

temas/{temaId}                   # temaId = slug
├── titulo, descricao, data, tom, atualizadoEm
```

### 5.2 Chave do documento do jogador

`playerId` é `chaveDeNickname(nickname)`: minúsculas, sem acento, espaços viram `_`,
caracteres fora de `[a-z0-9_.-]` removidos.

```text
"Lula da Silva"  ->  lula_da_silva
"José Sarney"     ->  jose_sarney
```

Isso garante **unicidade sem depender do Firestore Auth** — nenhum e-mail é pedido ao
jogador. Consequência: `chaveDeNickname("Lula")` e `chaveDeNickname("lula")` são a mesma
pessoa por construção.

### 5.3 Slug da alternativa

`chaveDeAlternativa(texto)` deriva o id do documento do **texto normalizado**:
`normalizar(texto)`, espaços viram `-`, fora de `[a-z0-9-]` removido.

```text
"Mona Lisa"  ->  mona-lisa
"Aquarela"   ->  aquarela
```

> [!danger] Duas alternativas que só diferem em acento ou caixa colidem
> `Mona Lisa` e `Mona Lisa` (diferentes só no acento) produzem o mesmo id. Por isso
> `validarConteudo` **rejeita** forma normalizada duplicada na mesma questão, e o seed
> se recusa a gravar. Isso também impede "corrigir" `Uranio` → `Urânio` sem remover o
> documento antigo: os slugs são idênticos.

### 5.4 O documento `respostas/{dia}` intermediário

Ele **não existe** no fluxo normal. Só as folhas `itens/{questaoId}` são gravadas. Por
isso qualquer listagem precisa usar o caminho completo
(`players/{id}/respostas/{dia}/itens`) — um `get()` em `respostas/{dia}` voltaria vazio.

### 5.5 Índices

**Nenhum índice composto é necessário**, por decisão de arquitetura: os repositórios
evitam consultas em *collection group*. Em vez disso:

| Consulta | Estratégia |
| --- | --- |
| `listarRespostasDoDiaDeTodos` | recebe `playerIds` e varre um por um |
| `desmarcarQuestaoSelecionadas` | recebe `disciplinaIds` e varre um por um |
| `listarAlternativasDeQuestoes` | 7 consultas paralelas (são só 7 questões) |

Só existem índices de campo único: `orderBy('pontuacaoTotal','desc')` no ranking e um
*range* em `nicknameLower` para a busca de nickname.

> [!warning] Ao adicionar consulta
> Se você introduzir um *collection group* ou um filtro composto, o Firestore vai exigir
> um índice composto e a consulta falha em produção com um erro que só aparece no
> servidor. Mantenha o padrão de passagem de ids.

---

## 6. Regras de segurança do Firestore

`firestore.rules` **bloqueia tudo** para o cliente:

```text
match /{collection}/{document=**} {
  allow read, write: if false;
}
```

> [!important] Isso não é exagero
> O SDK web do Firebase **não está instalado no frontend** e não deve ser. Se alguém
> pudesse ler `alternativas`, abriria o console e veria todas as formas aceitas — o que
> destrói o jogo inteiro, porque a pergunta é justamente "qual forma ninguém usou?".
>
> O Admin SDK **ignora** essas regras (ele roda com privilégio de servidor), então o
> backend continua funcionando normalmente.

A API também nunca devolve `alternativaTexto`. O payload de resposta ao jogador contém
apenas `casou: boolean` e `pontos: number`.

---

## 7. Fluxo do jogador

1. **Entrada.** `POST /api/auth/entrar` com nickname e senha.
   - Nickname novo → criado com a senha informada.
   - Nickname existente + senha correta → entra e recebe JWT de 30 dias.
   - Nickname existente + senha errada → `401`.
2. **Revalidação.** Ao abrir a aplicação, `GET /api/auth/eu` valida o token guardado.
3. **Rodada.** `GET /api/quiz/rodada` devolve **tudo de uma vez**: tema, histórico,
   ranking global, lista de questões e a questão da vez. Evita quatro requisições na
   abertura da tela.
4. **Resposta.** `POST /api/quiz/respostas` — o front mede o tempo, mas ele **não pontua**.
5. **Uma por questão.** Repetir a mesma questão no mesmo dia dá `409`.
6. **Fim de rodada.** Quando todas as questões foram respondidas, a tela mostra o resumo
   e avisa que o peso real sai da raridade à meia-noite.

### Onde o front guarda a sessão

- Token JWT em `localStorage`, chave `quiz-arena:token`.
- Em `401`, `src/lib/api.ts` limpa o token e dispara o evento
  `quiz-arena:sessao-expirada`; `AuthContext` escuta e volta para a pré-página.
- `src/lib/api.ts` é o **único** cliente HTTP do projeto.

---

## 8. API

Todas exigem `Authorization: Bearer <token>`, exceto `/auth/entrar` e `/admin/saude`.

| Método | Rota | Função |
| --- | --- | --- |
| `POST` | `/api/auth/entrar` | Entra ou cria jogador; devolve `token` |
| `GET` | `/api/auth/eu` | Revalida a sessão |
| `GET` | `/api/quiz/rodada` | Estado completo da rodada |
| `POST` | `/api/quiz/respostas` | Grava resposta e devolve o resultado do match |
| `GET` | `/api/quiz/ranking?q=` | Ranking global, filtrável por nickname |
| `POST` | `/api/admin/script-diario` | Dispara o Script Diário |
| `GET` | `/api/admin/saude` | Diagnóstico do servidor |

### Códigos de erro relevantes

| Código | Quando |
| --- | --- |
| `401` | Token ausente/expirado, ou senha incorreta |
| `409` | Resposta repetida na mesma questão no mesmo dia; quiz do dia não sorteado |
| `422` | Corpo/query inválido (zod), ou resposta vazia |

> [!warning] `POST /api/admin/script-diario` sem `CRON_SEGREDO` fica **aberta**
> Em `server/routes/admin.routes.ts`, se `CRON_SEGREDO` não estiver definida no ambiente,
> a rota aceita qualquer chamada. Combinado com o passo de ranking não-idempotente (§9.3),
> isso permite a qualquer visitor rerodar o fechamento do dia.
> Em produção **sempre** defina `CRON_SEGREDO` e envie `x-cron-segredo`.

---

## 9. Motor de pontuação

### 9.1 Duas fases

> [!info] Responder não vale o peso final
> No envio da resposta vale `pesoProvisional` — o **peso base** (padrão 100). O peso real
> só existe depois que o dia fecha, quando se sabe quantas pessoas escreveram cada forma.

**Fase 1 — no envio.** Word match contra as alternativas. Se casar, `pontos = pesoBase`.

**Fase 2 — no fechamento.** O Script Diário compara as respostas de todos os jogadores
do dia e reescreve o peso de cada alternativa:

```text
peso = PESO_MINIMO + (PESO_BASE - PESO_MINIMO) * (1 - escolhas / totalRespostas)
```

| Cenário | Peso |
| --- | --- |
| Ninguém escreveu igual | `PESO_BASE` (100) — o teto |
| Todo mundo escreveu igual | `PESO_MINIMO` (10) — o piso |

Depois os pontos das respostas já gravadas são **reaplicados** com o peso real
(`pontosRecalculadosEm`), para que o placar do dia passe a valer o definitivo.

### 9.2 Ranking cumulativo

O ranking **somente** é escrito pelo fechamento diário:

```text
pontuacaoTotal = pontuacaoTotal_anterior + soma dos pontos do dia
pontuacaoDoDia = 0
```

Ordenação: total decrescente → pontos do dia decrescente → nickname (`localeCompare`
pt-BR), o que torna a ordem estável entre execuções.

O campo `players.ranking` é persistido, mas **só o fechamento escreve nele**. Por isso a
tela deriva uma posição provisória a partir do ranking atual quando `ranking == 0`
(jogador novo, ou que entrou depois do fechamento).

### 9.3 ⚠️ O fechamento não é idempotente

> [!danger] Rodar o Script Diário duas vezes no mesmo dia infla o ranking
> `somarPontosDoDia` lê os pontos de `players/{id}/respostas/{dia}/itens/*`, que é
> **imutável** — e zera `pontuacaoDoDia`, que *não é a fonte*. Então:

```text
acumulado 1000, pontos do dia 300
execução 1 -> pontuacaoTotal = 1300
execução 2 -> pontuacaoTotal = 1600
execução 3 -> pontuacaoTotal = 1900
```

Os passos de **peso** e **sorteio** são idempotentes; o de **ranking** não.
Consequência prática: **exatamente um agendador.** Nunca dois (cron interno + crontab),
nunca pm2 em modo cluster (`-i max`), nunca o serviço duplicado.

---

## 10. Word match

`server/lib/texto.ts`. Semântica em três passos:

### 10.1 Normalização

```text
NFD -> remove marcas combinantes -> minúsculas -> não-alfanumérico vira espaço -> colapsa
```

`"Coração" -> "coracao"`, `"H2O!" -> "h2o"`, `"  o   rio  " -> "o rio"`.

### 10.2 Comparação por token

`casarPorWord(resposta, alternativa)` devolve `casou` e `precisao` (fração das palavras
da alternativa presentes na resposta).

> [!info] A regra é `precisao === 1`
> O jogador pode escrever **mais** que a alternativa — `"acho que foi mario kart 8
> deluxe"` casa com `Mario Kart 8 Deluxe`. Mas nunca **menos**: `"Lula"` tem precisão
> 0.25 contra `Luiz Inácio Lula da Silva` e é **recusado**.
>
> É por isso que apelido, abreviação e sobrenome precisam existir como **alternativa
> própria**: são eles que cobrem a forma como o jogador realmente digita.

### 10.3 Palavras vazias

Um conjunto de stop words (`a`, `o`, `de`, `da`, `em`, `the`, `of`, …) é ignorado na
comparação. Se a alternativa for composta só de vazias, cai-se para todos os tokens.

### 10.4 Desempate por especificidade

`melhorAlternativa` escolhe, entre as que casaram: maior `precisao`; em empate, maior
número de palavras significativas.

É isso que permite ter forma curta e longa lado a lado sem ambiguidade:

```text
alternativas: "Luiz Inácio Lula da Silva" | "Lula da Silva" | "Lula"

jogador escreve "Lula da Silva" -> casa 2/2 com a longa e 1/1 com "Lula" (ambas precisao 1)
                                 -> desempate: 2 palavras > 1 -> vence a longa
jogador escreve "Lula"          -> sobe no balde curto
```

> [!danger] Não afrouxe o matcher para resolver lacuna de conteúdo
> A alternativa casada **é** o balde de raridade. Se match parcial fosse aceito, o peso
> passaria a depender do desempate arbitrário entre alternativas equivalentes, e
> escrever menos passaria a render mais. O defeito é de **conteúdo**, não de código.

---

## 11. Script Diário

Dispara às **00h00** (`node-cron`, `'0 0 * * *'`, `timezone: America/Sao_Paulo`), interno
ao processo via `server/jobs/cron.ts`. Fecha o dia **anterior** ao dia corrente.

A ordem é **dependência, não preferência**:

```text
1. calcularPesosDasAlternativas(dia anterior)   -> server/services/peso.service.ts
2. fecharRankingDoDia(dia anterior)              -> server/services/ranking.service.ts
3. sortearQuizDoDia(hoje)                       -> server/services/sorteio.service.ts
```

O ranking vem **depois** do peso porque ele é "calculado com base no peso das
alternativas". Desordenar quebra o cálculo.

### 11.1 O sorteio

- Uma questão por disciplina, embaralhadas, até completar `TOTAL_QUESTOES_DIA` (7).
- **Descarta** questões sem alternativa alguma — sem match, o jogo não funciona.
- Desmarca (`selecionada: false`) as questões anteriores **só** quando o sorteio vai
  realmente acontecer.
- Grava em `quiz_do_dia/{dia}`; se o documento já existir com questões, **não sorteia de
  novo** — é isso que garante que todo mundo veja o mesmo quiz.

`garantirQuizDeHoje()` roda no boot do servidor e na primeira rodada vazia, então o site
não abre sem questões antes do primeiro cron.

### 11.2 Simular a virada

```bash
npm run script:dia -- 2026-10-01   # fecha 30/09 e gera o sorteio de 01/10
```

---

## 12. Configuração

Variáveis lidas por `server/config.ts`, validadas com zod **no import do módulo** —
ou seja, ambiente inválido estoura ao carregar, não na chamada da função.

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `NODE_ENV` | — | `=production` ativa `isProducao` |
| `PORT` | `6767` | Porta do Express em produção |
| `JWT_SECRET` | efêmero em dev | **Obrigatório** com `NODE_ENV=production` |
| `CRON_SEGREDO` | — | Se definido, exige header `x-cron-segredo` |
| `CRON_HABILITADO` | `true` | `false` desliga o cron interno |
| `FUSO_HORARIO` | `America/Sao_Paulo` | Fuso de "hoje" e do cron |
| `TOTAL_QUESTOES_DIA` | `7` | Questões por rodada (1..20) |
| `PESO_BASE_ALTERNATIVA` | `100` | Teto do peso |
| `PESO_MINIMO` | `10` | Piso do peso |

> [!danger] `JWT_SECRET` é a variável mais fácil de deixar errada
> Sem ela **e** com `NODE_ENV=production`, `config.ts` lança no import e o processo morre
> sem mensagem útil. **Sem** `NODE_ENV=production`, o sistema cai no segredo efêmero
> hardcoded `'segredo-efemero-de-desenvolvimento-quiz-arena'` — público no código-fonte.
>
> Consequência do segredo efêmero: **todo restart do processo desloga todos os jogadores**,
> porque o JWT gravado no navegador foi assinado com o segredo da instância anterior.

### 12.1 Credenciais do Admin SDK

Resolução em ordem (`server/config.ts`):

1. `GOOGLE_APPLICATION_CREDENTIALS` (absoluto ou relativo à raiz do projeto)
2. Arquivos com nome esperado na raiz, na forma `*-firebase-adminsdk-*.json`
3. Sem nenhum dos dois → erro explícito

O arquivo de credencial **nunca** deve ser servido pelo nginx nem ficar em diretório
público. Ele carrega chave privada e e-mail de conta de serviço.

### 12.2 `.env`

Carregado por `dotenv` na primeira linha de `config.ts`, antes do parse. Está no
`.gitignore` — **é o lugar seguro** para segredos, ao contrário dos padrões de secret do
repositório, que estão comentados.

> [!warning] dotenv não sobrescreve
> Se uma variável já existir no ambiente do processo, o `.env` é ignorado para ela.
> Recrie o processo (`pm2 delete` + `pm2 start`) em vez de só reiniciar, senão uma
> variável velha embutida continua prevalecendo.

---

## 13. Frontend

```
src/
├── main.tsx              StrictMode + AuthProvider
├── App.tsx               shell, useRodada, QuestionCard, RankingSidebar, LeftSidebar
├── pages/LoginPage.tsx   pré-página de entrada
├── contexts/AuthContext  sessão; revalida token ao abrir; escuta expiração
├── lib/api.ts            cliente HTTP único; ErroApi; token em localStorage
└── types/quiz.ts         contratos — espelha 1:1 o payload da API
```

> [!warning] `types/quiz.ts` é espelho do backend
> Mudar o payload da API exige mudar os dois lados. Não há geração automática.

### Estilo

- Tailwind por utilitário no JSX, **mais** ~945 linhas de classes estruturais em
  `src/index.css` (`.app-shell`, `.panel`, `.question-shell`, `.primary-button`,
  `.rank-row`, `.history-row`…). Não há `@layer components`: primitiva de layout nova
  tende a ir para o `index.css`.
- Paleta em `tailwind.config.js`: `ink`, `panel`, `line`, `cyan`, `violet`.

---

## 14. Conteúdo (seed)

`server/scripts/dados-do-seed.ts` é a fonte do conteúdo: **8 disciplinas, 40 questões,
1.275 alternativas**.

| Disciplina | Questões |
| --- | --- |
| Artes, Biologia, Física, História, Inglês, Matemática, Português, Química | 5 cada |

### 14.1 Regras bloqueantes

`npm run validar:conteudo` roda as mesmas regras que o `seed` executa antes de gravar —
o seed **se recusa a escrever** conteúdo inconsistente:

- as 8 disciplinas esperadas, sem extras;
- ≥5 questões por disciplina, ≥20 alternativas por questão;
- **nenhuma forma normalizada duplicada** na mesma questão;
- charset permitido, sem letra de outro alfabeto, sem espaço duplicado ou nas pontas.

> [!important] Cobertura é o que define se o jogo é justo
> Como o match exige precisão 1 (§10.2), uma pergunta com 20 alternativas incompletas
> recusa respostas corretas. Apelidos e sobrenomes isolados são **obrigatórios**:
> `Lula` não casa com `Luiz Inácio Lula da Silva`.

### 14.2 Dívida de conteúdo conhecida

`validarConteudo` confere **forma**, nunca **verdade**. Estas alternativas existem no
seed e estão erradas — cada uma faz o jogador ganhar ponto por resposta errada (§2):

| Questão | Problema |
| --- | --- |
| `animal-mamifero` | `Galo`, `Pinguim` (aves); `Serpente`, `Jacaré`, `Tartaruga` (répteis) |
| `mes-em-ingles` | os 12 meses em português, numa pergunta que pede inglês |
| `civilizacao-antiga` | `Turcos`, `Judeus`, `Chineses`, `Indianos` — povos, não civilizações |
| `lei-historica` | `Lei Antônio`, `Lei Eloi`, `Lei de Ancine`, `Lei de Curriculum` |
| `cientista-fisico` | `Hendrik` (só o prenome) |
| `cientista-biologo` | `Fleming e Penicilina` (não é uma pessoa) |
| `figura-geometrica` | `Assoalhada` |
| `figura-de-linguagem` | `Metaplan`, `Meonímia` |
| `tipo-de-grafico` | `Gráfico de compounded` (linguagem misturada) |
| Grafia | `Uranio` (sem acento), `Tropause` |

> [!tip] Fragmentação de balde de raridade
> `cientista-biologo` tem **6 alternativas para um único Watson** (`Watson`,
> `Watson e Crick`, `J Watson`, `J. D. Watson`, `James Watson`, `James Dewey Watson`).
> A mesma pessoa pontua em seis potes conforme a grafia — o efeito colateral de adicionar
> cobertura sem critério.

### 14.3 Idempotência do seed

Documentos usam slug como id e usam `merge`. O que saiu do arquivo **continua no banco**
e continua sendo sorteado até você rodar com `--limpar`. Como apagar o documento do
pai não apaga subcoleções, o `--limpar` limpa `alternativas` e `questoes` antes de
remover o pai.

---

## 15. Comandos

```bash
npm run lint                # typecheck (tsc -b) — a única "lint" do projeto
npm run build               # tsc -b && vite build -> dist/
npm run dev                 # Vite em :6767 com a API como middleware
npm start                   # Express servindo dist/ + /api (exige dist/)
npm run preview             # o mesmo, com NODE_ENV=production

npm run seed                # grava conteúdo (recusa se validarConteudo falhar)
npm run seed -- --limpar    # e remove o que não existe mais no arquivo
npm run validar:conteudo    # confere o seed sem tocar no Firestore

npm run teste:texto         # word match puro, sem Firestore
npm run teste:e2e           # ciclo completo; PRECISA do servidor no ar

npm run script:dia          # fecha o dia anterior
npm run script:dia -- 2026-10-01
npm run cron                # processo dedicado só ao agendamento
npm run reset:dia           # zera respostas de hoje e sorteia de novo
npm run inspecionar         # panorama de leitura do Firestore
npm run importar            # importa disciplinas de outra coleção/JSON
```

> [!warning] Argumentos exigem `--`
> `npm run seed -- --limpar`. Sem o separador, o npm come o argumento.

> [!danger] `npm run teste:e2e` escreve no Firestore de verdade
> Cria jogadores `e2e_*` e executa `reset-dia.ts` via `execFileSync`. Precisa do
> servidor no ar **e** da credencial Admin local. Limpeza:
> ```bash
> npm run reset:dia -- --zerar-pontuacoes
> npm run reset:dia -- --apagar-jogadores e2e_
> ```

> [!tip] Por que `--apagar-jogadores` é opt-in
> O Firestore **não apaga subcoleções** junto com o documento do pai. Apagar
> `players/{id}` deixa as respostas órfãs em `players/{id}/respostas/...`, e elas
> reaparecem quando o mesmo nickname entra de novo — com um `409` de "já respondeu" que
> nunca ocorreu.

---

## 16. Operação e deploy

### 16.1 O agendamento já existe

`npm start` chama `iniciarCronDoScriptDiario()` (`server/index.ts`). **Não há cron do
Linux para configurar.** O agendamento usa `timezone: America/Sao_Paulo`, então é imune ao
fuso da máquina.

> [!danger] Nunca dois agendadores
> Pelo motivo de idempotência (§9.3): cron interno **e** crontab, ou pm2 em cluster
> (`-i max`), fecham o dia mais de uma vez e somam os pontos repetidamente.
> Escolha **um** supervisor de processo: pm2 **ou** systemd — nunca os dois.

### 16.2 Supervisão com pm2

```bash
pm2 start npm --name quizarena -- start
pm2 startup && pm2 save     # <- sem isso não volta sozinho no reboot
pm2 logs quizarena --lines 30
```

Logs que confirmam saúde:

```text
[cron] script diário agendado para 00h00 (America/Sao_Paulo).
[quiz-arena] site e API no ar em http://localhost:6767
[quiz-arena] ambiente: produção
[quiz-arena] quiz de YYYY-MM-DD com 7 questão(ões).
```

`quizarena-error.log` vazio. Se aparecer
`script diário desabilitado neste processo (CRON_HABILITADO=false)`, o ambiente está
errado.

### 16.3 Supervisão com systemd

```ini
[Unit]
Description=Quiz Arena
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<usuario>
WorkingDirectory=<caminho-do-app>
Environment=NODE_ENV=production
Environment=PORT=6767
Environment=CRON_HABILITADO=true
EnvironmentFile=<caminho>/.env
Environment=PATH=<caminho-absoluto-do-node>/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=<caminho-absoluto-do-node>/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> [!danger] `Environment=PATH` é obrigatório quando o Node vem do nvm
> O systemd não lê `.bashrc`. Sem o PATH explícito, o serviço não acha o `node` e
> morre com `203/EXEC`.
>
> `ExecStart` e `Restart` precisam estar em **linhas separadas** — se colarem
> (`npm startRestart=always`), o systemd tenta executar um binário com esse nome e dá
> `203/EXEC`.

### 16.4 nginx

O app serve `dist/` e `/api` na mesma porta. Se houver nginx na frente, ele serve o
estático e repassa a API:

```nginx
server {
    listen 443 ssl http2;
    server_name <dominio>;
    root <caminho-do-dist>;

    include <caminho>/ssl.conf;

    location /api/ {
        proxy_pass http://127.0.0.1:6767;   # SEM barra final
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
        limit_except GET HEAD { deny all; }
    }
}
```

> [!warning] Os três detalhes que quebram o deploy
> 1. **`proxy_pass` sem barra final** — o Express monta as rotas em `/api/auth`, então
>    `/api/auth/entrar` precisa chegar intacto.
> 2. **`limit_except GET HEAD`** — sem ele, um POST que caia no fallback do SPA
>    devolvia `405` em vez de chegar na API.
> 3. **CORS** — `cors()` está liberado (`server/app.ts:23`). Como front e API ficam no
>    mesmo domínio, restrinja à origem do site.

Diagnóstico de resposta:

| Resposta | Significado |
| --- | --- |
| `405` + `text/html` | nginx não tem `location /api/`; POST caiu no fallback do SPA |
| `502` + HTML | nada escutando no upstream, ou processo morreu |
| `401`/`422` + **JSON** | a API respondeu — deploy funcionando |

---

## 17. Mapa do código

```text
server/
├── app.ts                     createApiApp(): Express (usado em dev e prod)
├── index.ts                   servidor de produção: dist/ + /api + cron
├── config.ts                  env (zod), fuso, credenciais, paths
├── firebase.ts                singleton do Admin SDK
├── jobs/cron.ts               agendamento do Script Diário
├── lib/
│   ├── texto.ts               normalizar, tokenizar, casarPorWord, chaveDeNickname
│   ├── datas.ts               hojeISO, deslocarDia, rotuloData (fuso de Brasília)
│   ├── sessao.ts              JWT: gerar, verificar, carregarSessao, exigirSessao
│   └── http.ts                ErroHttp, rota(), corpo(), query(), tratadorDeErros
├── repositories/              ÚNICO lugar que toca o Firestore
│   ├── disciplinas.repo.ts    disciplinas, questoes, alternativas, pesos, sorteio
│   ├── players.repo.ts        jogadores, bcrypt, ranking, busca por nickname
│   ├── quiz.repo.ts           quiz_do_dia, temas
│   └── respostas.repo.ts      respostas do jogador, repontuação
├── routes/
│   ├── auth.routes.ts         /api/auth
│   ├── quiz.routes.ts         /api/quiz
│   └── admin.routes.ts        /api/admin
├── services/                  REGRA DE NEGÓCIO
│   ├── peso.service.ts        calcularPeso(), pesoProvisional()
│   ├── ranking.service.ts     ordenarRanking(), fecharRankingDoDia()
│   ├── sorteio.service.ts     sortearQuizDoDia(), garantirQuizDeHoje()
│   ├── respostas.service.ts   registrarResposta(), melhorAlternativa()
│   ├── auth.service.ts        entrarOuCriar(), sessaoAtual()
│   ├── quiz.service.ts        montarEstadoDaRodada(), pesquisarJogadores()
│   └── script-diario.service.ts   orquestra os 3 passos na ordem
└── scripts/                   seed, cron, rodar-script-diario, dados-do-seed

scripts/                       inspecionar, reset-dia, importar, testar-texto, testar-e2e,
                               validar-conteudo
```

---

## 18. Referências

- **Fluxograma original** — export do Obsidian na raiz do repositório. É a fonte da
  verdade do produto: o código inteiro foi escrito contra ele, e vários comentários
  citam "o fluxograma" transcrevendo as caixas literalmente. **Consulte antes** de
  mexer em regra de negócio, modelo de dados ou fluxo de tela.
- **`AGENTS.md`** — instruções operacionais para agentes: armadilhas do repositório,
  invariantes e convenções.
- **`README.md`** — visão geral, comandos e API.

> [!warning] O fluxograma não está versionado
> Ele não sai no `git ls-files`, então um clone novo não vem com ele. Peça o arquivo ou
> um export atualizado antes de assumir que está disponível.

---

## Apêndice — Glossário

| Termo | Significado |
| --- | --- |
| **Alternativa** | Forma de resposta aceita. Todas valem ponto; não há distrator |
| **Balde de raridade** | O conjunto de respostas que compartilham o mesmo `alternativaId`, e portanto o mesmo peso |
| **Peso** | Pontos de uma resposta aceito: `10` (comum) a `100` (rara) |
| **Precisão** | Fração das palavras da alternativa presentes na resposta; casar exige `1` |
| **Rodada** | O conjunto de 7 questões de um dia, idêntico para todos |
| **Script Diário** | Fechamento das 00h00: peso → ranking → sorteio |
| **Forma** | O texto exato que o jogador escreveu; é o que define a raridade |