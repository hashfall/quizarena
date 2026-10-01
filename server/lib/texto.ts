/**
 * Normalização e *word matching* das respostas.
 *
 * O jogador digita a resposta por extenso (fluxograma: "as respostas são sempre
 * por extenso") e o backend precisa descobrir qual `alternativa` da questão ele
 * acertou. A comparação é feita por palavra, ignorando acentos, caixa e
 * pontuação.
 */

const MARCA_COMBINANTE = /[\u0300-\u036f]/g
const NAO_ALFANUMERICO = /[^\p{L}\p{N}]+/gu

/** Palavras ignoradas na comparação para evitar falsos positivos. */
const PALAVRAS_VAZIAS = new Set([
  'a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'e', 'um', 'uma', 'uns', 'umas', 'para', 'com', 'que', 'ao', 'aos', 'à', 'às', 'pela',
  'pelo', 'the', 'of',
])

/** Remove acentos, pontuação e excessos de espaço; devolve minúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(MARCA_COMBINANTE, '')
    .toLowerCase()
    .replace(NAO_ALFANUMERICO, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quebra o texto normalizado em palavras relevantes. */
export function tokenizar(texto: string): string[] {
  const normalizado = normalizar(texto)
  if (!normalizado) return []
  return normalizado.split(' ').filter((palavra) => palavra.length > 0)
}

/** Palavras da alternativa que realmente carregam significado. */
export function palavrasSignificativas(texto: string): string[] {
  const tokens = tokenizar(texto)
  const relevantes = tokens.filter((palavra) => !PALAVRAS_VAZIAS.has(palavra))
  // Se a alternativa for composta só de palavras vazias ("O Jogo"), usa tudo.
  return relevantes.length > 0 ? relevantes : tokens
}

export type ResultadoMatch = {
  casou: boolean
  /** 0..1 — fração das palavras da alternativa encontradas na resposta. */
  precisao: number
}

/**
 * Verifica se `respostaDoJogador` contém a `alternativa`.
 *
 * Funciona nos dois sentidos: a alternativa precisa aparecer inteira dentro da
 * resposta ("the legend of zelda" para "The Legend of Zelda") e também quando o
 * jogador escreve mais texto ("acho que foi mario Kart 8 deluxe").
 */
export function casarPorWord(respostaDoJogador: string, alternativa: string): ResultadoMatch {
  const alvo = palavrasSignificativas(alternativa)
  if (alvo.length === 0) return { casou: false, precisao: 0 }

  const respondidas = new Set(tokenizar(respostaDoJogador))
  if (respondidas.size === 0) return { casou: false, precisao: 0 }

  const encontradas = alvo.filter((palavra) => respondidas.has(palavra))
  const precisao = encontradas.length / alvo.length

  return { casou: precisao === 1, precisao }
}

/** Limpa e valida a resposta enviada pelo jogador. */
export function higienizarResposta(texto: string): string {
  return texto
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** Remove espaços e acentos de um nickname para virar chave de documento. */
export function chaveDeNickname(nickname: string): string {
  const normalizado = normalizar(nickname).replace(/\s+/g, '_')
  return normalizado.replace(/[^a-z0-9_.-]/g, '')
}

/** Iniciais exibidas no ranking e no avatar. */
export function iniciaisDoNickname(nickname: string): string {
  const partes = nickname.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return (partes[0]![0] ?? '?').toUpperCase()
  return `${partes[0]![0] ?? ''}${partes[partes.length - 1]![0] ?? ''}`.toUpperCase()
}