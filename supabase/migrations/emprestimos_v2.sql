-- Migração: empréstimos v2 — pontos de empréstimo, ocorrências e bloqueios
-- =====================================================================
-- Um prédio pode ter mais de um PONTO DE EMPRÉSTIMO com acesso próprio
-- (ex.: Recepção → jogos; Secretaria → carregadores). Cada ponto tem seu
-- acervo (categorias → itens), seus atendentes e seu limite de itens por aluno.
--
--   emprestimo_pontos          ponto do prédio (nome, limite_por_aluno, ativo)
--   emprestimo_ponto_usuarios  quais logins operam cada ponto
--   emprestimo_categorias      + ponto_id (o predio_id passa a vir do ponto)
--   emprestimo_itens           + ativo (baixa do acervo sem apagar histórico)
--   emprestimos_registro       + predio_id/ponto_id (preenchidos por trigger),
--                                balcão em coluna própria, ocorrência, encerramento
--   emprestimo_bloqueios       aluno suspenso dos empréstimos do prédio
--
-- Só EXPANDE o schema: o código já publicado continua funcionando (o trigger
-- preenche predio_id/ponto_id também nas retiradas da RPC antiga).
-- Os backfills de dados rodam UMA vez (marcador em app_migracoes), porque o
-- `npm run migrate` reaplica todos os arquivos a cada execução.
-- Rode ANTES de rls_policies.sql (a policy de registros usa estas tabelas).

-- ---------------------------------------------------------------------
-- 0. Marcador de migrações de dados (uma vez só)
-- ---------------------------------------------------------------------
create table if not exists app_migracoes (
    nome        text primary key,
    aplicada_em timestamptz not null default now()
);
alter table app_migracoes enable row level security;

-- ---------------------------------------------------------------------
-- 1. Pontos de empréstimo e quem opera cada um
-- ---------------------------------------------------------------------
create table if not exists emprestimo_pontos (
    id                uuid primary key default gen_random_uuid(),
    predio_id         uuid not null references predios(id) on delete cascade,
    nome              varchar(60) not null,
    limite_por_aluno  int not null default 1 check (limite_por_aluno between 1 and 20),
    ativo             boolean not null default true,
    created_at        timestamptz not null default now()
);
create unique index if not exists uq_emprestimo_pontos_nome on emprestimo_pontos (predio_id, lower(nome));
alter table emprestimo_pontos enable row level security;

create table if not exists emprestimo_ponto_usuarios (
    ponto_id    uuid not null references emprestimo_pontos(id) on delete cascade,
    user_id     uuid not null references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (ponto_id, user_id)
);
create index if not exists idx_emprestimo_ponto_usuarios_user on emprestimo_ponto_usuarios (user_id);
alter table emprestimo_ponto_usuarios enable row level security;

-- ---------------------------------------------------------------------
-- 2. Categoria pertence a um ponto (sem ON DELETE: ponto com acervo não some)
-- ---------------------------------------------------------------------
alter table emprestimo_categorias add column if not exists ponto_id uuid;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'emprestimo_categorias_ponto_id_fkey') then
        alter table emprestimo_categorias
            add constraint emprestimo_categorias_ponto_id_fkey foreign key (ponto_id) references emprestimo_pontos(id);
    end if;
end $$;

-- Backfill único: um ponto "Recepção" por prédio que já tem acervo, as
-- categorias vão para ele e quem já tinha o módulo Empréstimos é vinculado.
do $$
begin
    if not exists (select 1 from app_migracoes where nome = 'emprestimos_v2_pontos') then
        insert into emprestimo_pontos (predio_id, nome)
        select distinct c.predio_id, 'Recepção'
          from emprestimo_categorias c
         where not exists (select 1 from emprestimo_pontos p where p.predio_id = c.predio_id);

        update emprestimo_categorias c
           set ponto_id = (select p.id from emprestimo_pontos p
                            where p.predio_id = c.predio_id
                            order by p.created_at, p.id limit 1)
         where c.ponto_id is null;

        insert into emprestimo_ponto_usuarios (ponto_id, user_id)
        select p.id, ua.user_id
          from usuarios_acessos ua
          join emprestimo_pontos p on p.predio_id = ua.predio_id
         where 'emprestimos' = any(ua.permissoes)
        on conflict do nothing;

        insert into app_migracoes (nome) values ('emprestimos_v2_pontos');
    end if;
