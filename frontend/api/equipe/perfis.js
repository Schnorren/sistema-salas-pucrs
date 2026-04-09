import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();
    
    try {
        const { data, error } = await supabase
            .from('perfis')
            .select('*')
            .lt('nivel', 60) // Evita que um encarregado crie Coordenadores/Admins
            .order('nivel', { ascending: true });

        if (error) throw error;
        return res.status(200).json(data);
    } catch (error) {
        console.error("❌ [API Equipe - Perfis]:", error.message);
        return res.status(400).json({ error: error.message });
    }
}

export default withAuth(handler, 'equipe');