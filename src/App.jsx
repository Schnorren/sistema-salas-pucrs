import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import DefinirSenha from './components/DefinirSenha'

// O link de convite/recuperação chega como `#access_token=...&type=invite`.
// O supabase-js troca esse hash por sessão e LIMPA a URL, então a leitura tem
// que acontecer aqui, no topo do módulo (síncrono, antes de qualquer await do
// client). O marcador vai para o sessionStorage porque o usuário pode recarregar
// a página no meio do fluxo — e aí o hash já não existe mais.
const CHAVE_SENHA_PENDENTE = 'pucrs.definirSenhaPendente'

function detectarLinkDeSenha() {
  const tipo = new URLSearchParams(window.location.hash.slice(1)).get('type')
  if (tipo === 'invite' || tipo === 'recovery') {
    sessionStorage.setItem(CHAVE_SENHA_PENDENTE, '1')
  }
  return sessionStorage.getItem(CHAVE_SENHA_PENDENTE) === '1'
}

const senhaPendenteNaEntrada = detectarLinkDeSenha()

export default function App() {
  const [session, setSession] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [precisaDefinirSenha, setPrecisaDefinirSenha] = useState(senhaPendenteNaEntrada)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(CHAVE_SENHA_PENDENTE, '1')
        setPrecisaDefinirSenha(true)
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(CHAVE_SENHA_PENDENTE)
        setPrecisaDefinirSenha(false)
      }
      setSession(session)
      setIsAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const concluirDefinicaoDeSenha = () => {
    sessionStorage.removeItem(CHAVE_SENHA_PENDENTE)
    setPrecisaDefinirSenha(false)
  }

  if (isAuthLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f0ede8', color: '#1c2b4a', fontWeight: 'bold' }}>
        Iniciando sistema...
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (precisaDefinirSenha) {
    return <DefinirSenha session={session} onConcluir={concluirDefinicaoDeSenha} />
  }

  return <Dashboard session={session} />
}
