import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    try {
        const predioId = req.headers['x-predio-id'] || req.user.predio_id;
        const { email, permissoes, perfil_id } = req.body;

        // 1. Busca o user_id do membro baseado no email
        const { data: usuario, error: errBusca } = await supabase
            .from('vw_equipe_predio')
            .select('user_id')
            .eq('email', email)
            .single();

        if (errBusca || !usuario) {
            return res.status(404).json({ error: "Usuário não encontrado na base de dados." });
        }

        // 2. Monta o objeto de atualização
        const payload = { permissoes: permissoes };
        if (perfil_id) {
            payload.perfil_id = perfil_id;
        }

        // 3. Salva no banco
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

export default withAuth(handler, 'equipe');