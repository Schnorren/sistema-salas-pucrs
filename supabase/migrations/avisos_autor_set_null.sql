-- Avisos guardam quem criou e quem concluiu (criado_por / concluido_por →
-- auth.users). As FKs eram NO ACTION: excluir a conta de quem já criou ou
-- concluiu um aviso falhava no Auth ("Database error deleting user") — e o
-- Painel Admin exclui contas (DELETE /api/admin/usuarios).
--
-- Com ON DELETE SET NULL o aviso continua no mural/histórico, só sem o vínculo
-- com a conta apagada. Nenhuma tela lê essas colunas (o comentário de um aviso
-- leva o nome de quem comentou no próprio texto).
--
-- Idempotente: recria as duas constraints com o mesmo nome.

alter table public.avisos drop constraint if exists avisos_criado_por_fkey;
alter table public.avisos
    add constraint avisos_criado_por_fkey
    foreign key (criado_por) references auth.users(id) on delete set null;

alter table public.avisos drop constraint if exists avisos_concluido_por_fkey;
alter table public.avisos
    add constraint avisos_concluido_por_fkey
    foreign key (concluido_por) references auth.users(id) on delete set null;
