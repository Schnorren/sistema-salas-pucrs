-- Migração: unicidade de trocas_sala passa a incluir o PRÉDIO
-- =====================================================================
-- Por quê:
--   - aula_unique_key = "<dia_semana>-<sala>-<periodo_inicial>" NÃO inclui o
--     prédio. Com a unique antiga (aula_unique_key, semana), dois prédios com
--     salas de mesmo número colidiam (ex.: "Segunda-301-A"):
--       * usuário comum do 2º prédio era barrado pela RLS ao tentar registrar
--         a própria troca (o upsert virava UPDATE na linha do outro prédio);
--       * admin SOBRESCREVIA a troca do outro prédio (inclusive o predio_id).
--   - A unique correta é (predio_id, aula_unique_key, semana) — cada prédio
--     tem sua própria troca por aula/semana.
--
-- Aplicar DEPOIS de trocas_sala_semana.sql (que cria a constraint antiga).
-- O frontend usa onConflict 'predio_id,aula_unique_key,semana' — esta migração
-- precisa estar aplicada ANTES de publicar o front que a referencia.
-- Idempotente e re-executável.

ALTER TABLE trocas_sala DROP CONSTRAINT IF EXISTS trocas_sala_aula_semana_unique;
ALTER TABLE trocas_sala DROP CONSTRAINT IF EXISTS trocas_sala_predio_aula_semana_unique;
ALTER TABLE trocas_sala
    ADD CONSTRAINT trocas_sala_predio_aula_semana_unique UNIQUE (predio_id, aula_unique_key, semana);
