-- RPC: grade_substituir — troca a grade de um prédio numa transação só
-- =====================================================================
-- Por quê: a importação do PDF fazia DELETE (limparGrade) e INSERT
-- (inserirGradeLote) em duas chamadas. Se o INSERT falhava (rede, constraint,
-- lote inválido), o prédio ficava com a grade VAZIA no banco — o JSON público
-- ainda era o antigo, mas a próxima republicação (ex.: mudar a visibilidade de
-- uma sala) publicava a grade vazia para todos. Aqui o DELETE e o INSERT são
-- uma transação: ou entra a grade nova inteira, ou fica a antiga.
--
-- Também recusa lote vazio e sala de outro prédio (defesa em profundidade
-- além do grade.service). Chamada só pela API (service role). Idempotente.

create or replace function grade_substituir(p_predio_id uuid, p_linhas jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
    v_qtd integer;
begin
    if p_predio_id is null then
        raise exception 'Prédio obrigatório para importar a grade.';
    end if;
    if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
        raise exception 'A nova grade está vazia — a grade atual foi mantida.';
    end if;
    if exists (
        select 1
          from jsonb_array_elements(p_linhas) l
          left join salas s on s.id = (l->>'sala_id')::uuid
         where s.id is null or s.predio_id is distinct from p_predio_id
    ) then
        raise exception 'A grade nova tem sala que não é deste prédio.';
    end if;

    delete from grade where predio_id = p_predio_id;

    insert into grade (sala_id, dia_semana, periodo, nome_aula, tipo, predio_id)
    select (l->>'sala_id')::uuid,
           l->>'dia_semana',
           l->>'periodo',
           l->>'nome_aula',
           coalesce(nullif(l->>'tipo', ''), 'Regular'),
           p_predio_id
      from jsonb_array_elements(p_linhas) l;

    get diagnostics v_qtd = row_count;
    return v_qtd;
end;
$$;

-- Só a API (service role) — ver regra no CLAUDE.md
revoke all on function grade_substituir(uuid, jsonb) from public, anon, authenticated;
grant execute on function grade_substituir(uuid, jsonb) to service_role;
