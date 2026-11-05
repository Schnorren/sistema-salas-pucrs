-- RPCs do módulo de empréstimos v2 (pontos de empréstimo)
-- =====================================================================
-- Toda regra que precisa ser atômica entre os PCs do balcão vive aqui:
--   emprestimo_retirar   trava o item; acervo ativo; bloqueio; limite do ponto
--   emprestimo_transferir troca de titular: o item passa para outro aluno sem voltar ao balcão
--   emprestimo_devolver  OK | COM_PROBLEMA (item → manutenção) | NAO_DEVOLVIDO (item → perdido)
--   emprestimo_cancelar  desfaz retirada em até 10 min (CANCELADO, fora das estatísticas);
--                        se a retirada veio de uma troca, o item volta para o titular anterior
--   emprestimo_reabrir   desfaz devolução em até 10 min, se o item não saiu de novo
--   emprestimo_estatisticas  relatório por prédio e pontos
--   emprestimo_uso_itens     uso por item (tela de gestão)
-- A janela de 10 min é espelhada em JANELA_DESFAZER_MIN (backend_core/utils/emprestimoRegras.js).
-- O service valida o acesso do usuário ao ponto; aqui vale o prédio (defesa em profundidade).
-- Rode DEPOIS de emprestimos_v2.sql.

-- ---------------------------------------------------------------------
-- Regra do aluno que vai ficar com um item do ponto (retirada e troca de
-- titular): suspensão no prédio e limite de itens por aluno no ponto. Só é
-- chamada de dentro das RPCs (roda como o dono delas); a trava por
-- matrícula vale até o fim da transação de quem chamou.
create or replace function emprestimo_validar_aluno(
    p_predio_id uuid,
    p_ponto_id  uuid,
    p_limite    int,
    p_matricula text
)
returns void language plpgsql set search_path = public as $$
declare
    v_bloq   emprestimo_bloqueios%rowtype;
    v_ativos int;
begin
    select * into v_bloq
      from emprestimo_bloqueios b
     where b.predio_id = p_predio_id and b.matricula = p_matricula and b.removido_em is null
       and (b.ate is null or b.ate >= (now() at time zone 'America/Sao_Paulo')::date)
     order by b.criado_em desc
     limit 1;
    if found then
        raise exception 'Aluno suspenso dos empréstimos%: %',
            case when v_bloq.ate is null then '' else ' até ' || to_char(v_bloq.ate, 'DD/MM/YYYY') end,
            v_bloq.motivo;
    end if;

    -- Serializa retiradas da mesma matrícula no mesmo ponto (fecha a janela
    -- entre a contagem abaixo e o INSERT de quem chamou)
    perform pg_advisory_xact_lock(hashtext('emprestimo:' || p_ponto_id::text || ':' || p_matricula));
    select count(*) into v_ativos
      from emprestimos_registro
     where ponto_id = p_ponto_id and matricula_aluno = p_matricula and status = 'ATIVO';
    if v_ativos >= p_limite then
        if p_limite = 1 then
            raise exception 'Este aluno já está com um item deste ponto. Registre a devolução antes de uma nova retirada.';
        end if;
        raise exception 'Este aluno já está com % itens deste ponto (limite: %).', v_ativos, p_limite;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
