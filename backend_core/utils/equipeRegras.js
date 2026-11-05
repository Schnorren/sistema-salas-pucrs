// Regras de autorização da Gestão de Equipe (/api/equipe) — funções puras,
// testadas em tests/equipeRegras.test.js. O handler só busca os dados e
// aplica a decisão: cada função devolve { status, error } para barrar ou
// null para seguir.
//
// Administrador do sistema (permissão 'admin') é gerenciado só por outro
// administrador, no Painel Admin. Sem estas travas, um gestor de equipe comum
// rebaixava o admin sem querer: editar o membro (o sanitizar tira 'admin' da
// lista), revogar o acesso (apaga a linha inteira de usuarios_acessos) ou
// "convidar" o e-mail dele (o upsert sobrescrevia prédio e permissões — o
// admin global tem prédio nulo e passava pela trava de "outro prédio").

export const MSG_ALVO_ADMIN = 'Este usuário é administrador do sistema. O acesso dele só pode ser alterado por um administrador, no Painel Admin.';
export const MSG_ALVO_REDE = 'Este usuário vê o relatório de empréstimos da rede (vários prédios). O acesso dele é ajustado por um administrador, no Painel Admin.';

export const ehAdmin = (permissoes) => Array.isArray(permissoes) && permissoes.includes('admin');
// Login do relatório da rede (ex.: coordenação da recepção): o acesso vale
// fora do prédio, então também mora no Painel Admin. Ver MODULOS_SO_ADMIN.
export const temRelatorioRede = (permissoes) => Array.isArray(permissoes) && permissoes.includes('relatorio_emprestimos_rede');

const barrar = (status, error) => ({ status, error });

// PUT/POST /membro — `alvo` = { user_id, permissoes } atual; `permissoesNovas`
// já sanitizadas.
export function barrarEdicaoDeMembro({ alvo, editorId, editorAdmin, permissoesNovas }) {
  if (ehAdmin(alvo?.permissoes) && !editorAdmin) return barrar(403, MSG_ALVO_ADMIN);
  // Quem gerencia a equipe não tira de si mesmo a própria gestão (ficaria sem
  // como desfazer; só um admin conseguiria devolver).
  if (alvo?.user_id && alvo.user_id === editorId && !editorAdmin && !(permissoesNovas || []).includes('equipe')) {
    return barrar(400, 'Você não pode remover a sua própria permissão de Gestão de Equipe.');
  }
  return null;
}

// DELETE /membro — "revogar deste prédio" apaga a linha inteira de
// usuarios_acessos: num admin, levaria junto o acesso global; no login da
// rede, o relatório dos outros prédios.
export function barrarRevogacao({ alvo, editorId, editorAdmin }) {
  if (ehAdmin(alvo?.permissoes)) {
    return editorAdmin
      ? barrar(400, 'Este usuário é administrador do sistema: revogar o acesso aqui removeria também o acesso global. Use o Painel Admin.')
      : barrar(403, MSG_ALVO_ADMIN);
  }
  if (temRelatorioRede(alvo?.permissoes)) {
    return editorAdmin
      ? barrar(400, 'Este usuário vê o relatório de empréstimos da rede: revogar o acesso aqui removeria também esse relatório. Use o Painel Admin.')
      : barrar(403, MSG_ALVO_REDE);
  }
  if (alvo?.user_id && alvo.user_id === editorId) return barrar(400, 'Você não pode revogar o seu próprio acesso.');
  return null;
}

// POST /convidar de quem já tem conta no Auth — `acessoAtual` = linha de
// usuarios_acessos ({ predio_id, permissoes }) ou null. O reconvite faz upsert
// de prédio + permissões: para um admin, é uma edição do acesso global, que
// mora no Painel Admin (mesmo para quem convida sendo admin).
export function barrarReconvite({ acessoAtual, predioId, editorAdmin }) {
  if (ehAdmin(acessoAtual?.permissoes)) {
    return editorAdmin
      ? barrar(409, 'Este usuário já é administrador do sistema — o acesso dele é ajustado no Painel Admin.')
      : barrar(409, MSG_ALVO_ADMIN);
  }
  // O login da rede tem prédio nulo e passaria pela trava de "outro prédio":
  // o upsert o prenderia a este prédio e tiraria o relatório da rede.
  if (temRelatorioRede(acessoAtual?.permissoes)) return barrar(409, MSG_ALVO_REDE);
  if (!editorAdmin && acessoAtual?.predio_id && acessoAtual.predio_id !== predioId) {
    return barrar(409, 'Usuário já pertence a outro prédio. Peça a um administrador.');
  }
  return null;
}
