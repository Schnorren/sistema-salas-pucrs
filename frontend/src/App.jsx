import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    // Pega a sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Fica escutando se o usuário logou ou deslogou
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!session) {
    return <Login />
  }

  return <Dashboard session={session} />
}