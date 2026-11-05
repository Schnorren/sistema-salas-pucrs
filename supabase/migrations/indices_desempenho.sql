-- Migração: índices das consultas por prédio (núcleo do sistema)
-- =====================================================================
-- Conferido no catálogo em 2026-11-05: `grade`, `salas` e `avisos` só tinham a
-- PK (e salas a UNIQUE (numero, predio_id), cuja 1ª coluna é numero — não
-- serve a "where predio_id = ?"). Toda consulta da API é por prédio:
--   grade  → publicar o JSON, importar o PDF (delete por prédio), busca do topo
--   salas  → listar/republicar (por prédio); cascata de delete para grade
--   avisos → mural (ativos do prédio) e histórico (concluídos, mais recentes)
-- Com um prédio só o ganho é pequeno; o sistema é multi-prédio por design e
-- vai para a PUCRS inteira. Só cria índice — idempotente, sem efeito em dados.

create index if not exists idx_grade_predio      on grade (predio_id);
create index if not exists idx_grade_sala        on grade (sala_id);   -- FK com ON DELETE CASCADE
create index if not exists idx_salas_predio      on salas (predio_id);
create index if not exists idx_avisos_predio_status_criado
    on avisos (predio_id, status, created_at);
create index if not exists idx_avisos_predio_concluidos
    on avisos (predio_id, concluido_em desc) where status = 'CONCLUIDO';
-- Gestão de Equipe: vw_equipe_predio filtra usuarios_acessos por prédio
create index if not exists idx_usuarios_acessos_predio on usuarios_acessos (predio_id);
