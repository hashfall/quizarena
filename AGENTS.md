# AGENTS.md — Quiz Arena

## Obrigatório: consulte `fluxograma.png` antes de mexer

`fluxograma.png` (na raiz) é a **fonte da verdade do produto**. O código inteiro foi
escrito contra ele — boa parte dos comentários em `server/` cita "o fluxograma" e
transcreve as caixas literalmente.

Abra a imagem (`read` numa imagem devolve o attachment) **antes** de implementar,
revisar ou mexer em qualquer regra de negócio, modelo de dados, fluxo de tela,
rota de API ou regra do Script Diário. Terminar uma tarefa sem ter aberto a imagem
não é aceite.

Diagrama em três zonas (export do Obsidian, setas = dependência):

| Zona | Caixa | Onde está no código |
| --- | --- | --- |
| Firebase | Disciplinas | `disciplinas/{id}` |
| | Questoes (bool `selecionada`) | `disciplinas/{id}/questoes/{id}` |
| | Alternativas — **só corretas** | `.../questoes/{id}/alternativas/{slug}` |
| | Pontuação (peso por raridade) | `.../alternativas/{id}/pontuacao/{yyyy-mm-dd}` |
| | Ranking (atualizado ao fim do dia, cumulativo) | `players.ranking`, `players.pontuacaoTotal` |
| | Nickname (único no Firebase) | chave = `chaveDeNickname(nickname)` |
| | Password (bcrypt) | `players.senhaHash` |
| | `respostas` → `id_questao` → `tempo_de_resposta` | ⚠️ bloco vermelho **"TODO: ignorar por enquanto"** |
| Frontend Vite | Entrada de Nickname e Senha | `src/pages/LoginPage.tsx`, `POST /api/auth/entrar` |
| | Exibir uma questão por vez + 7 questões do dia | `GET /api/quiz/rodada`, `QuestionCard` |
| | Ranking global na lateral + busca de nickname | `RankingSidebar`, `GET /api/quiz/ranking?q=` |
| Backend Vite | API endpoint | `server/app.ts` |
| | Salvar respostas | `POST /api/quiz/respostas` |
| | Buscar questões do dia | `GET /api/quiz/rodada` |
| | Pesquisar nickname | `GET /api/quiz/ranking?q=` |
| | Script Diário 00h00 (cron) | `POST /api/admin/script-diario` |
| | 1. Cálculo de Peso das alternativas | `server/services/peso.service.ts` |
| | 2. Ranking (depende do peso) | `server/services/ranking.service.ts` |
| | 3. Sorteio de 7, sem repetir disciplina | `server/services/sorteio.service.ts` |

Notas que só o desenho deixa claras:

- A seta do Script Diário é **sequência obrigatória** (peso → ranking → sorteio), não
  lista de tarefas paralelas.
- `tempo_de_resposta` está explicitamente fora do escopo, junto com `respostas` e
  `id_questao`. O backend grava os campos para não precisar de migração depois, mas
  **não pontua** por tempo. Não "complete" essa feature.
- "Ranking: cálculo do ranking dos players **com base no peso das alternativas**" — é
  por isso que o peso tem de vir antes no ciclo.
- O desenho descreve 7 questões fixas; no código é `TOTAL_QUESTOES_DIA` (default 7).

Se a imagem contradizer o código, o código está errado — ou o desenho mudou e alguém
precisa avisar. Não resolva o conflito no silêncio.

## Comandos

Não existe runner de teste nem ESLint/Prettier. `npm run lint` **é** o typecheck
(`tsc -b` cobre `src`, `vite.config.ts`, `server` e `scripts`).

```bash
npm run lint                  # typecheck completo (faixa a rodar antes de commitar)
npm run build                 # tsc -b && vite build -> dist/
npm run dev                   # Vite em :6767 com a API como middleware (um processo só)
npm start                     # tsx server/index.ts; serve dist/ + /api. Aborta se dist/ faltar
npm run importar -- --simular   # plano de conteúdo, sem gravar nada
npm run teste:texto           # word match; sem Firestore
npm run teste:e2e             # precisa do servidor no ar E credencial Admin local
npm run script:dia -- 2026-10-01   # fecha o dia anterior simulando a virada
npm run inspecionar           # panorama de leitura do Firestore
```

