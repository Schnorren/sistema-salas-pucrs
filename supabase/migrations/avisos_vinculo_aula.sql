-- Autorização de chave vinculada à aula da grade (Mural → Linha do tempo).
-- Aditiva e idempotente: o código antigo continua funcionando sem estas colunas.
--   aula_chave  "<dia>-<sala>-<período inicial>" (mesma chave de trocas_sala)
--   data_fim    fim da vigência; null = por tempo indeterminado
--   recorrente  false = vale só em data_prevista; true = toda semana no dia da
--               aula_chave, de data_prevista até data_fim
-- data_prevista continua sendo o INÍCIO da vigência. RLS: a avisos_select por
-- prédio (rls_policies.sql) já cobre as colunas novas.
alter table public.avisos add column if not exists aula_chave text;
alter table public.avisos add column if not exists data_fim date;
alter table public.avisos add column if not exists recorrente boolean not null default false;
