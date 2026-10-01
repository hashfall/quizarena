import { casarPorWord, higienizarResposta, normalizar, palavrasSignificativas } from '../server/lib/texto'

let falhas = 0
let total = 0

function igual(nome: string, obtido: unknown, esperado: unknown) {
  total += 1
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!passou) {
    falhas += 1
    console.log(`  FALHOU ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`)
  }
}

function casa(nome: string, resposta: string, alternativa: string) {
  total += 1
  const { casou } = casarPorWord(resposta, alternativa)
  if (!casou) {
    falhas += 1
    console.log(`  FALHOU ${nome}: "${resposta}" deveria casar com "${alternativa}"`)
  }
}

function naoCasa(nome: string, resposta: string, alternativa: string) {
  total += 1
  const { casou } = casarPorWord(resposta, alternativa)
  if (casou) {
    falhas += 1
    console.log(`  FALHOU ${nome}: "${resposta}" NÃO deveria casar com "${alternativa}"`)
  }
}

console.log('normalizar')
igual('tira acento', normalizar('Jogador da Silva Ápex'), 'jogador da silva apex')
igual('tira pontuação', normalizar('H2O!'), 'h2o')
igual('normaliza Ç e ã', normalizar('Coração'), 'coracao')
igual('colapsa espaços', normalizar('  o   rio  '), 'o rio')

console.log('palavrasSignificativas')
igual('ignora vazias', palavrasSignificativas('o jogo da vida'), ['jogo', 'vida'])
igual('mantém todas se só há vazias', palavrasSignificativas('O'), ['o'])

console.log('casarPorWord — deve casar')
casa('exato', 'PlayStation 2', 'PlayStation 2')
casa('caixa', 'playstation 2', 'PlayStation 2')
casa('acentos', 'Pokémon Vermelho', 'pokemon vermelho')
casa('resposta tem mais texto', 'o playstation 2 da sony', 'PlayStation 2')
casa('numérico', '1991', '1991')
casa('data por extenso', '15 de novembro de 1889', '15 de novembro de 1889')
casa('com pontuação', 'H2O!', 'H2O')
casa('ordem inversa', '1889 de novembro 15', '15 de novembro de 1889')
casa('dois nomes', 'Alejandro González Iñárritu', 'alejandro gonzalez inarritu')
casa('palavra com sufixo', 'Hashima, Japão', 'Hashima')

console.log('casarPorWord — não deve casar')
naoCasa('nome diferente', 'Xbox 360', 'PlayStation 2')
naoCasa('resposta vazia', '   ', 'PlayStation 2')
naoCasa('palavra parcial', 'Sonic', 'Sonic Mania')
naoCasa('ano errado', '1992', '1991')
naoCasa('grafia errada', 'Hashina', 'Hashima')

console.log('higienizarResposta')
igual('corta espaços', higienizarResposta('  Rio   Una  '), 'Rio Una')
igual('limita 120', higienizarResposta('x'.repeat(200)).length, 120)

console.log(falhas === 0 ? `\n${total} verificações passaram.` : `\n${falhas} de ${total} falharam.`)
process.exit(falhas === 0 ? 0 : 1)