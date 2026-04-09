import { createClient } from '@supabase/supabase-js';

// Tenta ler as variáveis do ambiente (Vite local ou Vercel nuvem)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY; 
console.log("🛠️ [Config] Inicializando Supabase com URL:", supabaseUrl ? "OK" : "ERRO");
if (!supabaseUrl || !supabaseKey) {
  throw new Error('As credenciais do Supabase estão ausentes no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;