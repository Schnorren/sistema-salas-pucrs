const supabase = require('../config/supabase');

class EquipeController {
    async listarEquipe(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            if (!predioId) throw new Error("Prédio não informado.");

            const { data, error } = await supabase
                .from('vw_equipe_predio')
                .select('*')
                .eq('predio_id', predioId)
                .order('nivel', { ascending: false });

            if (error) throw error;
            res.json(data);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // NOVO: Busca a lista de cargos (perfis) disponíveis
    async listarPerfis(req, res) {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*')
                .lt('nivel', 60) // Evita que um encarregado crie Coordenadores/Admins
                .order('nivel', { ascending: true });

            if (error) throw error;
            res.json(data);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // ATUALIZADO: Agora salva as permissões E o cargo
    async atualizarMembro(req, res) {
        try {
            const predioId = req.headers['x-predio-id'];
            const { email, permissoes, perfil_id } = req.body;

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id')
                .eq('email', email)
                .single();

            if (errBusca || !usuario) {
                throw new Error("Usuário não encontrado na base de dados.");
            }

            // Monta o objeto de atualização
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

            res.json({ success: true, message: "Cadastro atualizado com sucesso!" });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new EquipeController();