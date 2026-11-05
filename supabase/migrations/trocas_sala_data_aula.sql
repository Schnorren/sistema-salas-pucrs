-- Migração: adicionar data_aula na tabela trocas_sala
-- Objetivo: trocas de sala passam a ser por dia específico, não para o semestre inteiro.

-- 1. Adiciona a coluna data_aula (DATE) com padrão hoje para não quebrar registros existentes
ALTER TABLE trocas_sala
    ADD COLUMN IF NOT EXISTS data_aula DATE NOT NULL DEFAULT CURRENT_DATE;

-- 2. Remove a constraint de unicidade antiga (só aula_unique_key)
ALTER TABLE trocas_sala
    DROP CONSTRAINT IF EXISTS trocas_sala_aula_unique_key_key;

-- 3. Cria nova constraint de unicidade: aula + data do dia
--    SÓ no banco ainda sem a coluna `semana`: trocas_sala_semana.sql (que roda
--    logo depois) troca esta constraint por outra. Sem a guarda, o
--    `npm run migrate` recriava a constraint a cada execução e PARAVA aqui
--    assim que existissem duas trocas com a mesma chave criadas no mesmo dia
--    (ex.: a mesma aula registrada para esta semana e para a próxima).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'trocas_sala' AND column_name = 'semana')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trocas_sala_aula_data_unique') THEN
        ALTER TABLE trocas_sala
            ADD CONSTRAINT trocas_sala_aula_data_unique UNIQUE (aula_unique_key, data_aula);
    END IF;
END $$;

-- 4. Limpa registros antigos sem data (já foram para CURRENT_DATE pelo DEFAULT, mas
--    se quiser apagar tudo e começar limpo, descomente a linha abaixo)
-- DELETE FROM trocas_sala;

-- 5. Cria índice para busca por predio_id + data_aula (consulta mais comum)
CREATE INDEX IF NOT EXISTS idx_trocas_sala_predio_data
    ON trocas_sala (predio_id, data_aula);

-- 6. limpar_trocas_antigas() — a versão vigente (por semana) é criada em
--    trocas_sala_semana.sql, que roda logo depois. A versão original daqui
--    (DELETE ... WHERE data_aula < CURRENT_DATE, sem search_path) foi retirada:
--    como o `npm run migrate` reaplica tudo, ela voltava a valer por alguns
--    instantes a cada execução — e, chamada nessa janela pela Timeline, apagava
--    trocas ainda válidas (data_aula é a data em que a troca foi gravada).

-- 7. Colunas opcionais para impressão do cartaz
ALTER TABLE trocas_sala
    ADD COLUMN IF NOT EXISTS professor TEXT,
    ADD COLUMN IF NOT EXISTS cod_cred  TEXT;
