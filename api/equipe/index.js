import supabase from '../../backend_core/config/supabase.js';
import { withAuth } from '../../backend_core/middlewares/withAuth.js';
import { responderErro, ErroPublico } from '../../backend_core/utils/http.js';
import { registrarAuditoria } from '../../backend_core/utils/auditoria.js';
import { sanitizarPermissoes } from '../../backend_core/utils/modulos.js';

// O Auth grava e-mail sempre em minúsculas — normalizar evita 404 na busca
// (view) e erro de validação no convite por espaço/maiúscula digitados.
function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Traduz o erro do GoTrue (Auth) numa mensagem segura e no status certo.
// Sem isso qualquer falha do provedor de e-mail vira 500 "Erro interno" e o
// gestor não descobre que só precisa esperar (rate limit) ou corrigir o e-mail.
function traduzirErroDeConvite(authError) {
    const msg = String(authError?.message || '');
    const status = authError?.status;

    if (status === 429 || /rate limit/i.test(msg)) {
        return new ErroPublico(
            'Limite de e-mails de convite do provedor atingido. Aguarde alguns minutos e tente novamente.',
            429
        );
    }
    if (status === 400 || /invalid/i.test(msg)) {
        return new ErroPublico('E-mail inválido ou domínio inexistente. Confira o endereço.', 400);
    }
    if (/send|smtp|mail/i.test(msg)) {
        return new ErroPublico(
            'Não foi possível enviar o e-mail de convite (falha no provedor de e-mail). Tente novamente em instantes.',
            502
        );
    }
    return null; // desconhecido → 500 genérico + log, via responderErro
}

// Para onde o link do e-mail de convite deve levar. Sem isso o Supabase usa a
// "Site URL" do dashboard, cujo default é http://localhost:3000 — o convidado
// recebe um link quebrado. Defina APP_URL na Vercel; o fallback é o domínio de
// produção do projeto. Nunca derive do header Host (seria open redirect).
function urlDoApp() {
    const bruta = process.env.APP_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
    if (!bruta) return null;
    const url = String(bruta).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Allowlist opcional de domínios de e-mail para convite.
// Configure INVITE_EMAIL_DOMINIOS="pucrs.br,edu.pucrs.br" para restringir.
// Vazio/ausente = sem restrição.
function emailPermitido(email) {
    const raw = process.env.INVITE_EMAIL_DOMINIOS;
    if (!raw || !raw.trim()) return true;
    const dominios = raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    const dom = String(email || '').split('@')[1]?.toLowerCase();
    return dom ? dominios.includes(dom) : false;
}

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

    const sanitizar = (lista) => sanitizarPermissoes(lista, { permitirAdmin: isAdminReq });

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
            return res.status(200).json(data);
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
                .select('user_id')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: "Usuário não encontrado." });

            const permissoesFinais = sanitizar(permissoes);
            const payload = { permissoes: permissoesFinais };
            if (perfil_id) payload.perfil_id = perfil_id;

            const { error: errUpd } = await supabase
                .from('usuarios_acessos')
                .update(payload)
                .eq('user_id', usuario.user_id)
                .eq('predio_id', predioId);
            if (errUpd) throw errUpd;

            if (nome) {
                await supabase.auth.admin.updateUserById(usuario.user_id, {
                    user_metadata: { nome: nome }
                });
            }

            registrarAuditoria({
                user: req.user, acao: 'equipe.membro.atualizar', entidade: 'usuarios_acessos',
                entidadeId: usuario.user_id, predioId, detalhes: { email, permissoes: permissoesFinais, perfil_id: perfil_id || null }
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

            if (authError) {
                // Usuário já existe no Auth (ex.: foi removido antes e reconvidado).
                const jaExiste = authError.status === 422 || /already|registered|exists/i.test(authError.message || '');
                // Falhas do provedor de e-mail (rate limit, e-mail inválido, SMTP)
                // viram mensagem explícita — nunca 500 genérico.
                if (!jaExiste) throw traduzirErroDeConvite(authError) || authError;

                const existente = await encontrarUsuarioAuthPorEmail(email);
                if (!existente) return res.status(409).json({ error: "Usuário já cadastrado, mas não foi possível localizá-lo." });
                userId = existente.id;

                // Trava anti-hijack: não reatribuir usuário que pertence a OUTRO prédio (só admin pode).
                const { data: acessoAtual } = await supabase
                    .from('usuarios_acessos').select('predio_id').eq('user_id', userId).maybeSingle();
                if (acessoAtual?.predio_id && acessoAtual.predio_id !== predioId && !isAdminReq) {
                    return res.status(409).json({ error: "Usuário já pertence a outro prédio. Peça a um administrador." });
                }

                const { error: upErr } = await supabase.from('usuarios_acessos').upsert({
                    user_id: userId,
                    predio_id: predioId,
                    perfil_id: perfil_id || null,
                    permissoes: permissoesFinais
                }, { onConflict: 'user_id' });
                if (upErr) throw upErr;
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

            registrarAuditoria({
                user: req.user, acao: 'equipe.convidar', entidade: 'usuarios_acessos',
                entidadeId: userId, predioId, detalhes: { email, permissoes: permissoesFinais, perfil_id: perfil_id || null }
            });

            return res.status(201).json({ success: true, message: "Convite enviado!" });
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
                .select('user_id')
                .eq('email', email)
                .eq('predio_id', predioId)
                .single();

            if (errBusca || !usuario) return res.status(404).json({ error: 'Usuário não encontrado neste prédio.' });

            const { error: errDelete } = await supabase
                .from('usuarios_acessos')
                .delete()
                .eq('user_id', usuario.user_id)
                .eq('predio_id', predioId);

            if (errDelete) throw errDelete;

            registrarAuditoria({
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
