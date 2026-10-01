import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, KeyRound, ShieldCheck, UserRound } from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import { ErroApi } from '../lib/api'

type EstadoEnvio = 'idle' | 'sending'

/**
 * Pré-página de entrada de nickname e senha ("Entrada do Nickname do player e
 * Senha" no fluxograma).
 *
 * Nickname novo é criado com a senha informada; nickname existente exige a senha
 * correta. Por isso a mesma tela serve como cadastro e como login.
 */
export default function LoginPage() {
  const { entrar } = useAuth()

  const [nickname, setNickname] = useState('')
  const [senha, setSenha] = useState('')
  const [estado, setEstado] = useState<EstadoEnvio>('idle')
  const [erro, setErro] = useState<string | null>(null)

  const nickNameLimpo = nickname.trim()
  const nicknameValido = nickNameLimpo.length >= 2
  const senhaValida = senha.length >= 4
  const podeEntrar = nicknameValido && senhaValida && estado === 'idle'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!podeEntrar) return

    setEstado('sending')
    setErro(null)

    try {
      await entrar(nickNameLimpo, senha)
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível entrar. Verifique a conexão e tente de novo.',
      )
      setEstado('idle')
      setSenha('')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-backdrop" aria-hidden="true" />

      <main className="login-card">
        <img className="login-logo" src="/quiz-arena-logo.png" alt="Quiz! Arena" />

        <div className="login-intro">
          <h1 className="login-title">Bem-vindo ao Quiz! Arena</h1>
          <p className="login-subtitle">
            Entre com seu nickname e senha para jogar as questões do dia e acompanhar o ranking.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="login-field" htmlFor="nickname">
            <span className="login-label">
              <UserRound size={13} /> Nickname
            </span>
            <input
              id="nickname"
              name="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Como quer ser chamado"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              disabled={estado === 'sending'}
            />
          </label>

          <label className="login-field" htmlFor="senha">
            <span className="login-label">
              <KeyRound size={13} /> Senha
            </span>
            <input
              id="senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Escolha uma senha com 4+ caracteres"
              autoComplete="current-password"
              maxLength={72}
              disabled={estado === 'sending'}
            />
          </label>

          {erro && (
            <p className="login-error" role="alert">
              {erro}
            </p>
          )}

          <button className="login-submit" type="submit" disabled={!podeEntrar}>
            {estado === 'sending' ? (
              <>
                <span className="spinner" /> Entrando...
              </>
            ) : (
              <>
                Entrar no Arena <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>

        <div className="login-hint">
          <ShieldCheck size={14} />
          <p>
            Nickname ainda não existe? Ele é criado automaticamente com a senha que você digitar.
            Sua senha fica guardada apenas como hash.
          </p>
        </div>
      </main>

      <footer className="login-footer">Feito para quem gosta de saber um pouco mais.</footer>
    </div>
  )
}