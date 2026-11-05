-- Migração: schema-base do módulo de empréstimos (versionamento)
-- =====================================================================
-- As 4 tabelas e os 2 enums do módulo foram criados à mão no painel do
-- Supabase, sem migration. Este arquivo descreve o que existe em produção
-- (tipos, tamanhos, defaults, FKs e índices conferidos no catálogo em
-- 2026-11-05) para que o schema do módulo fique no repositório.
--
-- Tudo é IF NOT EXISTS: no banco atual nada é recriado. A única mudança real é
-- remover dois índices duplicados criados à mão.
--
-- Fora do escopo: predios / usuarios_acessos (tabelas do núcleo do sistema).
-- Rode PRIMEIRO — ver ORDEM em scripts/migrate.mjs.

do $$
begin
    if not exists (select 1 from pg_type where typname = 'status_item_emprestimo') then
        create type status_item_emprestimo as enum ('DISPONIVEL', 'EMPRESTADO', 'MANUTENCAO', 'PERDIDO');
    end if;
    if not exists (select 1 from pg_type where typname = 'status_registro_emprestimo') then
        create type status_registro_emprestimo as enum ('ATIVO', 'CONCLUIDO', 'ATRASADO');
    end if;
end $$;

-- Em produção os ids usam uuid_generate_v4() (extensão uuid-ossp); aqui
-- gen_random_uuid() (nativo do Postgres 13+) para não depender da extensão.
create table if not exists emprestimo_categorias (
    id          uuid primary key default gen_random_uuid(),
    predio_id   uuid not null references predios(id) on delete cascade,
    nome        varchar(255) not null,
    descricao   text,
    ativo       boolean default true,
    created_at  timestamptz default now()
);

create table if not exists emprestimo_itens (
    id            uuid primary key default gen_random_uuid(),
    categoria_id  uuid references emprestimo_categorias(id) on delete cascade,
    patrimonio    varchar(100) not null unique,   -- "código" do item (único no sistema todo)
    nome_item     varchar(255) not null,
    status        status_item_emprestimo default 'DISPONIVEL',
    observacoes   text,
    created_at    timestamptz default now()
);

create table if not exists emprestimos_registro (
    id                uuid primary key default gen_random_uuid(),
    item_id           uuid references emprestimo_itens(id) on delete restrict,
    matricula_aluno   varchar(50) not null,
    nome_aluno        varchar(255) not null,
    documento_retido  varchar(255),
    data_retirada     timestamptz default now(),
    resp_retirada     varchar(255) not null,
    data_devolucao    timestamptz,
    resp_devolucao    varchar(255),
    status            status_registro_emprestimo default 'ATIVO',
    created_at        timestamptz default now()
);

-- Nome por matrícula (global: o mesmo aluno em qualquer prédio)
create table if not exists alunos_cache (
    matricula      varchar(50) primary key,
    nome           varchar(255) not null,
    ultimo_acesso  timestamptz default now()
);

create index if not exists idx_emp_cat_predio    on emprestimo_categorias (predio_id);
create index if not exists idx_emp_reg_matricula on emprestimos_registro (matricula_aluno);
create index if not exists idx_emp_reg_status    on emprestimos_registro (status);
create index if not exists idx_emprestimo_itens_categoria on emprestimo_itens (categoria_id);
create index if not exists idx_emprestimos_registro_item    on emprestimos_registro (item_id);
create index if not exists idx_emprestimos_registro_ativo_matricula
    on emprestimos_registro (matricula_aluno) where status = 'ATIVO';

-- Duplicados (criados à mão) de idx_emprestimo_itens_categoria e idx_emprestimos_registro_item
drop index if exists idx_emp_itens_cat;
drop index if exists idx_emp_reg_item;

-- Realtime: o balcão (useEmprestimos) assina mudanças destas duas tabelas
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emprestimo_itens') then
            alter publication supabase_realtime add table emprestimo_itens;
        end if;
        if not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emprestimos_registro') then
            alter publication supabase_realtime add table emprestimos_registro;
        end if;
    end if;
end $$;
