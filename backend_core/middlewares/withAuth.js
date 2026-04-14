import supabase from '../config/supabase.js';

export const withAuth = (handler, moduloRequisitado = null) => {
    return async (req, res) => {
        console.log("🚀 [withAuth] Requisição recebida em:", req.url);
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                console.log("⚠️ [withAuth] Sem header de autorização.");
                return res.status(401).json({ error: 'Token não fornecido' });
            }

            console.log("🔑 [withAuth] Validando token no Supabase...");
            const token = authHeader.split(' ')[1];
            if (!token || token === 'undefined' || token === 'null') {
                console.log("❌ [AuthGuard] Falha: Token vazio ou malformado.");
                return res.status(401).json({ error: 'Token inválido' });
            }

            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (authError || !user) {
                console.log("❌ [AuthGuard] Token rejeitado ou usuário não encontrado.");
                return res.status(401).json({ error: 'Usuário não autenticado ou token inválido' });
            }

            const { data: acesso, error: dbError } = await supabase
                .from('usuarios_acessos')
                .select('perfil_id, predio_id, permissoes')
                .eq('user_id', user.id)
                .single();

            if (dbError && dbError.code !== 'PGRST116') {
                console.log("❌ [AuthGuard] Erro ao pesquisar no BD:", dbError);
                return res.status(500).json({ error: 'Erro interno ao validar acessos' });
            }

            let predioAtivo = acesso?.predio_id || null;
            const permissoesUser = acesso?.permissoes || [];

            const isAdmin = permissoesUser.includes('admin');
            
            const isUserGlobal = predioAtivo === null || isAdmin;

            const predioSelecionadoFrontend = req.headers['x-predio-id'] || req.query.predio_id;

            if (isUserGlobal && predioSelecionadoFrontend) {
                predioAtivo = predioSelecionadoFrontend;
            }

            if (moduloRequisitado) {
                if (!isAdmin && !permissoesUser.includes(moduloRequisitado)) {
                    console.log(`🚫 [CheckPerm] Bloqueado: Usuário tentou acessar '${moduloRequisitado}'.`);
                    return res.status(403).json({
                        error: `Acesso restrito ao módulo: ${moduloRequisitado}`
                    });
                }
            }

            req.user = {
                id: user.id,
                predio_id: predioAtivo,
                permissoes: permissoesUser
            };
            
            return await handler(req, res);

        } catch (err) {
            console.log("🚫 [AuthGuard Fatal] Erro inesperado:", err.message);
            return res.status(500).json({ error: 'Erro interno do servidor', detalhe: err.message });
        }
    };
};