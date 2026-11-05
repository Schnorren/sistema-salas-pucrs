import supabase from '../../backend_core/config/supabase.js';
import { withAuth, invalidarAcessoEmCache } from '../../backend_core/middlewares/withAuth.js';
import { responderErro } from '../../backend_core/utils/http.js';
import { registrarAuditoria } from '../../backend_core/utils/auditoria.js';
import { sanitizarPermissoes, MODULOS_SO_ADMIN } from '../../backend_core/utils/modulos.js';
import gestaoEmprestimos from '../../backend_core/services/emprestimosGestao.service.js';
import { barrarEdicaoDeMembro, barrarRevogacao, barrarReconvite } from '../../backend_core/utils/equipeRegras.js';
import { normalizarEmail, RE_EMAIL, traduzirErroDeConvite, urlDoApp, emailPermitido, ehContaExistente } from '../../backend_core/utils/convite.js';

// Localiza um usuário do Auth pelo e-mail (paginado — não há busca direta).
async function encontrarUsuarioAuthPorEmail(email) {
    const alvo = String(email || '').toLowerCase();
    let page = 1;
    const perPage = 1000;
    while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const found = (data.users || []).find(u => u.email?.toLowerCase() === alvo);
        if (found) return found;
        if ((data.users || []).length < perPage) break;
        page++;
    }
    return null;
}

