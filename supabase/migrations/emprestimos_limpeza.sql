-- Migração: limpeza do módulo de empréstimos (fase 3 — contrato)
-- =====================================================================
-- Remove as RPCs da v1 (substituídas pelas de emprestimos_v2_rpcs.sql) e as
-- funções de relatório criadas à mão que o código nunca usou.
--
-- ⚠ APLICAR SÓ DEPOIS DO DEPLOY do código v2 (fases 0–2). Até lá, a versão
--   publicada da API ainda chama realizar_emprestimo / concluir_devolucao /
--   estatisticas_emprestimos — dropar antes quebra o balcão em produção.
--   Ordem: merge na main → esperar o deploy da Vercel terminar → npm run migrate.
--
-- Idempotente (IF EXISTS). As definições das funções criadas à mão estão em
-- supabase/legado/funcoes_emprestimo_removidas.sql; as versionadas, no git.

drop function if exists realizar_emprestimo(uuid, text, text, text, text);
drop function if exists concluir_devolucao(uuid, text);
drop function if exists estatisticas_emprestimos(uuid, timestamptz, timestamptz);

drop function if exists fn_resumo_emprestimos(uuid, timestamptz, timestamptz);
drop function if exists fn_estatisticas_itens(uuid, timestamptz, timestamptz);
drop function if exists fn_picos_atendimento(uuid, timestamptz, timestamptz);
drop function if exists fn_picos_horario(uuid, timestamptz, timestamptz);
