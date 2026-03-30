import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0ede8' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: '#1c2b4a', marginBottom: '24px' }}>PUCRS · Prédio 15</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input 
            type="email" 
            placeholder="E-mail da secretaria" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #c4bdb3' }}
            required
          />
          <input 
            type="password" 
            placeholder="Senha" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #c4bdb3' }}
            required
          />
          <button type="submit" disabled={loading} style={{ background: '#1c2b4a', color: '#fff', padding: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  )
}