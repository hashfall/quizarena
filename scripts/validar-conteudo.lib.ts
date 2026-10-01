import { DISCIPLINAS_SEED } from '../server/scripts/dados-do-seed'
import { normalizar } from '../server/lib/texto'

/**
 * Regras de qualidade do conteúdo do seed, usadas tanto pelo comando
 * `npm run validar:conteudo` quanto pelo próprio seed, que se recusa a gravar
 * conteúdo inconsistente.
 */

export const DISCIPLINAS_ESPERADAS = [
  'Artes',
  'Biologia',
  'Física',
  'História',
  'Inglês',
  'Matemática',
  'Português',
  'Química',
]

export const MIN_QUESTOES = 5
export const MIN_ALTERNATIVAS = 20

/** Letras, números, pontuação usual, hífen e barra. */
const CARACTERE_ESPERADO = /^[\p{L}\p{N}\s.,!?:;'"()\-–—/*+&%@#|<>À-ú]*$/u
const OUTRO_ALFABETO = /[а-яА-Я一-鿿぀-ヿ가-힯]/

export type Problema = string

/** Identificador estável da alternativa, para o slug do documento. */
export function chaveDeAlternativa(texto: string): string {
  return `${normalizar(texto).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
}

export function conferirTexto(rotulo: string, texto: string, problemas: Problema[]): void {
  for (const caractere of texto) {
    if (!CARACTERE_ESPERADO.test(caractere)) {
      problemas.push(`${rotulo}: caractere inesperado "${caractere}" em "${texto}"`)
      return
    }
  }
  if (OUTRO_ALFABETO.test(texto)) problemas.push(`${rotulo}: letra de outro alfabeto em "${texto}"`)
  if (texto !== texto.trim()) problemas.push(`${rotulo}: espaço nas pontas em "${texto}"`)
  if (/\s{2,}/.test(texto)) problemas.push(`${rotulo}: espaço duplicado em "${texto}"`)
}

export function validarConteudo(): Problema[] {
  const problemas: Problema[] = []

  const nomes = DISCIPLINAS_SEED.map((d) => d.nome)
  for (const esperada of DISCIPLINAS_ESPERADAS) {
    if (!nomes.includes(esperada)) problemas.push(`falta a disciplina "${esperada}"`)
  }
  for (const nome of nomes) {
    if (!DISCIPLINAS_ESPERADAS.includes(nome)) problemas.push(`disciplina inesperada "${nome}"`)
  }

  const slugs = new Set<string>()

  for (const disciplina of DISCIPLINAS_SEED) {
    conferirTexto(`disciplina ${disciplina.slug}`, disciplina.nome, problemas)
    conferirTexto(`disciplina ${disciplina.slug}`, disciplina.descricao, problemas)

    if (disciplina.questoes.length < MIN_QUESTOES) {
      problemas.push(
        `${disciplina.nome}: apenas ${disciplina.questoes.length} questões (mínimo ${MIN_QUESTOES})`,
      )
    }

    for (const questao of disciplina.questoes) {
      const rotulo = `${disciplina.nome}/${questao.slug}`

      if (slugs.has(questao.slug)) problemas.push(`${rotulo}: slug repetido`)
      slugs.add(questao.slug)

      conferirTexto(rotulo, questao.slug, problemas)
      conferirTexto(rotulo, questao.enunciado, problemas)
      conferirTexto(rotulo, questao.categoria, problemas)

      if (questao.alternativas.length < MIN_ALTERNATIVAS) {
        problemas.push(
          `${rotulo}: apenas ${questao.alternativas.length} alternativas (mínimo ${MIN_ALTERNATIVAS})`,
        )
      }

      // O word match normaliza antes de comparar, então duas alternativas com a
      // mesma forma normalizada nunca valeriam a mesma coisa.
      const vistas = new Map<string, string>()
      const slugsAlternativas = new Set<string>()

      for (const alternativa of questao.alternativas) {
        conferirTexto(rotulo, alternativa, problemas)

        const forma = normalizar(alternativa)
        if (!forma) {
          problemas.push(`${rotulo}: alternativa vazia`)
          continue
        }

        const anterior = vistas.get(forma)
        if (anterior !== undefined) {
          problemas.push(
            `${rotulo}: "${alternativa}" repete "${anterior}" (mesma forma depois de normalizar)`,
          )
        }
        vistas.set(forma, alternativa)

        const slug = chaveDeAlternativa(alternativa)
        if (slugsAlternativas.has(slug)) {
          problemas.push(`${rotulo}: "${alternativa}" gera o slug repetido "${slug}"`)
        }
        slugsAlternativas.add(slug)
      }
    }
  }

  return problemas
}

export function resumoDoConteudo(): {
  disciplinas: number
  questoes: number
  alternativas: number
} {
  return {
    disciplinas: DISCIPLINAS_SEED.length,
    questoes: DISCIPLINAS_SEED.reduce((s, d) => s + d.questoes.length, 0),
    alternativas: DISCIPLINAS_SEED.reduce(
      (s, d) => s + d.questoes.reduce((t, q) => t + q.alternativas.length, 0),
      0,
    ),
  }
}
