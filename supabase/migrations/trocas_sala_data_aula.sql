-- Migração: adicionar data_aula na tabela trocas_sala
-- Objetivo: trocas de sala passam a ser por dia específico, não para o semestre inteiro.

-- 1. Adiciona a coluna data_aula (DATE) com padrão hoje para não quebrar registros existentes
ALTER TABLE trocas_sala
    ADD COLUMN IF NOT EXISTS data_aula DATE NOT NULL DEFAULT CURRENT_DATE;

-- 2. Remove a constraint de unicidade antiga (só aula_unique_key)
ALTER TABLE trocas_sala
    DROP CONSTRAINT IF EXISTS trocas_sala_aula_unique_key_key;

-- 3. Cria nova constraint de unicidade: aula + data do dia
ALTER TABLE trocas_sala
    ADD CONSTRAINT trocas_sala_aula_data_unique UNIQUE (aula_unique_key, data_aula);

-- 4. Limpa registros antigos sem data (já foram para CURRENT_DATE pelo DEFAULT, mas
--    se quiser apagar tudo e começar limpo, descomente a linha abaixo)
-- DELETE FROM trocas_sala;

-- 5. Cria índice para busca por predio_id + data_aula (consulta mais comum)
CREATE INDEX IF NOT EXISTS idx_trocas_sala_predio_data
    ON trocas_sala (predio_id, data_aula);

-- 6. Função para limpar trocas antigas (chamada pelo frontend ao abrir a Timeline)
CREATE OR REPLACE FUNCTION limpar_trocas_antigas()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    DELETE FROM trocas_sala WHERE data_aula < CURRENT_DATE;
$$;

-- 7. Colunas opcionais para impressão do cartaz
ALTER TABLE trocas_sala
    ADD COLUMN IF NOT EXISTS professor TEXT,
    ADD COLUMN IF NOT EXISTS cod_cred  TEXT;
