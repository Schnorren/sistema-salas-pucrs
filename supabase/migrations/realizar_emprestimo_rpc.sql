-- RPC: realizar_emprestimo
-- Registra a retirada de um item de forma atômica:
--   1. Trava o item (FOR UPDATE) e valida que está DISPONIVEL
--   2. Rejeita se a matrícula já possui empréstimo ATIVO no mesmo prédio
--      (regra: máximo 1 empréstimo ativo por aluno)
--   3. Marca o item como EMPRESTADO e cria o registro ATIVO
-- Se qualquer passo falhar, a transação inteira é revertida.
--
-- Antes desta migration a função existia apenas no banco (criada manualmente,
-- sem versionamento). Os DROPs cobrem assinaturas antigas para não deixar
-- sobrecarga duplicada (o PostgREST não resolve funções ambíguas).

DROP FUNCTION IF EXISTS realizar_emprestimo(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS realizar_emprestimo(TEXT, TEXT, TEXT, TEXT, TEXT);
-- A função original (criada manualmente) usava VARCHAR — sem este DROP ela
-- coexiste com a versão TEXT e o PostgREST falha com função ambígua (PGRST203)
DROP FUNCTION IF EXISTS realizar_emprestimo(UUID, CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING);

CREATE FUNCTION realizar_emprestimo(
    p_item_id    UUID,
    p_matricula  TEXT,
    p_nome_aluno TEXT,
    p_documento  TEXT,
    p_resp       TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item      emprestimo_itens%ROWTYPE;
    v_predio_id TEXT;
    v_resultado JSON;
BEGIN
    IF p_matricula IS NULL OR trim(p_matricula) = '' THEN
        RAISE EXCEPTION 'Matrícula não informada.';
    END IF;
    IF p_nome_aluno IS NULL OR trim(p_nome_aluno) = '' THEN
        RAISE EXCEPTION 'Nome do aluno não informado.';
    END IF;

    -- Busca e trava o item para impedir retirada dupla simultânea
    SELECT * INTO v_item
    FROM emprestimo_itens
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item não encontrado.';
    END IF;

    IF v_item.status <> 'DISPONIVEL' THEN
        RAISE EXCEPTION 'Item não está disponível para empréstimo.';
    END IF;

    SELECT c.predio_id::text INTO v_predio_id
    FROM emprestimo_categorias c
    WHERE c.id = v_item.categoria_id;

    -- Serializa retiradas concorrentes da mesma matrícula no mesmo prédio,
    -- fechando a janela entre a checagem abaixo e o INSERT.
    PERFORM pg_advisory_xact_lock(hashtext('emprestimo:' || coalesce(v_predio_id, '') || ':' || trim(p_matricula)));

    IF EXISTS (
        SELECT 1
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE er.status = 'ATIVO'
          AND er.matricula_aluno = trim(p_matricula)
          AND ec.predio_id::text = v_predio_id
    ) THEN
        RAISE EXCEPTION 'Este aluno já possui um empréstimo ativo. Registre a devolução antes de uma nova retirada.';
    END IF;

    UPDATE emprestimo_itens
    SET status = 'EMPRESTADO'
    WHERE id = p_item_id;

    INSERT INTO emprestimos_registro
        (item_id, matricula_aluno, nome_aluno, documento_retido, resp_retirada, status, data_retirada)
    VALUES
        (p_item_id, trim(p_matricula), trim(p_nome_aluno), p_documento, p_resp, 'ATIVO', NOW())
    RETURNING row_to_json(emprestimos_registro.*) INTO v_resultado;

    RETURN v_resultado;
END;
$$;

-- Índices de apoio (idempotentes) para as consultas do módulo:
--   - busca de empréstimo ativo por matrícula (consulta do wizard)
--   - joins registro→item e item→categoria (ativos, histórico, estatísticas)
CREATE INDEX IF NOT EXISTS idx_emprestimos_registro_ativo_matricula
    ON emprestimos_registro (matricula_aluno) WHERE status = 'ATIVO';
CREATE INDEX IF NOT EXISTS idx_emprestimos_registro_item
    ON emprestimos_registro (item_id);
CREATE INDEX IF NOT EXISTS idx_emprestimo_itens_categoria
    ON emprestimo_itens (categoria_id);