async function handler(req, res) {
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const baseIndex = urlParts.indexOf('equipe');
    const caminho1 = baseIndex !== -1 && urlParts.length > baseIndex + 1 ? urlParts[baseIndex + 1] : null;

    // Prédio resolvido pelo withAuth — não reler x-predio-id (evita gerenciar equipe de outro prédio).
    const predioId = req.user?.predio_id;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const isAdminReq = req.user?.permissoes?.includes('admin');
    const isGestor = isAdminReq || req.user?.permissoes?.includes('equipe');

    // `atuais`: o gestor comum não concede nem retira os módulos do admin
    // (admin, relatório da rede) — os que o membro já tem são mantidos.
    const sanitizar = (lista, atuais = []) => sanitizarPermissoes(lista, { permitirAdmin: isAdminReq, atuais });

    if (req.method === 'GET' && !caminho1) {
        try {
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

            const { data, error } = await supabase
                .from('vw_equipe_predio')
                .select('*')
                .eq('predio_id', predioId)
                .order('nome', { ascending: true });

            if (error) throw error;
            // Pontos de empréstimo que cada membro opera (checkboxes do formulário)
            const vinculos = await gestaoEmprestimos.vinculosPorUsuario(predioId);
            return res.status(200).json((data || []).map(m => ({ ...m, pontos_emprestimo: vinculos.get(m.user_id) || [] })));
        } catch (error) {
            return responderErro(res, error);
        }
    }

    // Pontos de empréstimo do prédio, para liberar por membro
    if (req.method === 'GET' && caminho1 === 'pontos-emprestimo') {
        try {
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });
            return res.status(200).json(await gestaoEmprestimos.pontosParaEquipe(predioId));
        } catch (error) {
            return responderErro(res, error);
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
            return responderErro(res, error);
        }
    }
    if (req.method === 'GET' && caminho1 === 'modulos') {
        try {
            const { data, error } = await supabase
                .from('sistema_modulos')
                .select('*')
                .order('nome', { ascending: true });

            if (error) throw error;
            // Gestor comum não concede os módulos do admin (o sanitizar
            // descartaria em silêncio) — então nem mostra o card.
            return res.status(200).json(isAdminReq ? data : (data || []).filter(m => !MODULOS_SO_ADMIN.includes(m.id)));
        } catch (error) {
            return responderErro(res, error);
        }
    }
    if ((req.method === 'POST' || req.method === 'PUT') && caminho1 === 'membro') {
        try {
            if (!isGestor) return res.status(403).json({ error: "Permissão negada." });
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

            const { nome, permissoes, perfil_id } = req.body || {};
            const email = normalizarEmail(req.body?.email);
            if (!email) return res.status(400).json({ error: "E-mail obrigatório." });

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id, permissoes')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: "Usuário não encontrado." });

            const permissoesFinais = sanitizar(permissoes, usuario.permissoes);
            // Admin só é editado por admin; ninguém tira de si a própria gestão
            const barrado = barrarEdicaoDeMembro({ alvo: usuario, editorId: req.user.id, editorAdmin: isAdminReq, permissoesNovas: permissoesFinais });
            if (barrado) return res.status(barrado.status).json({ error: barrado.error });
            const payload = { permissoes: permissoesFinais };
            if (perfil_id) payload.perfil_id = perfil_id;

            const { error: errUpd } = await supabase
                .from('usuarios_acessos')
                .update(payload)
                .eq('user_id', usuario.user_id)
                .eq('predio_id', predioId);
            if (errUpd) throw errUpd;
            invalidarAcessoEmCache(usuario.user_id);

            if (nome) {
                await supabase.auth.admin.updateUserById(usuario.user_id, {
                    user_metadata: { nome: nome }
                });
            }

            // Pontos de empréstimo: só os do prédio; sem o módulo Empréstimos, saem todos
            const pontosEmprestimo = await gestaoEmprestimos.definirPontosDoUsuario({
                userId: usuario.user_id, predioId, pontoIds: req.body?.pontosEmprestimo, permissoes: permissoesFinais
            });

            await registrarAuditoria({
                user: req.user, acao: 'equipe.membro.atualizar', entidade: 'usuarios_acessos',
                entidadeId: usuario.user_id, predioId, detalhes: { email, permissoes: permissoesFinais, perfil_id: perfil_id || null, pontosEmprestimo }
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'POST' && caminho1 === 'convidar') {
        try {
            if (!isGestor) return res.status(403).json({ error: "Permissão negada." });
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

            const { nome, permissoes, perfil_id } = req.body || {};
            const email = normalizarEmail(req.body?.email);
            if (!email) return res.status(400).json({ error: "E-mail obrigatório." });
            if (!RE_EMAIL.test(email)) return res.status(400).json({ error: "E-mail inválido." });
            if (!emailPermitido(email)) {
                return res.status(400).json({ error: "Domínio de e-mail não permitido para convite." });
            }

            const permissoesFinais = sanitizar(permissoes);
            const destino = urlDoApp();
            const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
                email,
                {
                    data: { nome: nome?.trim() || 'Membro da Equipe' },
                    // Só envia redirectTo se houver URL configurada — senão o
                    // Supabase cai na Site URL do dashboard (comportamento antigo).
                    ...(destino ? { redirectTo: destino } : {})
                }
            );

            let userId;
            let mensagem = 'Convite enviado! Verifique também a caixa de spam.';

            if (authError) {
                // Usuário já existe no Auth (ex.: foi removido antes e reconvidado).
                const jaExiste = ehContaExistente(authError);
                // Falhas do provedor de e-mail (rate limit, e-mail inválido, SMTP)
                // viram mensagem explícita — nunca 500 genérico.
                if (!jaExiste) throw traduzirErroDeConvite(authError) || authError;

                const existente = await encontrarUsuarioAuthPorEmail(email);
                if (!existente) return res.status(409).json({ error: "Usuário já cadastrado, mas não foi possível localizá-lo." });
                userId = existente.id;

                // Trava anti-hijack: não reatribuir usuário que pertence a OUTRO prédio (só admin pode).
                const { data: acessoAtual, error: errAcesso } = await supabase
                    .from('usuarios_acessos').select('predio_id, permissoes').eq('user_id', userId).maybeSingle();
                if (errAcesso) throw errAcesso;
                // Admin global tem prédio nulo: sem a trava de admin, o upsert
                // abaixo o rebaixaria a membro comum deste prédio.
                const barradoReconvite = barrarReconvite({ acessoAtual, predioId, editorAdmin: isAdminReq });
                if (barradoReconvite) return res.status(barradoReconvite.status).json({ error: barradoReconvite.error });

                const { error: upErr } = await supabase.from('usuarios_acessos').upsert({
                    user_id: userId,
                    predio_id: predioId,
                    perfil_id: perfil_id || null,
                    permissoes: permissoesFinais
                }, { onConflict: 'user_id' });
                if (upErr) throw upErr;
                invalidarAcessoEmCache(userId);

                // `inviteUserByEmail` não reenvia nada para quem já existe: o acesso
                // seria concedido em silêncio e o gestor veria "convite enviado" sem
                // e-mail nenhum ter saído. Manda um link de definição de senha — o
                // front trata `type=recovery` na mesma tela do convite.
                const { error: errRecuperacao } = await supabase.auth.resetPasswordForEmail(
                    email,
                    destino ? { redirectTo: destino } : undefined
                );
                mensagem = errRecuperacao
                    ? `Acesso concedido, mas o e-mail com o link não pôde ser enviado (${(traduzirErroDeConvite(errRecuperacao) || errRecuperacao).message}). O usuário já tem cadastro e pode entrar pela tela de login.`
                    : 'Este usuário já tinha cadastro: acesso concedido e link para definir a senha enviado por e-mail.';
            } else {
                userId = authData.user.id;
                const { error: insErr } = await supabase.from('usuarios_acessos').insert({
                    user_id: userId,
                    predio_id: predioId,
                    perfil_id: perfil_id || null,
                    permissoes: permissoesFinais
                });
                if (insErr) {
                    // Sem acesso gravado o convite é inútil e o usuário fica órfão no
                    // Auth (e no reconvite cairia no caminho "já existe"). Desfaz.
                    await supabase.auth.admin.deleteUser(userId).catch(() => {});
                    throw insErr;
                }
            }

            const pontosEmprestimo = await gestaoEmprestimos.definirPontosDoUsuario({
                userId, predioId, pontoIds: req.body?.pontosEmprestimo, permissoes: permissoesFinais
            });

            await registrarAuditoria({
                user: req.user, acao: 'equipe.convidar', entidade: 'usuarios_acessos',
                entidadeId: userId, predioId, detalhes: { email, permissoes: permissoesFinais, perfil_id: perfil_id || null, pontosEmprestimo }
            });

            return res.status(201).json({ success: true, message: mensagem });
        } catch (error) {
            return responderErro(res, error);
        }
    }

    if (req.method === 'DELETE' && caminho1 === 'membro') {
        try {
            if (!isGestor) return res.status(403).json({ error: 'Permissão negada.' });
            if (!predioId) return res.status(400).json({ error: "Prédio não informado." });

            const email = normalizarEmail(req.body?.email);
            if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

            const { data: usuario, error: errBusca } = await supabase
                .from('vw_equipe_predio')
                .select('user_id, permissoes')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: 'Usuário não encontrado neste prédio.' });
            // Admin sai pelo Painel Admin; ninguém revoga o próprio acesso
            const barradoRevogacao = barrarRevogacao({ alvo: usuario, editorId: req.user.id, editorAdmin: isAdminReq });
            if (barradoRevogacao) return res.status(barradoRevogacao.status).json({ error: barradoRevogacao.error });

            const { error: errDelete } = await supabase
                .from('usuarios_acessos')
                .delete()
                .eq('user_id', usuario.user_id)
                .eq('predio_id', predioId);

            if (errDelete) throw errDelete;
            invalidarAcessoEmCache(usuario.user_id);

            await gestaoEmprestimos.definirPontosDoUsuario({ userId: usuario.user_id, predioId, pontoIds: [], permissoes: [] });

            await registrarAuditoria({
                user: req.user, acao: 'equipe.membro.remover', entidade: 'usuarios_acessos',
                entidadeId: usuario.user_id, predioId, detalhes: { email }
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            return responderErro(res, error);
        }
    }

    return res.status(404).json({ error: 'Endpoint não encontrado.' });
}

const handlerAutenticado = withAuth(handler, 'equipe');

// O cron da Vercel (keep-alive) não envia JWT — precisa responder ANTES do withAuth,
// senão levaria 401 e a função nunca "esquentaria".
export default function equipeEntrypoint(req, res) {
    if (req.headers['x-vercel-cron'] === '1') {
        return res.status(200).json({ status: 'keep-alive', timestamp: new Date() });
    }
    return handlerAutenticado(req, res);
}
