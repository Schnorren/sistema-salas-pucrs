import supabase from '../config/supabase.js';

const tokenCache = new Map();

const activeAuthRequests = new Map();

const TEMPO_DE_CACHE = 1000 * 60 * 5;

async function validarEBuscarAcesso(token) {
    if (tokenCache.has(token)) {
        const cached = tokenCache.get(token);
        if (cached.exp > Date.now()) return cached.data;
    }

    if (activeAuthRequests.has(token)) {
        return await activeAuthRequests.get(token);
    }

    const promise = (async () => {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Usuário não autenticado ou token inválido');

        const { data: acesso, error: dbError } = await supabase
            .from('usuarios_acessos')
            .select('perfil_id, predio_id, permissoes')
            .eq('user_id', user.id)
            .single();

        if (dbError && dbError.code !== 'PGRST116') {
            throw new Error('Erro interno ao validar acessos');
        }

        const result = { user, acesso };

        tokenCache.set(token, { data: result, exp: Date.now() + TEMPO_DE_CACHE });

        return result;
    })();

    activeAuthRequests.set(token, promise);

    try {
        return await promise;
    } finally {
        activeAuthRequests.delete(token);
    }
}

export const withAuth = (handler, moduloRequisitado = null) => {
    return async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

            const token = authHeader.split(' ')[1];
            if (!token || token === 'undefined' || token === 'null') {
                return res.status(401).json({ error: 'Token inválido' });
            }

            const { user, acesso } = await validarEBuscarAcesso(token);

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
                    return res.status(403).json({ error: `Acesso restrito ao módulo: ${moduloRequisitado}` });
                }
            }

            req.user = {
                id: user.id,
                predio_id: predioAtivo,
                permissoes: permissoesUser
            };

            return await handler(req, res);

        } catch (err) {
            console.log("🚫 [AuthGuard Rejeitado]:", err.message);
            return res.status(401).json({ error: err.message });
        }
    };
};