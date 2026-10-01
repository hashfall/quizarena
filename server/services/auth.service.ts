import {
  conferirSenha,
  criarPlayer,
  gerarHashSenha,
  obterPlayer,
  obterPlayerPorNickname,
  registrarAcesso,
} from '../repositories/players.repo'
import { erroNaoAutenticado, erroValidacao } from '../lib/http'
import { gerarTokenSessao } from '../lib/sessao'
import { chaveDeNickname, normalizar } from '../lib/texto'

/**
 * Fluxograma, bloco Player:
 *
 * - Nickname: "único no firebase, caso o nickname entrado pelo player já exista,
 *   a pontuação dele desde dia deverá ser somada no nickname existente, caso o
 *   nickname ainda não exista no firebase, ele será criado".
 * - Password: "simples, caso o nickname já exista, comparar o password para ver
 *   se está correto, caso o nickname não exista, esta será o novo password do
 *   novo nickname".
 *
 * A senha nunca é guardada em texto puro: o Firestore recebe apenas o hash
 * bcrypt.
 */

export type EntradaLogin = {
  nickname: string
  senha: string
}

export type SaidaLogin = {
  token: string
  jogador: {
    id: string
    nickname: string
    iniciais: string
    score: number
    rank: number
    pontosDoDia: number
    respondidas: number
  }
  /** `true` quando o nickname ainda não existia e acabou de ser criado. */
  criado: boolean
}

const NICKNAME_MINIMO = 2
const NICKNAME_MAXIMO = 20
const SENHA_MINIMA = 4

export function validarCredenciais(nickname: string, senha: string): void {
  const limpo = nickname.trim()
  const tamanho = normalizar(limpo).replace(/\s+/g, ' ').length

  if (tamanho < NICKNAME_MINIMO || tamanho > NICKNAME_MAXIMO) {
    throw erroValidacao(
      `O nickname precisa ter entre ${NICKNAME_MINIMO} e ${NICKNAME_MAXIMO} caracteres.`,
    )
  }

  if (!chaveDeNickname(limpo)) {
    throw erroValidacao('Nickname inválido: use letras, números, ponto, hífen ou underscore.')
  }

  if (senha.length < SENHA_MINIMA) {
    throw erroValidacao(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`)
  }
}

/**
 * Entrada do jogador. Nickname existente + senha correta entra; nickname
 * existente + senha errada é recusado; nickname novo é criado com a senha
 * informada.
 */
export async function entrarOuCriar({ nickname, senha }: EntradaLogin): Promise<SaidaLogin> {
  const limpo = nickname.trim()
  validarCredenciais(limpo, senha)

  const existente = await obterPlayerPorNickname(limpo)

  if (existente) {
    const senhaConfere = await conferirSenha(senha, existente.senhaHash)
    if (!senhaConfere) {
      throw erroNaoAutenticado('Senha incorreta para este nickname.')
    }

    await registrarAcesso(existente.id)

    return {
      token: gerarTokenSessao({ playerId: existente.id, nickname: existente.nickname }),
      jogador: {
        id: existente.id,
        nickname: existente.nickname,
        iniciais: existente.iniciais,
        score: existente.pontuacaoTotal + existente.pontuacaoDoDia,
        rank: existente.ranking,
        pontosDoDia: existente.pontuacaoDoDia,
        respondidas: existente.respostasHoje,
      },
      criado: false,
    }
  }

  const senhaHash = await gerarHashSenha(senha)
  const criado = await criarPlayer(limpo, senhaHash)

  return {
    token: gerarTokenSessao({ playerId: criado.id, nickname: criado.nickname }),
    jogador: {
      id: criado.id,
      nickname: criado.nickname,
      iniciais: criado.iniciais,
      score: 0,
      rank: 0,
      pontosDoDia: 0,
      respondidas: 0,
    },
    criado: true,
  }
}

/** Revalida o token devolvendo o estado atual do jogador. */
export async function sessaoAtual(playerId: string): Promise<SaidaLogin['jogador'] | null> {
  // O id do documento é a chave normalizada do nickname, então a mesma busca serve.
  const player = await obterPlayer(playerId)
  if (!player) return null

  return {
    id: player.id,
    nickname: player.nickname,
    iniciais: player.iniciais,
    score: player.pontuacaoTotal + player.pontuacaoDoDia,
    rank: player.ranking,
    pontosDoDia: player.pontuacaoDoDia,
    respondidas: player.respostasHoje,
  }
}