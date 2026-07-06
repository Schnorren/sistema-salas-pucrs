-- Migração: trocas de sala passam a valer por SEMANA (não por dia)
-- =====================================================================
-- Por quê:
--   - A agenda é semanal-recorrente (dia_semana). Um aviso de troca deve
--     persistir a semana toda e sumir na virada da semana.
--   - A chave passa a ser estável ao re-import: o app grava
--     aula_unique_key = "<dia_semana>-<sala>-<periodo_inicial>", que independe
--     do texto de nome_aula (que muda quando a aula é alocada/reextraída).
--
-- `semana` = segunda-feira (ISO) da semana, no fuso de Brasília.
-- Aplicar DEPOIS de trocas_sala_data_aula.sql.

-- 1. Nova coluna `semana`
ALTER TABLE trocas_sala ADD COLUMN IF NOT EXISTS semana DATE;

-- 2. Backfill a partir de data_aula (ou hoje) para registros existentes
UPDATE trocas_sala
   SET semana = date_trunc('week', coalesce(data_aula, current_date))::date
 WHERE semana IS NULL;

ALTER TABLE trocas_sala ALTER COLUMN semana SET NOT NULL;
ALTER TABLE trocas_sala
    ALTER COLUMN semana SET DEFAULT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;

-- 3. Troca a constraint de unicidade: aula + semana (antes era aula + data_aula)
ALTER TABLE trocas_sala DROP CONSTRAINT IF EXISTS trocas_sala_aula_data_unique;
ALTER TABLE trocas_sala DROP CONSTRAINT IF EXISTS trocas_sala_aula_semana_unique;
ALTER TABLE trocas_sala
    ADD CONSTRAINT trocas_sala_aula_semana_unique UNIQUE (aula_unique_key, semana);

-- 4. Índice para a consulta mais comum (predio + semana)
CREATE INDEX IF NOT EXISTS idx_trocas_sala_predio_semana ON trocas_sala (predio_id, semana);

-- 5. data_aula deixa de ser usada pelo app (mantida por compatibilidade).
ALTER TABLE trocas_sala ALTER COLUMN data_aula DROP NOT NULL;

-- 6. Limpeza: apaga trocas de semanas anteriores (some na virada da semana).
--    Chamada pelo frontend ao abrir a Timeline.
CREATE OR REPLACE FUNCTION limpar_trocas_antigas()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    DELETE FROM trocas_sala
     WHERE semana < date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
$$;
