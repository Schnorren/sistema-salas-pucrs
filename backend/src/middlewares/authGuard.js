const supabase = require('../config/supabase'); 

const authGuard = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log("❌ [AuthGuard] Falha: Header 'Authorization' não foi enviado pelo React.");
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token === 'undefined' || token === 'null') {
        console.log("❌ [AuthGuard] Falha: O Token extraído está vazio ou malformado.");
        return res.status(401).json({ error: 'Token inválido' });
    }

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError) {
            console.log("❌ [AuthGuard] Supabase rejeitou o token:", authError.message);
            throw new Error('Token rejeitado pelo Supabase');
        }
        if (!user) {
            console.log("❌ [AuthGuard] Token é válido, mas o usuário não foi encontrado na base.");
            throw new Error('Usuário não encontrado');
        }

        // NOVO: Adicionado 'permissoes' no select para puxar o array do banco
        const { data: acesso, error: dbError } = await supabase
            .from('usuarios_acessos')
            .select('perfil_id, predio_id, permissoes, perfis(nivel)')
            .eq('user_id', user.id)
            .single();

        if (dbError && dbError.code !== 'PGRST116') {
            console.log("❌ [AuthGuard] Erro ao pesquisar no Banco de Dados:", dbError);
            throw dbError;
        }

        const nivelPoder = acesso?.perfis?.nivel || 0;
        let predioAtivo = acesso?.predio_id || null;
        
        // NOVO: Extraindo as permissões (garantindo que seja um array, mesmo se vier nulo)
        const permissoesUser = acesso?.permissoes || [];

        const predioSelecionadoFrontend = req.headers['x-predio-id'] || req.query.predio_id;
        const isUserGlobal = predioAtivo === null || nivelPoder >= 60;

        if (isUserGlobal && predioSelecionadoFrontend) {
            predioAtivo = predioSelecionadoFrontend;
        }

        // NOVO: Injetando as permissões no objeto req.user para o resto da API usar
        req.user = {
            id: user.id,
            nivel: nivelPoder,
            predio_id: predioAtivo,
            permissoes: permissoesUser 
        };

        console.log(`✅ [AuthGuard] Liberado -> Usuário: ${user.email} | Nível: ${nivelPoder} | Permissões: [${permissoesUser.join(', ')}]`);
        next();

    } catch (err) {
        console.log("🚫 [AuthGuard] Bloqueando a requisição com 403. Motivo da falha:", err.message);
        return res.status(403).json({ error: 'Acesso negado', detalhe: err.message });
    }
};

module.exports = authGuard;