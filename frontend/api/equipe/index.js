import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';

    if (isVercelCron) {
        return res.status(200).json({ status: 'keep-alive', timestamp: new Date() });
    }

    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const caminho1 = urlParts.length > 2 ? urlParts[2] : null;

    const predioId = req.headers['x-predio-id'] || req.user?.predio_id;

    if (req.method === 'GET' && !caminho1) {
        try {
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

    if (req.method === 'GET' && caminho1 === 'perfis') {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*')
                .lt('nivel', 60)
                .order('nivel', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            console.error("❌ [API Equipe - Perfis]:", error.message);
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'POST' && caminho1 === 'membro') {
        try {
            const { email, permissoes, perfil_id } = req.body;

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id')
                .eq('email', email)
                .single();

            if (errBusca || !usuario) {
                return res.status(404).json({ error: "Usuário não encontrado na base de dados." });
            }

            const payload = { permissoes: permissoes };
            if (perfil_id) {
                payload.perfil_id = perfil_id;
            }

            const { error: errUpdate } = await supabase
                .from('usuarios_acessos')
                .update(payload)
                .eq('user_id', usuario.user_id)
                .eq('predio_id', predioId);

            if (errUpdate) throw errUpdate;

            return res.status(200).json({ success: true, message: "Cadastro atualizado com sucesso!" });
        } catch (error) {
            console.error("❌ [API Equipe - Atualizar Membro]:", error.message);
            return res.status(400).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Equipe.' });
}

export default withAuth(handler, 'equipe');