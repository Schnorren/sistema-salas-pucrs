import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setIsAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

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

  return <Dashboard session={session} />
}