-- Migração: Row Level Security (RLS) — isolamento multi-prédio no banco
-- =====================================================================
-- Por que: o frontend usa a ANON KEY para ler/gravar algumas tabelas direto
-- no banco (sem passar pela API), principalmente:
--   - usuarios_acessos  (useAuthAccess lê o próprio acesso + joins predios/perfis)
--   - trocas_sala        (Timeline faz upsert/delete)
--   - avisos / emprestimo_itens / emprestimos_registro / trocas_sala (Realtime)
-- Sem RLS, qualquer usuário logado consegue ler/gravar dados de QUALQUER prédio
-- e enumerar permissões de todo mundo. Estas policies fecham isso.
--
-- Importante:
--   - O backend usa a SERVICE ROLE KEY, que IGNORA RLS (bypassrls). Toda a API
--     continua funcionando normalmente; estas regras só afetam a anon key.
--   - As funções auxiliares são SECURITY DEFINER para poderem ler usuarios_acessos
--     sem cair na própria RLS (evita recursão).
--   - Idempotente: pode ser reaplicada com segurança.
--
-- APLICAR no SQL Editor do Supabase (dev e prod) e TESTAR os fluxos do frontend.

-- ---------------------------------------------------------------------
-- 1. Funções auxiliares (contexto do usuário atual via JWT)
-- ---------------------------------------------------------------------
create or replace function app_is_admin()
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'admin' = any(ua.permissoes)
       from usuarios_acessos ua where ua.user_id = auth.uid()),
    false);
$$;

create or replace function app_predio_id()
  returns uuid language sql stable security definer set search_path = public as $$
  select ua.predio_id from usuarios_acessos ua where ua.user_id = auth.uid();
$$;

-- true se o usuário tem o módulo `m` OU é admin
create or replace function app_has_modulo(m text)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ('admin' = any(ua.permissoes)) or (m = any(ua.permissoes))
       from usuarios_acessos ua where ua.user_id = auth.uid()),
    false);
$$;

-- prédio dono de uma categoria de empréstimo
create or replace function app_categoria_predio(p_cat uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select predio_id from emprestimo_categorias where id = p_cat;
$$;

-- prédio dono de um item de empréstimo (via categoria)
create or replace function app_item_predio(p_item uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select c.predio_id
    from emprestimo_itens i
    join emprestimo_categorias c on c.id = i.categoria_id
   where i.id = p_item;
$$;

grant execute on function app_is_admin(), app_predio_id(), app_has_modulo(text),
  app_categoria_predio(uuid), app_item_predio(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. usuarios_acessos — cada um lê só o próprio acesso (admin lê todos).
--    Escrita é exclusiva da API (service role). Fecha enumeração de permissões.
-- ---------------------------------------------------------------------
alter table usuarios_acessos enable row level security;
drop policy if exists ua_select on usuarios_acessos;
create policy ua_select on usuarios_acessos for select to authenticated
  using (user_id = auth.uid() or app_is_admin());

-- ---------------------------------------------------------------------
-- 3. predios / perfis — leitura necessária para os joins do useAuthAccess
-- ---------------------------------------------------------------------
alter table predios enable row level security;
drop policy if exists predios_select on predios;
create policy predios_select on predios for select to authenticated
  using (app_is_admin() or id = app_predio_id());

alter table perfis enable row level security;
drop policy if exists perfis_select on perfis;
create policy perfis_select on perfis for select to authenticated
  using (true); -- rótulos de cargo, não sensível; escrita só via API

-- ---------------------------------------------------------------------
-- 4. avisos — Realtime + leitura por prédio (escrita via API)
-- ---------------------------------------------------------------------
alter table avisos enable row level security;
drop policy if exists avisos_select on avisos;
create policy avisos_select on avisos for select to authenticated
  using (app_is_admin() or predio_id = app_predio_id());

-- ---------------------------------------------------------------------
-- 5. trocas_sala — o frontend grava DIRETO (anon key). Aqui está a
--    aplicação real da permissão 'edicao_grade' + isolamento por prédio.
-- ---------------------------------------------------------------------
alter table trocas_sala enable row level security;

drop policy if exists trocas_select on trocas_sala;
create policy trocas_select on trocas_sala for select to authenticated
  using (app_is_admin() or predio_id = app_predio_id());

drop policy if exists trocas_insert on trocas_sala;
create policy trocas_insert on trocas_sala for insert to authenticated
  with check (app_is_admin() or (app_has_modulo('edicao_grade') and predio_id = app_predio_id()));

drop policy if exists trocas_update on trocas_sala;
create policy trocas_update on trocas_sala for update to authenticated
  using      (app_is_admin() or (app_has_modulo('edicao_grade') and predio_id = app_predio_id()))
  with check (app_is_admin() or (app_has_modulo('edicao_grade') and predio_id = app_predio_id()));

drop policy if exists trocas_delete on trocas_sala;
create policy trocas_delete on trocas_sala for delete to authenticated
  using (app_is_admin() or (app_has_modulo('edicao_grade') and predio_id = app_predio_id()));

-- ---------------------------------------------------------------------
-- 6. Empréstimos — Realtime lê itens/registros; escrita é via API/RPC.
--    Isolamento por prédio (via categoria).
-- ---------------------------------------------------------------------
alter table emprestimo_categorias enable row level security;
drop policy if exists cat_select on emprestimo_categorias;
create policy cat_select on emprestimo_categorias for select to authenticated
  using (app_is_admin() or predio_id = app_predio_id());

alter table emprestimo_itens enable row level security;
drop policy if exists itens_select on emprestimo_itens;
create policy itens_select on emprestimo_itens for select to authenticated
  using (app_is_admin() or app_categoria_predio(categoria_id) = app_predio_id());

alter table emprestimos_registro enable row level security;
drop policy if exists reg_select on emprestimos_registro;
create policy reg_select on emprestimos_registro for select to authenticated
  using (app_is_admin() or app_item_predio(item_id) = app_predio_id());

-- ---------------------------------------------------------------------
-- 7. Tabelas sem acesso direto pela anon key — RLS habilitado sem policy
--    (nega tudo para anon/authenticated; só a service role/API acessa).
--    A grade em si é lida pelo frontend via CDN (JSON no Storage), não daqui.
-- ---------------------------------------------------------------------
alter table salas             enable row level security;
alter table grade             enable row level security;
alter table sistema_modulos   enable row level security;
alter table alunos_cache      enable row level security;

-- ---------------------------------------------------------------------
-- 8. Verificação — todas devem aparecer com rowsecurity = true
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--   and tablename in ('usuarios_acessos','predios','perfis','avisos','trocas_sala',
--     'emprestimo_categorias','emprestimo_itens','emprestimos_registro',
--     'salas','grade','sistema_modulos','alunos_cache')
--   order by tablename;