end $$;

alter table emprestimo_categorias alter column ponto_id set not null;
create index if not exists idx_emprestimo_categorias_ponto on emprestimo_categorias (ponto_id);

-- predio_id da categoria sempre igual ao do ponto (fonte única: o ponto)
create or replace function emprestimo_categoria_predio_do_ponto()
returns trigger language plpgsql set search_path = public as $$
begin
    select p.predio_id into new.predio_id from emprestimo_pontos p where p.id = new.ponto_id;
    if new.predio_id is null then
        raise exception 'Ponto de empréstimo inválido.';
    end if;
    return new;
end;
$$;
drop trigger if exists trg_emprestimo_categoria_predio on emprestimo_categorias;
create trigger trg_emprestimo_categoria_predio
    before insert or update of ponto_id, predio_id on emprestimo_categorias
    for each row execute function emprestimo_categoria_predio_do_ponto();

-- ---------------------------------------------------------------------
-- 3. Item: baixa do acervo (perdido de vez, descartado) sem apagar o histórico
-- ---------------------------------------------------------------------
alter table emprestimo_itens add column if not exists ativo boolean not null default true;

-- ---------------------------------------------------------------------
-- 4. Registro: local denormalizado, balcão, ocorrência e encerramento
-- ---------------------------------------------------------------------
alter table emprestimos_registro
    add column if not exists predio_id        uuid,
    add column if not exists ponto_id         uuid,
    add column if not exists balcao_retirada  varchar(60),
    add column if not exists balcao_devolucao varchar(60),
    add column if not exists ocorrencia       varchar(30),
    add column if not exists obs_devolucao    text,
    add column if not exists encerrado_em     timestamptz,
    add column if not exists encerrado_por    varchar(255);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'emprestimos_registro_predio_id_fkey') then
        alter table emprestimos_registro
            add constraint emprestimos_registro_predio_id_fkey foreign key (predio_id) references predios(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'emprestimos_registro_ponto_id_fkey') then
        alter table emprestimos_registro
            add constraint emprestimos_registro_ponto_id_fkey foreign key (ponto_id) references emprestimo_pontos(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'emprestimos_registro_ocorrencia_check') then
        alter table emprestimos_registro
            add constraint emprestimos_registro_ocorrencia_check
            check (ocorrencia is null or ocorrencia in ('DEVOLVIDO_COM_PROBLEMA', 'NAO_DEVOLVIDO'));
    end if;
end $$;

-- Prédio e ponto do registro = os do item NO MOMENTO da retirada. O trigger
-- cobre a RPC antiga (realizar_emprestimo) durante a transição.
create or replace function emprestimo_registro_local()
returns trigger language plpgsql set search_path = public as $$
begin
    if new.ponto_id is null or new.predio_id is null then
        select c.ponto_id, c.predio_id into new.ponto_id, new.predio_id
          from emprestimo_itens i
          join emprestimo_categorias c on c.id = i.categoria_id
         where i.id = new.item_id;
    end if;
    return new;
end;
$$;
drop trigger if exists trg_emprestimo_registro_local on emprestimos_registro;
create trigger trg_emprestimo_registro_local
    before insert on emprestimos_registro
    for each row execute function emprestimo_registro_local();

revoke all on function emprestimo_categoria_predio_do_ponto() from public, anon, authenticated;
revoke all on function emprestimo_registro_local() from public, anon, authenticated;

