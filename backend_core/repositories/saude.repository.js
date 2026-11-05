import supabase from '../config/supabase.js';

class SaudeRepository {
    // Uma consulta mínima, de verdade, no banco (via API REST do Supabase).
    async tocarBanco() {
        const { error } = await supabase.from('predios').select('id').limit(1);
        if (error) throw error;
    }
}

export default new SaudeRepository();
