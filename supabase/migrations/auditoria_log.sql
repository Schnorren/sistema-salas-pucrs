-- Migração: tabela de auditoria de ações sensíveis
-- =====================================================================
-- Registra concessão/revogação de permissões, convites, e movimentações de
-- empréstimo (retenção de documento do aluno → relevante para LGPD).
-- Escrita e leitura só pela service role (API). RLS habilitada sem policy
-- para authenticated/anon = ninguém acessa direto pela anon key.

create table if not exists auditoria_log (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid,
    user_email  text,
    acao        text not null,           -- ex: 'equipe.convidar', 'emprestimo.devolver'
    entidade    text not null,           -- ex: 'usuarios_acessos', 'emprestimos_registro'
    entidade_id text,
    predio_id   uuid,
    detalhes    jsonb,
    criado_em   timestamptz not null default now()
);

create index if not exists idx_auditoria_criado_em on auditoria_log (criado_em desc);
create index if not exists idx_auditoria_predio    on auditoria_log (predio_id, criado_em desc);

alter table auditoria_log enable row level security;
-- Sem policies para authenticated/anon: acesso exclusivo da service role.
