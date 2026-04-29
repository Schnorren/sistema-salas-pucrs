-- RPC: concluir_devolucao
-- Conclui um empréstimo de forma atômica:
--   1. Muda o status do item para DISPONIVEL
--   2. Fecha o registro de empréstimo com status CONCLUIDO + data + responsável
-- Se qualquer um dos dois falhar, a transação inteira é revertida.

CREATE OR REPLACE FUNCTION concluir_devolucao(
    p_emprestimo_id UUID,
    p_resp_devolucao TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_emprestimo emprestimos_registro%ROWTYPE;
    v_resultado JSON;
BEGIN
    -- Busca e trava o registro para evitar devolução dupla simultânea
    SELECT * INTO v_emprestimo
    FROM emprestimos_registro
    WHERE id = p_emprestimo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empréstimo não encontrado.';
    END IF;

    IF v_emprestimo.status <> 'ATIVO' THEN
        RAISE EXCEPTION 'Este empréstimo já foi concluído.';
    END IF;

    -- Atualiza o item para DISPONIVEL
    UPDATE emprestimo_itens
    SET status = 'DISPONIVEL'
    WHERE id = v_emprestimo.item_id;

    -- Fecha o registro
    UPDATE emprestimos_registro
    SET
        status = 'CONCLUIDO',
        data_devolucao = NOW(),
        resp_devolucao = p_resp_devolucao
    WHERE id = p_emprestimo_id
    RETURNING row_to_json(emprestimos_registro.*) INTO v_resultado;

    RETURN v_resultado;
END;
$$;
