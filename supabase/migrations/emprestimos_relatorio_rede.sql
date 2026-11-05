-- =====================================================================
-- Relatório de empréstimos da REDE: um login que vê o relatório (anônimo)
-- de pontos de empréstimo escolhidos, de vários prédios.
--
-- Caso de uso: a coordenação da recepção acompanha os jogos retirados nas
-- recepções de todos os prédios (ex.: para apresentações), sem ser admin e
-- sem acesso a nada mais do sistema.
--
--   sistema_modulos            + 'relatorio_emprestimos_rede'. Só o admin
--                              concede ou retira (Painel Admin) — ver
--                              MODULOS_SO_ADMIN em backend_core/utils/modulos.js.
--   emprestimo_relatorio_rede_pontos
--                              (user_id, ponto_id): os pontos que cada login
--                              vê. Lista explícita, marcada pelo admin; ponto
--                              novo (prédio novo) não entra sozinho.
--   emprestimo_relatorio_rede(pontos, início, fim)
--                              mesmos dados de emprestimo_relatorio, mas pela
--                              lista de pontos (sem prédio) e com o prédio de
--                              cada ponto. ANÔNIMO como o outro: sem nome nem
--                              matrícula; retiradasPorAluno conta o aluno uma
--                              vez na rede inteira.
--
-- O login da rede tem predio_id nulo: withAuth não muda (as rotas que exigem
-- prédio continuam recusando). Tudo passa pela API (service role); a tabela
-- não tem policy e a função não é exposta à anon key.
-- Idempotente.
-- =====================================================================

insert into sistema_modulos (id, nome, icone, descricao)
values ('relatorio_emprestimos_rede', 'Relatório de Empréstimos da Rede', '🌐',
        'Ver o relatório de empréstimos (anônimo) dos pontos escolhidos, de vários prédios. Só o administrador concede, no Painel Admin.')
on conflict (id) do nothing;

create table if not exists emprestimo_relatorio_rede_pontos (
    user_id     uuid not null references auth.users(id) on delete cascade,
    ponto_id    uuid not null references emprestimo_pontos(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (user_id, ponto_id)
);
create index if not exists idx_emprestimo_relatorio_rede_pontos_ponto on emprestimo_relatorio_rede_pontos (ponto_id);

-- Sem policy: anon e authenticated não leem nem escrevem. Só a API.
alter table emprestimo_relatorio_rede_pontos enable row level security;
revoke all on table emprestimo_relatorio_rede_pontos from public, anon, authenticated;
grant select, insert, delete on table emprestimo_relatorio_rede_pontos to service_role;

-- Retiradas por ponto e período (o índice por prédio não serve aqui)
create index if not exists idx_emprestimos_registro_ponto_data on emprestimos_registro (ponto_id, data_retirada desc);

create or replace function emprestimo_relatorio_rede(
    p_pontos    uuid[],
    p_inicio    timestamptz,
    p_fim       timestamptz
)
returns json language sql stable security definer set search_path = public as $$
    -- p_pontos nulo ou vazio = nenhum ponto (nunca "todos")
    with reg as (
        select er.*
          from emprestimos_registro er
         where er.ponto_id = any(coalesce(p_pontos, '{}'::uuid[]))
           and er.data_retirada >= p_inicio
           and er.data_retirada <= p_fim
           and er.status <> 'CANCELADO'
    )
    select json_build_object(
        'pontos', coalesce((
            select json_agg(json_build_object('id', p.id, 'nome', p.nome, 'predioId', p.predio_id, 'predio', pr.nome)
                   order by pr.nome, p.nome)
              from emprestimo_pontos p
              join predios pr on pr.id = p.predio_id
             where p.id = any(coalesce(p_pontos, '{}'::uuid[]))
        ), '[]'::json),
        'itens', coalesce((
            select json_agg(json_build_object(
                       'id', i.id, 'nome', i.nome_item, 'patrimonio', i.patrimonio,
                       'categoria', c.nome, 'ponto', c.ponto_id,
                       'ativo', coalesce(i.ativo, true) and coalesce(c.ativo, true) and i.status <> 'PERDIDO',
                       'criadoEm', i.created_at)
                   order by c.nome, i.nome_item, i.patrimonio)
              from emprestimo_itens i
              join emprestimo_categorias c on c.id = i.categoria_id
             where c.ponto_id = any(coalesce(p_pontos, '{}'::uuid[]))
                or i.id in (select reg.item_id from reg)
        ), '[]'::json),
        'registros', coalesce((
            select json_agg(json_build_object(
                       'item', reg.item_id, 'ponto', reg.ponto_id,
                       'retirada', reg.data_retirada, 'devolucao', reg.data_devolucao,
                       'status', reg.status, 'ocorrencia', reg.ocorrencia)
                   order by reg.data_retirada desc)
              from reg
        ), '[]'::json),
        'retiradasPorAluno', coalesce((
            select json_agg(t.n order by t.n desc)
              from (select count(*)::int as n from reg group by reg.matricula_aluno) t
        ), '[]'::json)
    );
$$;

-- Só a API (service role) — ver regra no CLAUDE.md
revoke all on function emprestimo_relatorio_rede(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function emprestimo_relatorio_rede(uuid[], timestamptz, timestamptz) to service_role;
