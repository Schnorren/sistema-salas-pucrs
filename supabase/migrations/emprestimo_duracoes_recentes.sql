-- RPC: emprestimo_duracoes_recentes — base da previsão de volta do balcão
-- =====================================================================
-- Por quê: o painel do balcão (GET /api/emprestimos/painel) é recarregado a
-- cada minuto em cada PC e a cada retirada/devolução. Para a previsão
-- ("costuma voltar em ~15 min") ele trazia até 1.500 registros brutos e
-- calculava a mediana em JS: ~200 KB por recarga, o maior consumo de tráfego
-- de saída do plano gratuito do Supabase. Aqui o banco já recorta e devolve
-- uma linha por item: { item_id, minutos: [...] }, até p_por_item durações
-- válidas (entre p_min_min e p_max_min minutos), da mais nova à mais antiga.
--
-- A regra continua uma só: calcularMedianas() em
-- backend_core/utils/emprestimoRegras.js (mediana; com poucas amostras, a da
-- categoria) — e é ela que passa os limites, via PREVISAO_VOLTA.
--
-- Usa idx_emprestimos_registro_item_data (item_id, data_retirada desc).
-- Chamada só pela API (service role). Idempotente.

create or replace function emprestimo_duracoes_recentes(
    p_item_ids uuid[],
    p_por_item integer default 30,
    p_min_min  numeric default 2,
    p_max_min  numeric default 720
)
returns table (item_id uuid, minutos float8[])
language sql
stable
set search_path = public
as $$
    select d.item_id, d.minutos
      from (
            select i.id as item_id,
                   array(
                       select round((extract(epoch from (r.data_devolucao - r.data_retirada)) / 60)::numeric, 2)::float8
                         from emprestimos_registro r
                        where r.item_id = i.id
                          and r.status = 'CONCLUIDO'
                          and r.data_devolucao is not null
                          and r.data_devolucao - r.data_retirada
                              between p_min_min * interval '1 minute' and p_max_min * interval '1 minute'
                        order by r.data_retirada desc
                        limit greatest(coalesce(p_por_item, 30), 0)
                   ) as minutos
              from (select distinct unnest(p_item_ids) as id) i
           ) d
     where cardinality(d.minutos) > 0;
$$;

-- Só a service role (ver a regra de REVOKE no CLAUDE.md: o Supabase concede
-- EXECUTE a anon/authenticated em toda função nova do schema public).
revoke all on function emprestimo_duracoes_recentes(uuid[], integer, numeric, numeric) from public, anon, authenticated;
grant execute on function emprestimo_duracoes_recentes(uuid[], integer, numeric, numeric) to service_role;
