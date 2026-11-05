// Convite e criação de conta (Auth do Supabase): regras usadas pela Gestão de
// Equipe (/api/equipe/convidar) e pelo Painel Admin (POST /api/admin/usuarios).
import { ErroPublico } from './http.js';

// O Auth grava e-mail sempre em minúsculas — normalizar evita 404 na busca
// (view) e erro de validação no convite por espaço/maiúscula digitados.
export function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Traduz o erro do GoTrue (Auth) numa mensagem segura e no status certo.
// Sem isso qualquer falha do provedor de e-mail vira 500 "Erro interno" e o
// gestor não descobre que só precisa esperar (rate limit) ou corrigir o e-mail.
export function traduzirErroDeConvite(authError) {
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
export function urlDoApp() {
    const bruta = process.env.APP_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
    if (!bruta) return null;
    const url = String(bruta).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Allowlist opcional de domínios de e-mail para convite.
// Configure INVITE_EMAIL_DOMINIOS="pucrs.br,edu.pucrs.br" para restringir.
// Vazio/ausente = sem restrição.
export function emailPermitido(email) {
    const raw = process.env.INVITE_EMAIL_DOMINIOS;
    if (!raw || !raw.trim()) return true;
    const dominios = raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    const dom = String(email || '').split('@')[1]?.toLowerCase();
    return dom ? dominios.includes(dom) : false;
}

// Conta que já existe no Auth (convite ou criação com o mesmo e-mail)
export const ehContaExistente = (authError) =>
    authError?.status === 422 || authError?.code === 'email_exists' || /already|registered|exists/i.test(authError?.message || '');
