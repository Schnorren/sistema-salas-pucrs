-- Migração: REPLICA IDENTITY FULL em trocas_sala — DELETE propagado via Realtime
-- =====================================================================
-- Por quê: o Timeline assina postgres_changes com filtro `predio_id=eq.<id>`.
-- Com REPLICA IDENTITY DEFAULT, o evento de DELETE carrega apenas a PK da linha
-- removida — o filtro por predio_id não casa e os OUTROS clientes conectados
-- nunca recebem a remoção (o aviso de troca continua na grade deles até um
-- refetch/remount). Com FULL, o registro antigo vai completo no evento de
-- DELETE: o filtro casa e a RLS consegue avaliar o prédio.
--
-- Custo: WAL um pouco maior em UPDATE/DELETE desta tabela — irrelevante para o
-- volume de trocas_sala. Idempotente (reaplicar é no-op).

ALTER TABLE trocas_sala REPLICA IDENTITY FULL;
