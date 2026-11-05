import { useState } from 'react'
import { supabase } from '../supabase'

// Traduz os erros mais comuns do Supabase Auth (que chegam em inglês)
function traduzirErro(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado. Use o link do convite recebido por e-mail.'
  if (error?.status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
  return 'Não foi possível concluir. Tente de novo em instantes.'
}

const estiloInput = { padding: '10px', borderRadius: '4px', border: '1px solid #c4bdb3' }
const estiloLink = { background: 'none', border: 'none', color: '#1c2b4a', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0, alignSelf: 'center' }

export default function Login() {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'recuperar'
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  const trocarModo = (novo) => {
    setModo(novo)
    setErro('')
    setEnviado(false)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErro(traduzirErro(error))
    setLoading(false)
  }

  // O link do e-mail volta para a raiz com #type=recovery; o App detecta e
  // abre a tela DefinirSenha (mesmo fluxo do convite).
  const handleRecuperar = async (e) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setLoading(false)
    // Mensagem neutra: não revela se o e-mail tem conta. Só erros de
    // limite/rede aparecem, porque aí o e-mail de fato não saiu.
    const msg = (error?.message || '').toLowerCase()
    if (error && (error.status === 429 || msg.includes('rate limit') || msg.includes('security purposes') || msg.includes('fetch') || msg.includes('network'))) {
      setErro(traduzirErro(error))
      return
    }
    setEnviado(true)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0ede8' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: '#1c2b4a', marginBottom: '24px' }}>PUCRS · Sistema de Salas</h2>

        {modo === 'entrar' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input
              type="email"
              placeholder="E-mail da secretaria"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={estiloInput}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={estiloInput}
              autoComplete="current-password"
              required
            />
            {erro && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 12px', textAlign: 'center' }}>{erro}</p>}
            <button type="submit" disabled={loading} style={{ background: '#1c2b4a', color: '#fff', padding: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Entrando...' : 'Entrar no Sistema'}
            </button>
            <button type="button" onClick={() => trocarModo('recuperar')} style={estiloLink}>
              Esqueci minha senha
            </button>
          </form>
        ) : enviado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
            <p style={{ margin: 0, color: '#1c2b4a', fontSize: '14px', lineHeight: 1.5 }}>
              Se <b>{email.trim()}</b> tiver acesso ao sistema, um e-mail com o link para criar uma nova senha vai chegar em alguns minutos.
            </p>
            <p style={{ margin: 0, color: '#6b6359', fontSize: '13px', lineHeight: 1.5 }}>
              Confira também a caixa de spam. O link vale por pouco tempo e só pode ser usado uma vez.
            </p>
            <button type="button" onClick={() => trocarModo('entrar')} style={{ background: '#1c2b4a', color: '#fff', padding: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, color: '#6b6359', fontSize: '13px', lineHeight: 1.5, textAlign: 'center' }}>
              Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
            </p>
            <input
              type="email"
              placeholder="E-mail da secretaria"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={estiloInput}
              autoComplete="username"
              autoFocus
              required
            />
            {erro && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 12px', textAlign: 'center' }}>{erro}</p>}
            <button type="submit" disabled={loading} style={{ background: '#1c2b4a', color: '#fff', padding: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Enviando...' : 'Enviar link de nova senha'}
            </button>
            <button type="button" onClick={() => trocarModo('entrar')} style={estiloLink}>
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
