const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('As credenciais do Supabase estão ausentes no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;