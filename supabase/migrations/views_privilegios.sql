-- Migração: views do public fora do alcance da anon key
-- =====================================================================
-- Por quê: view NÃO passa pela RLS das tabelas de baixo — ela roda com os
-- privilégios do dono (postgres) — e o Supabase concede SELECT/INSERT/... a
-- `anon` e `authenticated` em todo objeto novo do schema public. Resultado
-- (conferido em 2026-11-05): sem login, só com a anon key (que vai no bundle
-- do site), `GET /rest/v1/vw_equipe_predio` devolvia e-mail, nome, prédio e
-- permissões de TODOS os usuários (a view faz join com auth.users).
--
-- Correção: só a service role (API) lê as views. `security_invoker` NÃO é
-- opção para vw_equipe_predio: a service role não tem SELECT em auth.users,
-- então a Gestão de Equipe quebraria.
--
-- Regra (CLAUDE.md): toda view criada no public precisa de REVOKE de
-- anon/authenticated no próprio arquivo que a cria. Idempotente.

-- ---------------------------------------------------------------------
-- 1. vw_equipe_predio — usada por /api/equipe (service role)
--    Criada à mão no painel; versionada aqui com a definição de produção.
--    Só é criada se não existir (no banco atual nada muda além dos grants).
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'vw_equipe_predio') then
        execute $v$
            create view vw_equipe_predio as
            select ua.user_id,
                   ua.predio_id,
                   u.email,
                   u.raw_user_meta_data ->> 'nome' as nome,
                   p.nome as perfil_nome,
                   ua.perfil_id,
                   ua.permissoes
              from usuarios_acessos ua
              join auth.users u on u.id = ua.user_id
              left join perfis p on p.id = ua.perfil_id
        $v$;
    end if;
end $$;

revoke all on table vw_equipe_predio from public, anon, authenticated, service_role;
grant select on table vw_equipe_predio to service_role;

-- ---------------------------------------------------------------------
-- 2. vw_relatorio_emprestimos — criada à mão, nenhum código usa.
--    Fechada (e com security_invoker, para respeitar a RLS se um dia voltar
--    a ter grant). Pode ser removida se o dashboard do Supabase também não a
--    usar.
-- ---------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'vw_relatorio_emprestimos') then
        execute 'alter view vw_relatorio_emprestimos set (security_invoker = true)';
        execute 'revoke all on table vw_relatorio_emprestimos from public, anon, authenticated';
    end if;
end $$;

-- Conferir (deve voltar false/false nas duas):
-- select c.relname, has_table_privilege('anon', c.oid, 'select'), has_table_privilege('authenticated', c.oid, 'select')
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind in ('v', 'm');
