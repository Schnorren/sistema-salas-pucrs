-- Migração: diretório de contatos institucionais (módulo Contatos)
-- =====================================================================
-- Diferente do resto do sistema, contatos NÃO tem predio_id: o diretório é
-- institucional (Escolas da PUCRS, cursos e serviços) e é o mesmo para todos
-- os prédios. Leitura liberada a qualquer usuário autenticado pela API;
-- escrita exige a permissão 'edicao_contatos'.
--
-- Estrutura em árvore de 2 níveis, via pai_id:
--   escola  "Escola de Ciências da Saúde e da Vida"
--     └ unidade  "Unidade de Atendimento – Odontologia"
--   local   "Prédio 15 – Living 360°"
--     └ servico  "PUCRS Carreiras"
--
-- RLS habilitada SEM policy: o front nunca lê estas tabelas com a anon key
-- (todo acesso passa por /api/contatos com a service role).

create table if not exists contatos (
    id             uuid primary key default gen_random_uuid(),
    -- Chave estável usada pelo seed para ser idempotente: reaplicar a carga
    -- inicial não sobrescreve nem duplica contatos editados pela interface.
    slug           text not null unique,
    tipo           text not null check (tipo in ('escola', 'unidade', 'local', 'servico')),
    pai_id         uuid references contatos(id) on delete cascade,
    nome           text not null,
    descricao      text,
    referencia     text,                       -- o "#" no mapa do Living 360 (ex: "1, 12")
    endereco       text,
    telefones      text[] not null default '{}',
    emails         text[] not null default '{}',
    whatsapp       text,
    horarios       text,                       -- texto livre: os formatos da fonte são heterogêneos
    ordem          int not null default 0,
    ativo          boolean not null default true,
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz,
    atualizado_por uuid
);

create index if not exists idx_contatos_pai   on contatos (pai_id);
create index if not exists idx_contatos_ordem on contatos (ordem, nome);

-- Índice curso -> Escola responsável. Serve ao caso de uso central:
-- "ligaram sobre o curso X, para qual Escola eu transfiro?".
create table if not exists contato_cursos (
    id         uuid primary key default gen_random_uuid(),
    contato_id uuid not null references contatos(id) on delete cascade,
    nome       text not null,
    criado_em  timestamptz not null default now(),
    unique (contato_id, nome)
);

create index if not exists idx_contato_cursos_contato on contato_cursos (contato_id);

alter table contatos       enable row level security;
alter table contato_cursos enable row level security;
-- Sem policies para authenticated/anon: acesso exclusivo da service role.

-- Permissão de edição do diretório. Segue o padrão de 'edicao_grade':
-- a visualização é livre, só a escrita é gated.
insert into sistema_modulos (id, nome, icone, descricao)
values ('edicao_contatos', 'Edição de Contatos', '📇',
        'Permite criar, editar e excluir contatos do diretório institucional')
on conflict (id) do nothing;
