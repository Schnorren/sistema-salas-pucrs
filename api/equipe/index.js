import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';

async function handler(req, res) {
    // Mantém o Vercel Cron vivo
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    if (isVercelCron) {
        return res.status(200).json({ status: 'keep-alive', timestamp: new Date() });
    }

    // 🔥 Blindagem de Rota
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const baseIndex = urlParts.indexOf('equipe');
    const caminho1 = baseIndex !== -1 && urlParts.length > baseIndex + 1 ? urlParts[baseIndex + 1] : null;

    const predioId = req.headers['x-predio-id'] || req.user?.predio_id;

    // Remove cache para rotas de gerenciamento
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // ==========================================
    // 🟢 LISTAR EQUIPE DO PRÉDIO
    // ==========================================
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

    // ==========================================
    // 🟢 LISTAR CARGOS DISPONÍVEIS (PERFIS)
    // ==========================================
    if (req.method === 'GET' && caminho1 === 'perfis') {
        try {
            const { data, error } = await supabase
                .from('perfis')
                .select('*')
                .lt('nivel', 60) // Abaixo de Admin/Coordenador
                .order('nivel', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error) {
            console.error("❌ [API Equipe - Perfis]:", error.message);
            return res.status(400).json({ error: error.message });
        }
    }

    // ==========================================
    // 🟢 LISTAR MÓDULOS DISPONÍVEIS DO SISTEMA
    // ==========================================
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


    // ==========================================
    // 🟢 ATUALIZAR ACESSOS E NOME DE UM MEMBRO
    // ==========================================
    if ((req.method === 'POST' || req.method === 'PUT') && caminho1 === 'membro') {
        try {
            const { email, nome, permissoes, perfil_id } = req.body;

            if (req.user?.nivel !== 99 && !req.user.permissoes.includes('equipe')) {
                return res.status(403).json({ error: "Você não tem permissão para modificar a equipe." });
            }

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: "Usuário não encontrado." });

            // Atualiza Permissões
            const payload = { permissoes: permissoes || [] };
            if (perfil_id) payload.perfil_id = perfil_id;

            await supabase.from('usuarios_acessos').update(payload).eq('user_id', usuario.user_id);

            // 🔥 Atualiza o Nome no Supabase Auth (Metadados)
            if (nome) {
                await supabase.auth.admin.updateUserById(usuario.user_id, {
                    user_metadata: { nome: nome }
                });
            }

            return res.status(200).json({ success: true, message: "Cadastro atualizado com sucesso!" });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // ==========================================
    // 🟢 CONVIDAR NOVO MEMBRO (SUPABASE AUTH)
    // ==========================================
    if (req.method === 'POST' && caminho1 === 'convidar') {
        try {
            const { email, nome, permissoes, perfil_id } = req.body;

            if (req.user?.nivel !== 99 && !req.user.permissoes.includes('equipe')) {
                return res.status(403).json({ error: "Você não tem permissão para convidar novos membros." });
            }

            // 🔥 Dispara o convite JÁ INJETANDO O NOME no banco do Supabase!
            const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
                email,
                { data: { nome: nome || 'Membro da Equipe' } } // Injeta aqui
            );

            if (authError) {
                if (authError.status === 422) throw new Error("Este usuário já possui cadastro.");
                throw authError;
            }

            const novoUserId = authData.user.id;

            await supabase.from('usuarios_acessos').insert({
                user_id: novoUserId,
                predio_id: predioId,
                perfil_id: perfil_id || null,
                permissoes: permissoes || []
            });

            return res.status(201).json({ success: true, message: "Convite enviado!" });
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // 🔥 O ÚNICO RETURN SOLTO DEVE FICAR AQUI, NO FINAL DE TUDO!
    return res.status(404).json({ error: 'Endpoint não encontrado no módulo de Equipe.' });
} // <-- FECHA A FUNÇÃO HANDLER AQUI

// O módulo todo é protegido pela chave 'equipe'
export default withAuth(handler, 'equipe');