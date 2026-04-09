import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    
    try {
        const predioId = req.headers['x-predio-id'] || req.user.predio_id;
        if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

        const { data, error } = await supabase
            .from('vw_equipe_predio')
            .select('*')
            .eq('predio_id', predioId)
            .order('nivel', { ascending: false });

        if (error) throw error;
        return res.status(200).json(data);
    } catch (error) {
        console.error("❌ [API Equipe - Listar]:", error.message);
        return res.status(400).json({ error: error.message });
    }
}

// O segundo parâmetro exige que o usuário tenha a permissão "equipe"
export default withAuth(handler, 'equipe');