Argumentos exigem `--`: `npm run importar -- --aplicar`, `npm run reset:dia -- --zerar-pontuacoes`.

Não existe segundo servidor: `createApiApp()` (`server/app.ts:19`) é montado como
middleware do Vite em `vite.config.ts` e dentro de `server/index.ts`, que também
serve `dist/`. Um site, uma porta.

## Armadilhas do repositório

- **A porta tem duas fontes independentes, e elas precisam concordar.** Em dev quem
  escuta é o Vite (`server.port` em `vite.config.ts`); em produção quem escuta é o
  Express (`config.porta`, de `PORT`, default em `server/config.ts:19`). O `dev` script
  NÃO pode passar `--port`, senão a flag da CLI sobrescreve o `vite.config.ts` e os dois
  divergem silenciosamente. Vale 6767 nos dois lados. Divergência aqui aparece só como
  502 no nginx, nunca como erro de boot.
- **`fluxograma.png` não está no git.** Não sai no `git ls-files`, então um clone novo
  não vem com ele e a regra acima fica impossível de cumprir. Peça o arquivo (ou um
  export novo) antes de assumir que está lá.
- **`dist/` é versionado.** As linhas `#dist/` no `.gitignore` estão comentadas, e
  `dist/assets/index-*.js|css` tem hash no nome. `npm run build` deixa a árvore suja
  (arquivo novo + arquivo antigo deletado). Só commite `dist/` se for essa a intenção.
- **A credencial do Admin SDK está versionada.** `projeto-fetec-firebase-adminsdk-*.json`
  está no `git ls-files` porque os padrões de secret do `.gitignore` também estão
  comentados. Não confie no `.gitignore` para proteger esse arquivo.
- **`package.json` declara `packageManager: pnpm`, mas o lockfile é `package-lock.json`**
  e README/scripts usam npm. Use npm.
- **`.env.example` não existe**, apesar de o README mandar copiá-lo. `.env` também não
  está no repo; tudo funciona sem ele em dev (ver `server/config.ts`).
- **`quiz_do_dia/{dia}` é uma foto do conteúdo no momento do sorteio.** O doc guarda
  `enunciado`, `categoria` e `disciplinaNome` copiados, não referências. Se o conteúdo
  for trocado depois (import com `--apagar-minhas`, apagar disciplina), o doc do dia
  continua apontando para o que não existe mais — e a invariável 9 impede o refazer
  automático. Sumiu questão do banco depois do sorteio? Apague o `quiz_do_dia/{dia}`
  e rode o sorteio de novo; não é bug do sorteio.
- **`server/config.ts` faz `variaveis.parse(process.env)` no import.** Env inválido
  estoura no import do módulo, não na chamada da função. `JWT_SECRET` só é obrigatório
  com `NODE_ENV=production`; sem ele o dev usa um segredo efêmero (login reinicia a cada boot).
- **`POST /api/admin/script-diario` fica sem autenticação** enquanto `CRON_SEGREDO` não
  estiver definido (aí exige header `x-cron-segredo`). `GET /api/admin/saude` é sempre aberta.

## Arquitetura

Camadas fixas, uma direção só: `routes` → `services` → `repositories` → Firestore.
Só `server/repositories/*` chama `obterFirestore()`.

- `server/config.ts` — env validado com zod, fuso, credenciais, paths.
- `server/firebase.ts` — Admin SDK singleton por processo.
- `server/lib/` — `texto.ts` (normalização + word match), `datas.ts` (datas), `sessao.ts` (JWT), `http.ts` (`ErroHttp`, `rota()`, handler de erro).
- `server/services/` — regras de negócio (`peso`, `ranking`, `sorteio`, `respostas`, `auth`, `quiz`, `script-diario`).
- `src/` — SPA React. `src/lib/api.ts` é o único cliente HTTP; token JWT em `localStorage` (`quiz-arena:token`), sessão expirada via evento `quiz-arena:sessao-expirada`.
- `src/types/quiz.ts` espelha 1:1 o payload da API — mudar um lado exige mudar o outro.

