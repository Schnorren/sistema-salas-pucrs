import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: {
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          keepalive: true,
        })
      }
    },
    auth: { persistSession: false }
  }
)

export default supabase