-- Backfills idempotentes (só tocam linhas ainda vazias)
update emprestimos_registro r
   set predio_id = c.predio_id,
       ponto_id  = c.ponto_id
  from emprestimo_itens i
  join emprestimo_categorias c on c.id = i.categoria_id
 where i.id = r.item_id
   and (r.ponto_id is null or r.predio_id is null);

-- Até aqui o balcão ia junto do e-mail: "fulano@pucrs.br · Balcão 1".
-- resp_* fica como está (histórico); o balcão é copiado para a coluna nova.
update emprestimos_registro
   set balcao_retirada = left(nullif(trim(substr(resp_retirada, strpos(resp_retirada, ' · ') + 3)), ''), 60)
 where balcao_retirada is null and strpos(resp_retirada, ' · ') > 0;
update emprestimos_registro
   set balcao_devolucao = left(nullif(trim(substr(resp_devolucao, strpos(resp_devolucao, ' · ') + 3)), ''), 60)
 where balcao_devolucao is null and strpos(coalesce(resp_devolucao, ''), ' · ') > 0;

create index if not exists idx_emprestimos_registro_ponto_status on emprestimos_registro (ponto_id, status);
create index if not exists idx_emprestimos_registro_predio_data  on emprestimos_registro (predio_id, data_retirada desc);
create index if not exists idx_emprestimos_registro_item_data    on emprestimos_registro (item_id, data_retirada desc);
create index if not exists idx_emprestimos_registro_ocorrencias  on emprestimos_registro (predio_id, matricula_aluno)
    where ocorrencia is not null;

-- Desfazer retirada (CANCELADO, fora das estatísticas) e "não devolveu" (EXTRAVIADO).
-- ADD VALUE fora de transação: o psql roda cada comando em autocommit.
alter type status_registro_emprestimo add value if not exists 'CANCELADO';
alter type status_registro_emprestimo add value if not exists 'EXTRAVIADO';

-- Troca de titular (emprestimo_transferir): o item passa de um aluno para
-- outro sem voltar ao balcão. O registro de quem passou fica TRANSFERIDO (não
-- é devolução: fica fora da previsão de volta, que só usa CONCLUIDO) e o do
-- novo aluno aponta para ele em transferido_de (desfazer a troca o reabre).
alter type status_registro_emprestimo add value if not exists 'TRANSFERIDO';
alter table emprestimos_registro add column if not exists transferido_de uuid;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'emprestimos_registro_transferido_de_fkey') then
        alter table emprestimos_registro
            add constraint emprestimos_registro_transferido_de_fkey foreign key (transferido_de) references emprestimos_registro(id);
    end if;
end $$;
create index if not exists idx_emprestimos_registro_transferido_de on emprestimos_registro (transferido_de)
    where transferido_de is not null;

-- ---------------------------------------------------------------------
-- 5. Bloqueio manual (vale para todos os pontos do prédio)
-- ---------------------------------------------------------------------
create table if not exists emprestimo_bloqueios (
    id            uuid primary key default gen_random_uuid(),
    predio_id     uuid not null references predios(id) on delete cascade,
    matricula     varchar(50) not null,
    motivo        varchar(300) not null,
    ate           date,                    -- null = até ser liberado
    criado_por    varchar(255),
    criado_em     timestamptz not null default now(),
    removido_por  varchar(255),
    removido_em   timestamptz
);
create index if not exists idx_emprestimo_bloqueios_ativos
    on emprestimo_bloqueios (predio_id, matricula) where removido_em is null;
alter table emprestimo_bloqueios enable row level security;

-- ---------------------------------------------------------------------
-- 6. Permissão de gestão (cadastro do acervo, limite, bloqueios)
-- ---------------------------------------------------------------------
insert into sistema_modulos (id, nome, icone, descricao)
values ('gestao_emprestimos', 'Gestão de Empréstimos', '🗃️',
        'Cadastrar pontos de empréstimo, categorias e itens, definir o limite por aluno e suspender alunos')
on conflict (id) do nothing;
