import { createClient } from '@supabase/supabase-js'

// ✅ Inicialização FORA do handler para manter a conexão "viva" entre as bípadas
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
)

export default supabase