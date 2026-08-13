import { useState } from 'react'
import { supabase } from '../supabase'

// Tela obrigatória para quem chega pelo link de convite (ou de recuperação):
// o usuário entra com sessão válida mas SEM senha definida — sem isto ele
// consegue usar o sistema nesta visita e nunca mais volta a logar.
export default function DefinirSenha({ session, onConcluir }) {
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const nome = session?.user?.user_metadata?.nome

  const handleSalvar = async (e) => {
    e.preventDefault()
    setErro('')

    if (senha.length < 6) return setErro('A senha deve ter pelo menos 6 caracteres.')
    if (senha !== confirmarSenha) return setErro('As senhas não coincidem.')

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro(error.message || 'Não foi possível definir a senha.')
      setSalvando(false)
      return
    }
    onConcluir()
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0ede8' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: '#1c2b4a', marginBottom: '8px' }}>PUCRS · Sistema de Salas</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>
          {nome ? `Bem-vindo(a), ${nome}! ` : ''}Defina uma senha para acessar o sistema das próximas vezes.
        </p>
        <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="password"
            placeholder="Nova senha (mínimo 6 caracteres)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #c4bdb3' }}
            required
          />
          <input
            type="password"
            placeholder="Confirme a senha"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            autoComplete="new-password"
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #c4bdb3' }}
            required
          />
          {erro && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0, textAlign: 'center' }}>{erro}</p>}
          <button
            type="submit"
            disabled={salvando}
            style={{ background: '#1c2b4a', color: '#fff', padding: '12px', border: 'none', borderRadius: '4px', cursor: salvando ? 'wait' : 'pointer', fontWeight: 'bold' }}
          >
            {salvando ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </form>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ display: 'block', margin: '20px auto 0', background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
