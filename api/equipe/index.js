import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (isVercelCron) return res.status(200).json({ status: 'keep-alive', timestamp: new Date() });

    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const baseIndex = urlParts.indexOf('equipe');
    const caminho1 = baseIndex !== -1 && urlParts.length > baseIndex + 1 ? urlParts[baseIndex + 1] : null;

    const predioId = req.headers['x-predio-id'] || req.user?.predio_id;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const isGestor = req.user?.permissoes?.includes('admin') || req.user?.permissoes?.includes('equipe');

    if (req.method === 'GET' && !caminho1) {
        try {
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

            const { data, error } = await supabase
                .from('vw_equipe_predio')
                .select('*')
                .eq('predio_id', predioId)
                .order('nome', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'GET' && caminho1 === 'perfis') {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*')
                .order('nome', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }
    if (req.method === 'GET' && caminho1 === 'modulos') {
        try {
            const { data, error } = await supabase
                .from('sistema_modulos')
                .select('*')
                .order('nome', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            console.error("❌ [API Equipe - Módulos]:", error.message);
            return res.status(400).json({ error: error.message });
        }
    }
    if ((req.method === 'POST' || req.method === 'PUT') && caminho1 === 'membro') {
        try {
            if (!isGestor) return res.status(403).json({ error: "Permissão negada." });

            const { email, nome, permissoes, perfil_id } = req.body;

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: "Usuário não encontrado." });

            const payload = { permissoes: permissoes || [] };
            if (perfil_id) payload.perfil_id = perfil_id;

            await supabase.from('usuarios_acessos').update(payload).eq('user_id', usuario.user_id);

            if (nome) {
                await supabase.auth.admin.updateUserById(usuario.user_id, {
                    user_metadata: { nome: nome }
                });
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    if (req.method === 'POST' && caminho1 === 'convidar') {
        try {
            if (!isGestor) return res.status(403).json({ error: "Permissão negada." });

            const { email, nome, permissoes, perfil_id } = req.body;

            const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
                email,
                { data: { nome: nome || 'Membro da Equipe' } }
            );

            if (authError) {
                if (authError.status === 422) throw new Error("Usuário já cadastrado.");
                throw authError;
            }

            await supabase.from('usuarios_acessos').insert({
                user_id: authData.user.id,
                predio_id: predioId,
                perfil_id: perfil_id || null,
                permissoes: permissoes || []
            });

            return res.status(201).json({ success: true, message: "Convite enviado!" });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado.' });
}
export default withAuth(handler, 'equipe');