**Firestore é exclusivo do backend.** O SDK web do Firebase não está instalado no front
e não deve ser: `firestore.rules` bloqueia tudo para o jogador não abrir o console e ver
as alternativas aceitas. Em especial, a API só devolve `casou: boolean` e `pontos: number` —
nunca `alternativaTexto`. Não quebrar isso.

**Nenhum índice composto por design.** Os repositórios evitam *collection group* de propósito
(`listarRespostasDoDiaDeTodos` recebe `playerIds`, `desmarcarQuestaoSelecionadas` recebe
`disciplinaIds`). Ao adicionar consulta, mantenha esse padrão ou você vai precisar de índice.
Batches do Firestore são fatiados em 400 (limite da API: 500).

**Datas são de Brasília, não da máquina.** Use sempre `hojeISO()`/`deslocarDia()` de
`server/lib/datas.ts` (`FUSO_HORARIO`). Cron às 00h00 usa o mesmo fuso.

## Invariantes do domínio

Quebrar qualquer um destes muda o jogo, não só o código:

1. **A subcoleção `alternativas` guarda só alternativas corretas.** Não existe distrator.
   `casou: true` significa "escrevi uma das formas aceitas", não "acertei a resposta única".
   Consequência dura: **toda alternativa é uma resposta que o sistema dá como certa.** Uma
   alternativa que não é resposta correta da pergunta faz o jogador ganhar ponto errado.
2. **A cobertura das alternativas é o que define se o jogo é justo.** O match exige
   `precisao === 1` — todas as palavras da alternativa presentes na resposta, mas o jogador
   pode escrever *mais* que a alternativa, nunca *menos*. Ou seja, **apelido, apelido
   abreviado e sobrenome precisam existir como alternativa própria** ("Lula" não casa com
   "Luiz Inácio Lula da Silva": precisão 0.25). Não afrouxe o matcher para resolver lacuna
   de conteúdo: a alternativa casada é o balde de raridade, então match parcial faz o peso
   depender do desempate arbitrário e premia resposta curta. `melhorAlternativa` desempata por
   especificidade, o que permite ter forma curta e longa lado a lado sem ambiguidade.
3. **Pontuação em duas fases.** No envio da resposta vale `pesoProvisional` (peso base, 100).
   O peso real sai da raridade no fechamento:
   `peso = PESO_MINIMO + (PESO_BASE - PESO_MINIMO) * (1 - escolhas/total)`.
4. **A ordem do Script Diário é dependência, não preferência:** peso → ranking → sorteio.
   `rodarScriptDiario(hoje)` fecha `hoje - 1`. Nunca reordene.
5. **Uma resposta por questão por dia** (`409`). O item `tempoDeResposta` é gravado mas
   deliberadamente não pontua (TODO do fluxograma).
6. **Apagar `players/{id}` deixa as respostas órfãs** — o Firestore não apaga subcoleções.
   Elas reaparecem quando o mesmo nickname entra de novo, gerando um 409 que "não aconteceu".
   Daí `--apagar-jogadores` ser opt-in em `scripts/reset-dia.ts`.
7. **Uma resposta por questão precisa ter alternativa**: o sorteio descarta questões sem
   alternativa (`sorteio.service.ts`) e o importador descarta questão sem alternativa na
   origem (`scripts/importar-disciplinas.ts`).
8. **O id do documento de alternativa deriva do texto normalizado** (`chaveDe` em
   `scripts/importar-disciplinas.ts`). Duas alternativas que só diferem em acento/caixa
   colidem — o importador desambigua o slug e avisa no plano.
9. `sortearQuizDoDia` é idempotente: se `quiz_do_dia/{dia}` já tem questões, não sorteia de novo
   (garante que todos vejam o mesmo quiz).
10. **`destaque` é parte do enunciado, não enfeite.** Conteúdo grava a pergunta partida entre
    `enunciado` (até o ponto) e `destaque` (o trecho que fecha a frase). Ele atravessa
    `QuestaoDoDia` → payload → `<span>` do `.question-title` (que existe no `index.css`
    justamente para pintá-lo de ciano). Cortar o `destaque` em qualquer elo mostra a pergunta
    pela metade — foi o que aconteceu com o quiz de 2026-10-01.

