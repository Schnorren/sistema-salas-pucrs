-- Funções de relatório de empréstimos que existiam SÓ no banco (criadas à mão,
-- nunca usadas pelo código) e foram removidas por emprestimos_limpeza.sql.
-- Definições extraídas do catálogo de produção em 2026-11-05, guardadas aqui
-- só como registro. NÃO está no ORDEM do scripts/migrate.mjs.
-- As RPCs antigas versionadas (realizar_emprestimo, concluir_devolucao,
-- estatisticas_emprestimos) continuam no histórico do git.

CREATE OR REPLACE FUNCTION public.fn_estatisticas_itens(p_predio_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(nome_item text, total_saidas bigint, total_horas numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        i.nome_item::TEXT, -- 🔥 CORREÇÃO: Forçando a conversão para TEXT
        COUNT(r.id)::BIGINT as total_saidas,
        ROUND(SUM(EXTRACT(EPOCH FROM (r.data_devolucao - r.data_retirada)) / 3600)::numeric, 1) as total_horas
    FROM public.emprestimos_registro r
    JOIN public.emprestimo_itens i ON i.id = r.item_id
    JOIN public.emprestimo_categorias c ON c.id = i.categoria_id
    WHERE r.status = 'CONCLUIDO' 
      AND c.predio_id = p_predio_id
      AND r.data_retirada >= p_inicio
      AND r.data_retirada <= p_fim
    GROUP BY i.nome_item;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_picos_atendimento(p_predio_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(dia_semana text, dia_num double precision, quantidade bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        to_char(r.data_retirada, 'Dy')::TEXT as dia_semana,
        EXTRACT(DOW FROM r.data_retirada)::DOUBLE PRECISION as dia_num,
        COUNT(r.id)::BIGINT as quantidade
    FROM public.emprestimos_registro r
    JOIN public.emprestimo_itens i ON i.id = r.item_id
    JOIN public.emprestimo_categorias c ON c.id = i.categoria_id
    WHERE c.predio_id = p_predio_id
      AND r.data_retirada >= p_inicio
      AND r.data_retirada <= p_fim
    GROUP BY dia_semana, dia_num
    ORDER BY dia_num;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_picos_horario(p_predio_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(hora text, quantidade bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        to_char(r.data_retirada, 'HH24:00') as hora,
        COUNT(r.id)::BIGINT as quantidade
    FROM public.emprestimos_registro r
    JOIN public.emprestimo_itens i ON i.id = r.item_id
    JOIN public.emprestimo_categorias c ON c.id = i.categoria_id
    WHERE c.predio_id = p_predio_id
      AND r.data_retirada >= p_inicio
      AND r.data_retirada <= p_fim
    GROUP BY hora
    ORDER BY hora;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resumo_emprestimos(p_predio_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(total_emprestimos bigint, alunos_unicos bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(r.id)::BIGINT as total_emprestimos,
        COUNT(DISTINCT r.matricula_aluno)::BIGINT as alunos_unicos -- 🔥 CORRIGIDO AQUI!
    FROM public.emprestimos_registro r
    JOIN public.emprestimo_itens i ON i.id = r.item_id
    JOIN public.emprestimo_categorias c ON c.id = i.categoria_id
    WHERE r.status = 'CONCLUIDO'
      AND c.predio_id = p_predio_id
      AND r.data_retirada >= p_inicio
      AND r.data_retirada <= p_fim;
END;
$function$
;
