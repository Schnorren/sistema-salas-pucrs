-- =====================================================================
-- Relatório de empréstimos v2: dados brutos do período, contas no front.
--
-- emprestimo_relatorio(prédio, pontos, início, fim) devolve
--   pontos:    pontos do relatório (null = todos do prédio)       [{ id, nome }]
--   itens:     acervo desses pontos + todo item que aparece numa retirada
--              do período (mesmo que hoje esteja em outra categoria)
--              [{ id, nome, patrimonio, categoria, ponto, ativo, criadoEm }]
--   registros: retiradas do período, sem CANCELADO, da mais nova à mais antiga
--              [{ item, ponto, retirada, devolucao, status, ocorrencia }]
--   retiradasPorAluno: quantas retiradas cada aluno fez no período, maior
--              primeiro ([12, 5, 1, …]) — dá alunos únicos, média e frequência.
--
-- SEM nome nem matrícula de aluno (decisão do usuário, 05/11/2026: dados
-- confidenciais não entram no relatório). Nem um código por aluno vai nos
-- registros: ligaria as retiradas de uma mesma pessoa.
--
-- Os totais, gráficos e tabelas saem de src/utils/relatorioEmprestimos.js
-- (funções puras, testadas). A anterior, emprestimo_estatisticas, devolvia
-- agregados prontos; fica até o deploy do código novo e depois é removida
-- em emprestimos_limpeza.sql.
--
-- `ponto` do registro é o do momento da retirada (trigger
-- trg_emprestimo_registro_local); o do item é o atual.
-- Idempotente (create or replace).
-- =====================================================================

create or replace function emprestimo_relatorio(
    p_predio_id uuid,
    p_pontos    uuid[],
    p_inicio    timestamptz,
    p_fim       timestamptz
)
returns json language sql stable security definer set search_path = public as $$
    with reg as (
        select er.*
          from emprestimos_registro er
         where er.predio_id = p_predio_id
           and (p_pontos is null or er.ponto_id = any(p_pontos))
           and er.data_retirada >= p_inicio
           and er.data_retirada <= p_fim
           and er.status <> 'CANCELADO'
    )
    select json_build_object(
        'pontos', coalesce((
            select json_agg(json_build_object('id', p.id, 'nome', p.nome) order by p.nome)
              from emprestimo_pontos p
             where p.predio_id = p_predio_id
               and (p_pontos is null or p.id = any(p_pontos))
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
             where (c.predio_id = p_predio_id and (p_pontos is null or c.ponto_id = any(p_pontos)))
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
revoke all on function emprestimo_relatorio(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function emprestimo_relatorio(uuid, uuid[], timestamptz, timestamptz) to service_role;
