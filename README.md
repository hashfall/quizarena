# Quiz Arena

Quiz diário de 7 questões com resposta por extenso. O jogador entra com
nickname e senha, responde uma questão por vez e compete no ranking global.

Front (React + Vite) e back (Express + Firebase Admin) vivem **no mesmo
projeto e sob o mesmo domínio**: um único site, uma única porta.

## Como rodar

```bash
npm install
npm run seed      # cria disciplinas, questões, alternativas e temas
npm run dev       # site + API em http://localhost:6767
```

O `npm run dev` sobe o Vite e, no mesmo processo, monta a API como middleware.
Não existe segundo servidor para subir.

Em produção:

```bash
npm run build     # gera dist/
npm start         # serve dist/ + /api na mesma porta
```

### Variáveis de ambiente

Copie `.env.example` para `.env`. Em produção, `JWT_SECRET` é obrigatório —
sem ele o processo não sobe, porque a sessão do jogador precisa sobreviver a
deploys. Os demais têm padrão razoável.

A credencial do Admin SDK é procurada em `GOOGLE_APPLICATION_CREDENTIALS` ou,
por padrão, em `projeto-fetec-firebase-adminsdk-fbsvc-c43f04a365.json` na raiz.
Esse arquivo está no `.gitignore` e **não deve ser versionado nem publicado**.

## Entrada de nickname e senha

Segue o fluxograma: o nickname é único e a senha é simples.

- Nickname novo → o jogador é criado com a senha informada.
- Nickname existente + senha correta → entra e recebe um token de sessão.
- Nickname existente + senha errada → recusado.

A senha nunca é gravada em texto puro: o Firestore recebe o hash bcrypt. A
única chave de um jogador no Firestore é o nickname normalizado, o que
garante a unicidade sem depender do Firestore Auth (nenhum e-mail é pedido ao
jogador).

## Modelo de dados

```text
disciplinas/{disciplinaId}
├── nome, descricao, ativa
└── questoes/{questaoId}
    ├── enunciado, categoria
    ├── selecionada            # true quando compõe o quiz do dia
    ├── ativa
    └── alternativas/{alternativaId}
        ├── texto, ordem       # todas são formas aceitas de resposta
        └── pontuacao/{yyyy-mm-dd}
            ├── peso           # peso por raridade no dia
            └── escolhas, totalRespostas

players/{nickname-normalizado}
├── nickname, iniciais, senhaHash
├── pontuacaoTotal            # acumulado, fechado pelo script diário
├── pontuacaoDoDia            # provisório, refeito a cada resposta
├── ranking
└── respostas/{yyyy-mm-dd}/itens/{questaoId}
    ├── resposta, respostaNormalizada
    ├── alternativaId, casou, pontos
    └── tempoDeResposta       # gravado, ainda sem efeito (TODO do fluxograma)

quiz_do_dia/{yyyy-mm-dd}      # as 7 questões, iguais para todo mundo
temas/{temaId}
```

## Como uma resposta vira pontuação

O documento de alternativas guarda **somente alternativas corretas** — não existe
distrator. Por isso as perguntas são abertas: "Qual é o nome de um animal
mamífero?" aceita cavalo, elefante, golfinho ou baleia, e todas valem ponto.

1. O jogador digita uma resposta curta.
2. O backend faz *word match* por palavra contra as alternativas da questão,
   ignorando acentos, caixa e pontuação (`server/lib/texto.ts`). Se casar com
   alguma, a resposta foi aceita; se não casar com nenhuma, vale zero.
3. A resposta aceita leva o peso-base provisório.
4. À meia-noite o peso real sai da **raridade**: quantos jogadores escreveram
   exatamente aquela forma.

Ou seja, responder o mesmo que todo mundo rende o piso (10 pts) e arriscar uma
resposta que ninguém mais deu rende o teto (100 pts).

**As alternativas aceitas nunca são enviadas ao navegador.** A API devolve apenas
`casou: boolean` e `pontos: number`.

## Script diário (00h00)

Roda às 00h00, por cron interno (`server/jobs/cron.ts`) ou por cron externo
chamando `POST /api/admin/script-diario`. A ordem respeita a dependência do
fluxograma — o ranking depende do peso, então o peso vem primeiro:

1. **Cálculo de peso das alternativas.** Compara as respostas de todos os
   jogadores do dia e grava o peso em `alternativas/{id}/pontuacao/{dia}`:
   `peso = PESO_MINIMO + (PESO_BASE - PESO_MINIMO) * (1 - escolhas/total)`.
   Ninguém escreveu igual → teto; todo mundo escreveu igual → piso. Em seguida
   reaplica o peso novo nas respostas já gravadas.