create or replace function emprestimo_retirar(
    p_predio_id uuid,
    p_item_id   uuid,
    p_matricula text,
    p_nome      text,
    p_resp      text,
    p_balcao    text
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_item   emprestimo_itens%rowtype;
    v_cat    emprestimo_categorias%rowtype;
    v_ponto  emprestimo_pontos%rowtype;
    v_mat    text := left(nullif(trim(coalesce(p_matricula, '')), ''), 50);
    v_nome   text := left(nullif(trim(coalesce(p_nome, '')), ''), 255);
    v_res    json;
begin
    if v_mat is null then raise exception 'Matrícula não informada.'; end if;
    if v_nome is null then raise exception 'Nome do aluno não informado.'; end if;

    -- Trava o item: duas retiradas simultâneas do mesmo item se enfileiram
    select * into v_item from emprestimo_itens where id = p_item_id for update;
    if not found then raise exception 'Item não encontrado.'; end if;

    select * into v_cat from emprestimo_categorias where id = v_item.categoria_id;
    select * into v_ponto from emprestimo_pontos where id = v_cat.ponto_id;
    if v_ponto.id is null or v_ponto.predio_id is distinct from p_predio_id then
        raise exception 'Item não pertence a este prédio.';
    end if;
    if not v_item.ativo or v_cat.ativo is false or not v_ponto.ativo then
        raise exception 'Este item não está mais no acervo.';
    end if;
    if v_item.status = 'EMPRESTADO' then
        raise exception 'Este item já está emprestado.';
    elsif v_item.status = 'MANUTENCAO' then
        raise exception 'Este item está em manutenção.';
    elsif v_item.status <> 'DISPONIVEL' then
        raise exception 'Este item não está disponível para empréstimo.';
    end if;

    -- Suspensão e limite do ponto (mesma regra da troca de titular)
    perform emprestimo_validar_aluno(p_predio_id, v_ponto.id, v_ponto.limite_por_aluno, v_mat);

    update emprestimo_itens set status = 'EMPRESTADO' where id = v_item.id;

    insert into emprestimos_registro
        (item_id, matricula_aluno, nome_aluno, documento_retido, resp_retirada, balcao_retirada,
         status, data_retirada, predio_id, ponto_id)
    values
        (v_item.id, v_mat, v_nome, 'Crachá Retido', left(coalesce(nullif(trim(p_resp), ''), 'Sistema'), 255),
         left(nullif(trim(coalesce(p_balcao, '')), ''), 60), 'ATIVO', now(), p_predio_id, v_ponto.id)
    returning row_to_json(emprestimos_registro.*) into v_res;

    -- Nome por matrícula (global), na mesma transação
    insert into alunos_cache (matricula, nome, ultimo_acesso)
    values (v_mat, v_nome, now())
    on conflict (matricula) do update set nome = excluded.nome, ultimo_acesso = excluded.ultimo_acesso;

    return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Troca de titular: o item passa do aluno do empréstimo para outro sem
-- voltar ao balcão (o crachá retido passa a ser o do novo aluno). Tudo numa
-- transação: o registro de quem passou fica TRANSFERIDO, encerrado agora, e
-- nasce um ATIVO para o novo aluno, ligado pelo transferido_de. O item fica
-- EMPRESTADO o tempo todo (o outro PC nunca o vê livre). Novo aluno suspenso
-- ou no limite do ponto → erro e nada muda. O item não passa pela conferência
-- do balcão: problema que aparecer depois fica com o novo titular.
create or replace function emprestimo_transferir(
    p_predio_id     uuid,
    p_emprestimo_id uuid,
    p_matricula     text,
    p_nome          text,
    p_resp          text,
    p_balcao        text
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_reg    emprestimos_registro%rowtype;
    v_ponto  emprestimo_pontos%rowtype;
    v_mat    text := left(nullif(trim(coalesce(p_matricula, '')), ''), 50);
    v_nome   text := left(nullif(trim(coalesce(p_nome, '')), ''), 255);
    v_resp   text := left(coalesce(nullif(trim(p_resp), ''), 'Sistema'), 255);
    v_balcao text := left(nullif(trim(coalesce(p_balcao, '')), ''), 60);
    v_res    json;
begin
    if v_mat is null then raise exception 'Matrícula não informada.'; end if;
    if v_nome is null then raise exception 'Nome do aluno não informado.'; end if;

    -- Trava o empréstimo: devolução ou outra troca simultânea esperam e,
    -- depois, encontram o registro já encerrado
    select * into v_reg from emprestimos_registro where id = p_emprestimo_id for update;
    if not found or v_reg.predio_id is distinct from p_predio_id then
        raise exception 'Empréstimo não encontrado.';
    end if;
    if v_reg.status <> 'ATIVO' then
        raise exception 'Este empréstimo já foi encerrado.';
    end if;
    if v_reg.matricula_aluno = v_mat then
        raise exception 'Este aluno já está com o item.';
    end if;

    select * into v_ponto from emprestimo_pontos where id = v_reg.ponto_id;
    if v_ponto.id is null then
        raise exception 'Empréstimo não encontrado.';
    end if;

    -- Suspensão e limite do ponto (mesma regra da retirada)
    perform emprestimo_validar_aluno(p_predio_id, v_ponto.id, v_ponto.limite_por_aluno, v_mat);

    update emprestimos_registro
       set status = 'TRANSFERIDO', data_devolucao = now(), resp_devolucao = v_resp, balcao_devolucao = v_balcao
     where id = v_reg.id;

    insert into emprestimos_registro
        (item_id, matricula_aluno, nome_aluno, documento_retido, resp_retirada, balcao_retirada,
         status, data_retirada, predio_id, ponto_id, transferido_de)
    values
        (v_reg.item_id, v_mat, v_nome, 'Crachá Retido', v_resp, v_balcao,
         'ATIVO', now(), v_reg.predio_id, v_reg.ponto_id, v_reg.id)
    returning row_to_json(emprestimos_registro.*) into v_res;

    insert into alunos_cache (matricula, nome, ultimo_acesso)
    values (v_mat, v_nome, now())
    on conflict (matricula) do update set nome = excluded.nome, ultimo_acesso = excluded.ultimo_acesso;

    return v_res;
end;
$$;

-- ---------------------------------------------------------------------
create or replace function emprestimo_devolver(
    p_predio_id     uuid,
    p_emprestimo_id uuid,
    p_resultado     text,
    p_obs           text,
    p_resp          text,
    p_balcao        text
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_reg       emprestimos_registro%rowtype;
    v_resultado text := upper(coalesce(nullif(trim(p_resultado), ''), 'OK'));
    v_obs       text := left(nullif(trim(coalesce(p_obs, '')), ''), 500);
    v_resp      text := left(coalesce(nullif(trim(p_resp), ''), 'Sistema'), 255);
    v_balcao    text := left(nullif(trim(coalesce(p_balcao, '')), ''), 60);
    v_res       json;
begin
    if v_resultado not in ('OK', 'COM_PROBLEMA', 'NAO_DEVOLVIDO') then
        raise exception 'Resultado de devolução inválido.';
    end if;
    if v_resultado <> 'OK' and v_obs is null then
        raise exception 'Descreva o que aconteceu.';
    end if;

    select * into v_reg from emprestimos_registro where id = p_emprestimo_id for update;
    if not found or v_reg.predio_id is distinct from p_predio_id then
        raise exception 'Empréstimo não encontrado.';
    end if;
    if v_reg.status <> 'ATIVO' then
        raise exception 'Este empréstimo já foi encerrado.';
    end if;

    if v_resultado = 'OK' then
        update emprestimo_itens set status = 'DISPONIVEL' where id = v_reg.item_id;
        update emprestimos_registro
           set status = 'CONCLUIDO', data_devolucao = now(), resp_devolucao = v_resp, balcao_devolucao = v_balcao
         where id = v_reg.id
        returning row_to_json(emprestimos_registro.*) into v_res;
    elsif v_resultado = 'COM_PROBLEMA' then
        -- Volta, mas não pode sair de novo até alguém conferir e liberar
        update emprestimo_itens
           set status = 'MANUTENCAO', observacoes = left('Devolvido com problema: ' || v_obs, 500)
         where id = v_reg.item_id;
        update emprestimos_registro
           set status = 'CONCLUIDO', data_devolucao = now(), resp_devolucao = v_resp, balcao_devolucao = v_balcao,
               ocorrencia = 'DEVOLVIDO_COM_PROBLEMA', obs_devolucao = v_obs
         where id = v_reg.id
        returning row_to_json(emprestimos_registro.*) into v_res;
    else
        -- Não voltou: item fica PERDIDO (sai da lista de empréstimo até ser encontrado)
        update emprestimo_itens
           set status = 'PERDIDO', observacoes = left('Não devolvido: ' || v_obs, 500)
         where id = v_reg.item_id;
        update emprestimos_registro
           set status = 'EXTRAVIADO', encerrado_em = now(), encerrado_por = v_resp, balcao_devolucao = v_balcao,
               ocorrencia = 'NAO_DEVOLVIDO', obs_devolucao = v_obs
         where id = v_reg.id
        returning row_to_json(emprestimos_registro.*) into v_res;
    end if;

    return v_res;
end;
$$;

-- ---------------------------------------------------------------------
create or replace function emprestimo_cancelar(
    p_predio_id     uuid,
    p_emprestimo_id uuid,
    p_resp          text,
    p_motivo        text
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_reg emprestimos_registro%rowtype;
    v_res json;
begin
    select * into v_reg from emprestimos_registro where id = p_emprestimo_id for update;
    if not found or v_reg.predio_id is distinct from p_predio_id then
        raise exception 'Empréstimo não encontrado.';
    end if;
    if v_reg.status <> 'ATIVO' then
        raise exception 'Só dá para desfazer um empréstimo que ainda está em andamento.';
    end if;
    if now() - v_reg.data_retirada > interval '10 minutes' then
        raise exception 'Passou o prazo para desfazer (10 min). Registre a devolução.';
    end if;

    if v_reg.transferido_de is not null then
        -- Desfaz uma troca de titular: o item continua fora, de volta com
        -- quem estava com ele antes (não fica livre no balcão)
        update emprestimos_registro
           set status = 'ATIVO', data_devolucao = null, resp_devolucao = null, balcao_devolucao = null
         where id = v_reg.transferido_de and status = 'TRANSFERIDO';
        if not found then
            raise exception 'Não foi possível devolver o item a quem estava com ele antes.';
        end if;
    else
        update emprestimo_itens set status = 'DISPONIVEL' where id = v_reg.item_id and status = 'EMPRESTADO';
    end if;
    update emprestimos_registro
       set status = 'CANCELADO', encerrado_em = now(),
           encerrado_por = left(coalesce(nullif(trim(p_resp), ''), 'Sistema'), 255),
           obs_devolucao = left(nullif(trim(coalesce(p_motivo, '')), ''), 500)
     where id = v_reg.id
    returning row_to_json(emprestimos_registro.*) into v_res;

    return v_res;
end;
$$;

-- ---------------------------------------------------------------------
create or replace function emprestimo_reabrir(
    p_predio_id     uuid,
    p_emprestimo_id uuid
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_reg    emprestimos_registro%rowtype;
    v_quando timestamptz;
    v_res    json;
begin
    select * into v_reg from emprestimos_registro where id = p_emprestimo_id for update;
    if not found or v_reg.predio_id is distinct from p_predio_id then
        raise exception 'Empréstimo não encontrado.';
    end if;
    if v_reg.status not in ('CONCLUIDO', 'EXTRAVIADO') then
        raise exception 'Só dá para desfazer uma devolução.';
    end if;
    v_quando := coalesce(v_reg.data_devolucao, v_reg.encerrado_em);
    if v_quando is null or now() - v_quando > interval '10 minutes' then
        raise exception 'Passou o prazo para desfazer (10 min).';
    end if;

    perform 1 from emprestimo_itens where id = v_reg.item_id for update;
    if exists (select 1 from emprestimos_registro where item_id = v_reg.item_id and status = 'ATIVO') then
        raise exception 'O item já foi emprestado de novo — não dá para desfazer esta devolução.';
    end if;

    update emprestimo_itens
       set status = 'EMPRESTADO',
           observacoes = case when v_reg.ocorrencia is not null then null else observacoes end
     where id = v_reg.item_id;
    update emprestimos_registro
       set status = 'ATIVO', data_devolucao = null, resp_devolucao = null, balcao_devolucao = null,
           ocorrencia = null, obs_devolucao = null, encerrado_em = null, encerrado_por = null
     where id = v_reg.id
    returning row_to_json(emprestimos_registro.*) into v_res;

    return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Relatório: mesmo JSON de estatisticas_emprestimos + filtro de pontos
-- (null = todos do prédio). Sem CANCELADO; EXTRAVIADO conta como empréstimo,
-- mas não soma horas. Ranking por item (não por nome). Nome do aluno vem do
-- alunos_cache (corrigido pela tela), com o do registro como reserva.
create or replace function emprestimo_estatisticas(
    p_predio_id uuid,
    p_pontos    uuid[],
    p_inicio    timestamptz,
    p_fim       timestamptz
)
returns json language plpgsql stable security definer set search_path = public as $$
-- Filtro do período (repetido em cada consulta, como na função antiga):
--   er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
declare
    v_resumo  json;
    v_itens   json;
    v_horas   json;
    v_dias    json;
    v_horario json;
    v_hist    json;
    v_alunos  json;
begin
    select json_build_object(
        'totalEmprestimos', count(*)::int,
        'horasTotais', round(coalesce(sum(extract(epoch from (er.data_devolucao - er.data_retirada)) / 3600.0)
                                      filter (where er.data_devolucao is not null), 0)::numeric, 2),
        'alunosAtendidos', count(distinct er.matricula_aluno)::int,
        'ocorrencias', (count(*) filter (where er.ocorrencia is not null))::int
    ) into v_resumo
      from emprestimos_registro er
     where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO';

    select json_agg(row_to_json(r)) into v_itens from (
        select ei.nome_item, count(*)::int as total_saidas
          from emprestimos_registro er join emprestimo_itens ei on ei.id = er.item_id
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
         group by ei.id, ei.nome_item
         order by total_saidas desc, ei.nome_item
         limit 10
    ) r;

    select json_agg(row_to_json(r)) into v_horas from (
        select ei.nome_item,
               round(sum(extract(epoch from (er.data_devolucao - er.data_retirada)) / 3600.0)::numeric, 1) as total_horas
          from emprestimos_registro er join emprestimo_itens ei on ei.id = er.item_id
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
           and er.data_devolucao is not null
         group by ei.id, ei.nome_item
        having sum(extract(epoch from (er.data_devolucao - er.data_retirada))) > 0
         order by total_horas desc
         limit 10
    ) r;

    select json_agg(row_to_json(r) order by r.ord) into v_dias from (
        select case extract(isodow from er.data_retirada at time zone 'America/Sao_Paulo')::int
                    when 1 then 'Seg' when 2 then 'Ter' when 3 then 'Qua' when 4 then 'Qui'
                    when 5 then 'Sex' when 6 then 'Sáb' else 'Dom' end as dia_semana,
               extract(isodow from er.data_retirada at time zone 'America/Sao_Paulo')::int as ord,
               count(*)::int as quantidade
          from emprestimos_registro er
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
         group by 1, 2
    ) r;

    select json_agg(row_to_json(r) order by r.hora_num) into v_horario from (
        select extract(hour from er.data_retirada at time zone 'America/Sao_Paulo')::int as hora_num,
               extract(hour from er.data_retirada at time zone 'America/Sao_Paulo')::int || 'h' as hora,
               count(*)::int as quantidade
          from emprestimos_registro er
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
         group by 1, 2
    ) r;

    select json_agg(row_to_json(r) order by r."dataRetirada" desc) into v_hist from (
        select er.id,
               ei.nome_item       as "nomeItem",
               ei.patrimonio,
               er.matricula_aluno as matricula,
               coalesce(ac.nome, er.nome_aluno) as "nomeAluno",
               er.data_retirada   as "dataRetirada",
               er.data_devolucao  as "dataDevolucao",
               er.status::text    as status,
               er.ocorrencia
          from emprestimos_registro er
          join emprestimo_itens ei on ei.id = er.item_id
          left join alunos_cache ac on ac.matricula = er.matricula_aluno
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
    ) r;

    select json_agg(row_to_json(r) order by r.total_retiradas desc, r.nome) into v_alunos from (
        select er.matricula_aluno as matricula,
               coalesce(max(ac.nome), max(er.nome_aluno)) as nome,
               count(*)::int as total_retiradas
          from emprestimos_registro er
          left join alunos_cache ac on ac.matricula = er.matricula_aluno
         where er.predio_id = p_predio_id and (p_pontos is null or er.ponto_id = any(p_pontos)) and er.data_retirada between p_inicio and p_fim and er.status <> 'CANCELADO'
         group by er.matricula_aluno
    ) r;

    return json_build_object(
        'resumo',             v_resumo,
        'rankingItens',       coalesce(v_itens,   '[]'::json),
        'rankingHoras',       coalesce(v_horas,   '[]'::json),
        'picos',              coalesce(v_dias,    '[]'::json),
        'picosHorario',       coalesce(v_horario, '[]'::json),
        'tabelaHistorico',    coalesce(v_hist,    '[]'::json),
        'tabelaAlunosUnicos', coalesce(v_alunos,  '[]'::json)
    );
end;
$$;

-- ---------------------------------------------------------------------
-- Uso por item (tela de gestão): vezes emprestado e último uso
create or replace function emprestimo_uso_itens(p_predio_id uuid)
returns table (item_id uuid, total bigint, ultimo timestamptz)
language sql stable security definer set search_path = public as $$
    select r.item_id, count(*), max(r.data_retirada)
      from emprestimos_registro r
     where r.predio_id = p_predio_id
       and r.status <> 'CANCELADO'
     group by r.item_id;
$$;

-- ---------------------------------------------------------------------
-- Só a API (service role) — ver regra no CLAUDE.md. emprestimo_validar_aluno
-- é interna: só as RPCs acima a chamam (como dono), nem a API — por isso sai
-- também do service_role (o Supabase concede EXECUTE a ele em função nova).
revoke all on function emprestimo_validar_aluno(uuid, uuid, int, text)          from public, anon, authenticated, service_role;
revoke all on function emprestimo_transferir(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function emprestimo_transferir(uuid, uuid, text, text, text, text) to service_role;
revoke all on function emprestimo_retirar(uuid, uuid, text, text, text, text)  from public, anon, authenticated;
revoke all on function emprestimo_devolver(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function emprestimo_cancelar(uuid, uuid, text, text)             from public, anon, authenticated;
revoke all on function emprestimo_reabrir(uuid, uuid)                          from public, anon, authenticated;
revoke all on function emprestimo_estatisticas(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function emprestimo_uso_itens(uuid)                              from public, anon, authenticated;
grant execute on function emprestimo_retirar(uuid, uuid, text, text, text, text)  to service_role;
grant execute on function emprestimo_devolver(uuid, uuid, text, text, text, text) to service_role;
grant execute on function emprestimo_cancelar(uuid, uuid, text, text)             to service_role;
grant execute on function emprestimo_reabrir(uuid, uuid)                          to service_role;
grant execute on function emprestimo_estatisticas(uuid, uuid[], timestamptz, timestamptz) to service_role;
grant execute on function emprestimo_uso_itens(uuid)                              to service_role;
