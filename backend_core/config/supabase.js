import { createClient } from '@supabase/supabase-js'

// Configuração para manter a conexão viva e reutilizar o handshake SSL
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: {
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          keepalive: true, // 👈 ISSO AQUI mantém o túnel aberto com Virgínia
        })
      }
    },
    auth: { persistSession: false }
  }
)

export default supabase