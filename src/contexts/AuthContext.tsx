import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api, ErroApi, EVENTO_SESSAO_EXPIRADA, gravarToken, lerToken, limparToken } from '../lib/api'
import type { CurrentUser } from '../types/quiz'

type EstadoEntrada = {
  jogador: CurrentUser | null
  carregando: boolean
  entrouRecem: boolean
  entrar: (nickname: string, senha: string) => Promise<void>
  sair: () => void
  atualizarJogador: (jogador: CurrentUser) => void
}

const ContextoAuth = createContext<EstadoEntrada | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [jogador, setJogador] = useState<CurrentUser | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [entrouRecem, setEntrouRecem] = useState(false)

  // Revalida o token guardado no navegador ao abrir a aplicação.
  useEffect(() => {
    let cancelado = false

    async function revalidar() {
      if (!lerToken()) {
        if (!cancelado) setCarregando(false)
        return
      }

      try {
        const { jogador: atual } = await api.eu()
        if (cancelado) return
        if (atual) {
          setJogador(atual)
        } else {
          limparToken()
        }
      } catch {
        if (!cancelado) limparToken()
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    void revalidar()
    return () => {
      cancelado = true
    }
  }, [])

  // Token expirado durante o uso volta para a pré-página.
  useEffect(() => {
    function aoExpirar() {
      setJogador(null)
    }
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
  }, [])

  const entrar = useCallback(async (nickname: string, senha: string) => {
    const resultado = await api.entrar(nickname, senha)
    gravarToken(resultado.token)
    setJogador(resultado.jogador)
    setEntrouRecem(resultado.criado)
  }, [])

  const sair = useCallback(() => {
    limparToken()
    setJogador(null)
    setEntrouRecem(false)
  }, [])

  const atualizarJogador = useCallback((atual: CurrentUser) => {
    setJogador(atual)
  }, [])

  const valor = useMemo<EstadoEntrada>(
    () => ({ jogador, carregando, entrouRecem, entrar, sair, atualizarJogador }),
    [jogador, carregando, entrouRecem, entrar, sair, atualizarJogador],
  )

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>
}

export function useAuth(): EstadoEntrada {
  const contexto = useContext(ContextoAuth)
  if (!contexto) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return contexto
}

export { ErroApi }