### Dívida de conteúdo conhecida (não corrigida)

Nenhuma ferramenta confere verdade de conteúdo — o importador normaliza e avisa, mas não sabe
se a alternativa é mesmo uma resposta correta da pergunta. Estas alternativas **estão no
Firestore** e estão erradas: cada uma faz o jogador ganhar ponto por resposta errada (ver
invariante 1). Conferido em 2026-10-01:

- `biologia/animal-mamifero`: `Galo`, `Pinguim` (aves), `Serpente`, `Jacaré`, `Tartaruga` (répteis).
- `ingles/mes-em-ingles`: os 12 meses em português (`Janeiro`…`Dezembro`).
- `historia/civilizacao-antiga`: `Turcos`, `Judeus`, `Chineses`, `Indianos` (povos, não civilizações).
- `historia/lei-historica`: `Lei Antônio`, `Lei Eloi`, `Lei de Ancine`, `Lei de Curriculum`.
- `fisica/cientista-fisico`: `Hendrik` (só o prenome).
- `biologia/cientista-biologo`: `Fleming e Penicilina`.
- `matematica/figura-geometrica`: `Assoalhada`. `portugues/figura-de-linguagem`: `Metaplan`, `Meonímia`.
- `matematica/tipo-de-grafico`: `Gráfico de compounded`.
- Grafia: `Uranio` → Urânio (`quimica/elemento-quimico`).
- `biologia/cientista-biologo` fragmenta um único Watson em **6 baldes de raridade**
  (`Watson`, `Watson e Crick`, `J Watson`, `J. D. Watson`, `James Watson`, `James Dewey Watson`):
  a mesma pessoa pontua em seis potes diferentes conforme a grafia.

Nas 4 disciplinas criadas em 2026-10-01 (geografia, educação física, filosofia, sociologia) não
há caso egregious, mas há itens de fronteira que valem revisão humana:

- `geografia/rio-brasil`: `Rio Grande` e `Rio Uruguay` existem em mais de um estado — o nome
  sozinho é ambíguo sobre qual.
- `geografia/bioma-brasil`: as subdivisões (`Caatinga xerófita`, `Cerrado lato sensu`,
  `Complexo do Pantanal`) dependem da classificação adotada; um professor pode chamar outra.
- `educacao-fisica/exercicio-condicionamento`: `Mobilidade` é categoria genérica, não exercício.
- `filosofia/corrente-filosofica`: `Panteísmo` é doutrina, e `Aparência`/`Fenômeno` (em
  `conceito-filosofico`) são categorias genéricas em vez de conceito nomeado.
- `sociologia/movimento-social`: `Colonato` e `Cangaço` são manifestações regionais, não
  organizações com nome.
- `sociologia/metodo-pesquisa`: `Jogo de linguagem` é conceito de Wittgenstein usado como técnica.


## Convenções

- Código, comentários e strings de UI em **pt-BR**; identificadores em português sem acento
  (`sortearQuizDoDia`, `casarPorWord`, `pontuacaoDoDia`). Logs antigos em português, alguns
  `console.warn` novos em inglês — não conte com consistência.
- Sem formatter: aspas simples, sem ponto e vírgula, indentação de 2 espaços.
- Front mistura utilitários Tailwind no JSX com ~945 linhas de classes estruturais em
  `src/index.css` (`.app-shell`, `.panel`, `.question-shell`, `.primary-button`...).
  Primitiva de layout nova tende a ir para o `index.css`, não para `@layer components`.
- **Não há conteúdo no repositório.** Disciplina, questão e alternativa vivem só no
  Firestore; o código não tem lista de conteúdo e nenhum comando cria dado inicial.
  `npm run importar -- --simular` é a forma de mexer em conteúdo — e ele só grava com
  `--aplicar`. Não reintroduza um seed: ele sobrescreve produção.
- `npm run teste:e2e` **escreve no projeto Firestore real** com jogadores `e2e_*` e faz
  `execFileSync('npx', ['tsx', 'scripts/reset-dia.ts', ...])`. Limpeza:
  `npm run reset:dia -- --zerar-pontuacoes` e `--apagar-jogadores e2e_`.
