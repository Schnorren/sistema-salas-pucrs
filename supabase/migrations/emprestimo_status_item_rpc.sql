-- RPC: emprestimo_status_item
-- Muda o status de um item de forma atômica:
--   DISPONIVEL ↔ MANUTENCAO, e PERDIDO → DISPONIVEL (item que reapareceu).
-- Antes, o service checava "tem empréstimo ativo?" e fazia o UPDATE em outra
-- chamada: com os 2 PCs da recepção, uma retirada podia entrar no meio e o item
-- ficava MANUTENCAO com um empréstimo ATIVO. Aqui o item é travado (FOR UPDATE,
-- a mesma trava da retirada), então as duas operações se enfileiram.
-- Valida também o prédio (defesa em profundidade além do service).

create or replace function emprestimo_status_item(
    p_predio_id uuid,
    p_item_id   uuid,
    p_status    text,
    p_obs       text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_item   emprestimo_itens%rowtype;
    v_predio uuid;
    v_status text := upper(trim(coalesce(p_status, '')));
    v_res    json;
begin
    if v_status not in ('DISPONIVEL', 'MANUTENCAO') then
        raise exception 'Status inválido. Use DISPONIVEL ou MANUTENCAO.';
    end if;

    select * into v_item from emprestimo_itens where id = p_item_id for update;
    if not found then
        raise exception 'Item não encontrado.';
    end if;

    select c.predio_id into v_predio from emprestimo_categorias c where c.id = v_item.categoria_id;
    if v_predio is distinct from p_predio_id then
        raise exception 'Item não pertence a este prédio.';
    end if;

    -- Checa o registro ATIVO (e não o status do item) para permitir corrigir
    -- item órfão (EMPRESTADO sem registro). Só a devolução libera item emprestado.
    if exists (select 1 from emprestimos_registro where item_id = p_item_id and status = 'ATIVO') then
        raise exception 'Item está emprestado. Registre a devolução antes de alterar o status.';
    end if;

    update emprestimo_itens
       set status      = v_status::status_item_emprestimo,
           observacoes = case when v_status = 'MANUTENCAO'
                              then nullif(left(trim(coalesce(p_obs, '')), 500), '')
                              else null end
     where id = p_item_id
    returning row_to_json(emprestimo_itens.*) into v_res;

    return v_res;
end;
$$;

-- Só a API (service role). Ver comentário em realizar_emprestimo_rpc.sql.
revoke all on function emprestimo_status_item(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function emprestimo_status_item(uuid, uuid, text, text) to service_role;
