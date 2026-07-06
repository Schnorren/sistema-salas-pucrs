import supabase from '../config/supabase.js';

// Registra uma ação sensível na tabela auditoria_log.
// Não-bloqueante: falha de auditoria nunca derruba a operação principal.
// Requer a migração supabase/migrations/auditoria_log.sql aplicada.
export function registrarAuditoria({ user, acao, entidade, entidadeId = null, predioId = null, detalhes = null }) {
    const linha = {
        user_id: user?.id || null,
        user_email: user?.email || null,
        acao,
        entidade,
        entidade_id: entidadeId ? String(entidadeId) : null,
        predio_id: predioId || null,
        detalhes: detalhes || null,
    };

    return supabase
        .from('auditoria_log')
        .insert(linha)
        .then(({ error }) => {
            if (error) console.error('[auditoria] falha ao registrar:', error.message);
        })
        .catch((e) => console.error('[auditoria] exceção:', e?.message || e));
}
