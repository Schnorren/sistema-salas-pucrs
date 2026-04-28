-- RPC: estatisticas_emprestimos
-- Calcula todas as agregações de relatório direto no banco.
-- Substitui o processamento em memória no servidor Vercel (api/emprestimos/estatisticas.js).
-- Parâmetros:
--   p_predio_id  — UUID do prédio
--   p_inicio     — início do período (timestamptz)
--   p_fim        — fim do período (timestamptz)

CREATE OR REPLACE FUNCTION estatisticas_emprestimos(
    p_predio_id UUID,
    p_inicio    TIMESTAMPTZ,
    p_fim       TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_emprestimos  INT;
    v_total_horas        NUMERIC;
    v_alunos_atendidos   INT;
    v_ranking_itens      JSON;
    v_ranking_horas      JSON;
    v_picos_dia          JSON;
    v_picos_horario      JSON;
    v_historico          JSON;
    v_alunos_unicos      JSON;
BEGIN
    -- Resumo geral
    SELECT
        COUNT(*)::INT,
        COALESCE(SUM(
            CASE WHEN er.data_devolucao IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (er.data_devolucao - er.data_retirada)) / 3600.0
                 ELSE 0
            END
        ), 0),
        COUNT(DISTINCT er.matricula_aluno)::INT
    INTO v_total_emprestimos, v_total_horas, v_alunos_atendidos
    FROM emprestimos_registro er
    JOIN emprestimo_itens      ei ON ei.id = er.item_id
    JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
    WHERE ec.predio_id = p_predio_id
      AND er.data_retirada BETWEEN p_inicio AND p_fim;

    -- Ranking por número de saídas (top 10)
    SELECT json_agg(row_to_json(r)) INTO v_ranking_itens FROM (
        SELECT ei.nome_item, COUNT(*)::INT AS total_saidas
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
        GROUP BY ei.nome_item
        ORDER BY total_saidas DESC
        LIMIT 10
    ) r;

    -- Ranking por horas de uso (top 10, só itens com devolução registrada)
    SELECT json_agg(row_to_json(r)) INTO v_ranking_horas FROM (
        SELECT
            ei.nome_item,
            ROUND(SUM(
                EXTRACT(EPOCH FROM (er.data_devolucao - er.data_retirada)) / 3600.0
            )::NUMERIC, 1) AS total_horas
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
          AND er.data_devolucao IS NOT NULL
        GROUP BY ei.nome_item
        HAVING SUM(EXTRACT(EPOCH FROM (er.data_devolucao - er.data_retirada))) > 0
        ORDER BY total_horas DESC
        LIMIT 10
    ) r;

    -- Picos por dia da semana (já em ordem Seg→Dom, PT-BR)
    SELECT json_agg(row_to_json(r) ORDER BY r.ord) INTO v_picos_dia FROM (
        SELECT
            CASE EXTRACT(DOW FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')
                WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
                WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex'
                WHEN 6 THEN 'Sáb'
            END AS dia_semana,
            CASE EXTRACT(DOW FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')
                WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3
                WHEN 4 THEN 4 WHEN 5 THEN 5 WHEN 6 THEN 6 WHEN 0 THEN 7
            END AS ord,
            COUNT(*)::INT AS quantidade
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
        GROUP BY EXTRACT(DOW FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')
        HAVING COUNT(*) > 0
    ) r;

    -- Picos por hora do dia (0h–23h)
    SELECT json_agg(row_to_json(r) ORDER BY r.hora_num) INTO v_picos_horario FROM (
        SELECT
            EXTRACT(HOUR FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')::INT AS hora_num,
            EXTRACT(HOUR FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')::TEXT || 'h' AS hora,
            COUNT(*)::INT AS quantidade
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
        GROUP BY EXTRACT(HOUR FROM er.data_retirada AT TIME ZONE 'America/Sao_Paulo')
    ) r;

    -- Histórico completo do período (para a tabela do relatório)
    SELECT json_agg(row_to_json(r) ORDER BY r."dataRetirada" DESC) INTO v_historico FROM (
        SELECT
            er.id,
            ei.nome_item   AS "nomeItem",
            ei.patrimonio,
            er.matricula_aluno AS matricula,
            er.nome_aluno      AS "nomeAluno",
            er.data_retirada   AS "dataRetirada",
            er.data_devolucao  AS "dataDevolucao"
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
    ) r;

    -- Alunos únicos com contagem de retiradas
    SELECT json_agg(row_to_json(r) ORDER BY r.total_retiradas DESC) INTO v_alunos_unicos FROM (
        SELECT
            er.matricula_aluno AS matricula,
            er.nome_aluno      AS nome,
            COUNT(*)::INT      AS total_retiradas
        FROM emprestimos_registro er
        JOIN emprestimo_itens      ei ON ei.id = er.item_id
        JOIN emprestimo_categorias ec ON ec.id = ei.categoria_id
        WHERE ec.predio_id = p_predio_id
          AND er.data_retirada BETWEEN p_inicio AND p_fim
        GROUP BY er.matricula_aluno, er.nome_aluno
    ) r;

    RETURN json_build_object(
        'resumo', json_build_object(
            'totalEmprestimos', v_total_emprestimos,
            'horasTotais',      ROUND(v_total_horas::NUMERIC, 2),
            'alunosAtendidos',  v_alunos_atendidos
        ),
        'rankingItens',       COALESCE(v_ranking_itens,    '[]'::JSON),
        'rankingHoras',       COALESCE(v_ranking_horas,    '[]'::JSON),
        'picos',              COALESCE(v_picos_dia,        '[]'::JSON),
        'picosHorario',       COALESCE(v_picos_horario,    '[]'::JSON),
        'tabelaHistorico',    COALESCE(v_historico,        '[]'::JSON),
        'tabelaAlunosUnicos', COALESCE(v_alunos_unicos,    '[]'::JSON)
    );
END;
$$;