2. **Ranking.** Soma os pontos do dia ao acumulado de cada jogador, reordena e
   grava a posição em `players.ranking`.
3. **Sorteio.** Desmarca (`selecionada: false`) as questões anteriores e sorteia
   7 novas, uma por disciplina, sem repetir disciplina.

Para conferir sem esperar a meia-noite:

```bash
npm run script:dia                    # fecha o dia anterior
npm run script:dia -- 2026-10-01      # fecha 30/09 simulando a virada
```

## API

| Método | Rota | O que faz |
| --- | --- | --- |
| `POST` | `/api/auth/entrar` | Entra ou cria o jogador; devolve `token` |
| `GET` | `/api/auth/eu` | Revalida a sessão do token guardado |
| `GET` | `/api/quiz/rodada` | Estado completo: tema, ranking, questões da vez |
| `POST` | `/api/quiz/respostas` | Salva a resposta e devolve o resultado do match |
| `GET` | `/api/quiz/ranking?q=` | Ranking global, filtrado por nickname |
| `POST` | `/api/admin/script-diario` | Roda o Script Diário (`{"hoje":"AAAA-MM-DD"}` opcional) |
| `GET` | `/api/admin/saude` | Diagnóstico do servidor |

Todas exigem `Authorization: Bearer <token>`, exceto `/auth/entrar` e
`/admin/saude`.

## Segurança

- O acesso ao Firestore é **exclusivo do backend**. As `firebaseConfig` do
  cliente não são usadas: elas não são necessárias, porque nenhum dado do jogo é
  lido direto do navegador. `firestore.rules` bloqueia tudo, para que ninguém
  abra o console do Firebase e veja a lista de alternativas aceitas.
- Senhas com hash bcrypt; sessão em JWT assinado; limite de 72 caracteres no
  tamanho da senha (compatível com bcrypt).
- Uma resposta por questão por dia (`409` ao repetir).
- `cors()` habilitado porque, no deploy, a API pode acabar em domínio
  diferente do front. Se os dois ficarem no mesmo domínio — que é o padrão
  daqui —, restrinja para a origem do site.

## Conteúdo

`npm run seed` grava as disciplinas do arquivo `server/scripts/dados-do-seed.ts`:
Artes, Biologia, Física, História, Inglês, Matemática, Português e Química, com 5
questões cada e 20 ou mais formas aceitas de resposta por questão (mais de mil
alternativas no total).

`npm run validar:conteudo` confere o arquivo antes de qualquer gravação, e o
próprio seed se recusa a gravar se algo estiver errado. As regras:

- as 8 disciplinas, com pelo menos 5 questões cada;
- pelo menos 20 alternativas por questão, todas válidas;
- nenhuma alternativa repetida — depois de normalizar, duplicar é inútil, porque
  o *word match* acharia sempre a primeira;
- nada de caractere estranho, letra de outro alfabeto ou texto duplicado.

`--limpar` remove também o que ficou no banco e não existe mais no arquivo.

## Testes e utilitários

```bash
npm run validar:conteudo  # confere o seed sem gravar
npm run teste:texto        # word match, acentos, pontuação (não toca no Firestore)
npm run teste:e2e          # ciclo completo contra o servidor em execução
npm run reset:dia          # zera as respostas de hoje e sorteia de novo
```

`teste:e2e` exige o servidor rodando e grava jogadores `e2e_*` no projeto real.
Para limpar:

```bash
npm run reset:dia -- --zerar-pontuacoes
npm run reset:dia -- --apagar-jogadores e2e_
```

`--apagar-jogadores <prefixo>` é opt-in de propósito: o Firestore não apaga
subcoleções junto com o documento do pai, então remover `players/{id}` deixa as
respostas órfãs em `players/{id}/respostas/...`. Elas reaparecem quando alguém
com o mesmo nickname entra de novo, e o jogador toma um "já respondeu" que nunca
ocorreu.

## Índices do Firestore

Nenhum índice composto é necessário: o backend evita consultas em *collection
group* justamente para não depender deles.

## Onde o `firebaseConfig` do cliente é usado

Não é. Todo o tráfego passa pela API, então o SDK web do Firebase não é
instalado nem configurado no front — só o Admin SDK, no servidor. Se um dia
quiser adicionar Analytics, é o único uso que faria sentido com aquele
`firebaseConfig`, e ele pode ser adicionado depois sem afetar o backend.