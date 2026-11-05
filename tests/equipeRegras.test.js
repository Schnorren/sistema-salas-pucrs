// Travas da Gestão de Equipe (backend_core/utils/equipeRegras.js): um gestor
// comum não rebaixa nem remove administrador, e ninguém se tranca para fora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MSG_ALVO_ADMIN, MSG_ALVO_REDE, ehAdmin, temRelatorioRede, barrarEdicaoDeMembro, barrarRevogacao, barrarReconvite,
} from '../backend_core/utils/equipeRegras.js';
import { sanitizarPermissoes } from '../backend_core/utils/modulos.js';

const ADMIN = { user_id: 'admin-1', permissoes: ['admin', 'equipe'] };
const MEMBRO = { user_id: 'membro-1', permissoes: ['grade'] };
const GESTOR = { user_id: 'gestor-1', permissoes: ['equipe', 'grade'] };

test('ehAdmin só com a permissão admin', () => {
  assert.equal(ehAdmin(['admin']), true);
  assert.equal(ehAdmin(['equipe']), false);
  assert.equal(ehAdmin(null), false);
});

test('editar: gestor comum não mexe em admin; admin pode', () => {
  assert.deepEqual(
    barrarEdicaoDeMembro({ alvo: ADMIN, editorId: GESTOR.user_id, editorAdmin: false, permissoesNovas: ['grade'] }),
    { status: 403, error: MSG_ALVO_ADMIN },
  );
  assert.equal(barrarEdicaoDeMembro({ alvo: ADMIN, editorId: 'outro-admin', editorAdmin: true, permissoesNovas: ['admin'] }), null);
  assert.equal(barrarEdicaoDeMembro({ alvo: MEMBRO, editorId: GESTOR.user_id, editorAdmin: false, permissoesNovas: ['avisos'] }), null);
});

test('editar: gestor não tira de si a própria Gestão de Equipe', () => {
  const r = barrarEdicaoDeMembro({ alvo: GESTOR, editorId: GESTOR.user_id, editorAdmin: false, permissoesNovas: ['grade'] });
  assert.equal(r.status, 400);
  assert.equal(barrarEdicaoDeMembro({ alvo: GESTOR, editorId: GESTOR.user_id, editorAdmin: false, permissoesNovas: ['equipe', 'relatorios'] }), null);
});

test('revogar: admin nunca pela equipe (levaria o acesso global); ninguém revoga a si mesmo', () => {
  assert.equal(barrarRevogacao({ alvo: ADMIN, editorId: GESTOR.user_id, editorAdmin: false }).status, 403);
  assert.equal(barrarRevogacao({ alvo: ADMIN, editorId: 'outro-admin', editorAdmin: true }).status, 400);
  assert.equal(barrarRevogacao({ alvo: GESTOR, editorId: GESTOR.user_id, editorAdmin: false }).status, 400);
  assert.equal(barrarRevogacao({ alvo: MEMBRO, editorId: GESTOR.user_id, editorAdmin: false }), null);
});

test('reconvite: admin global (prédio nulo) não é rebaixado pelo convite', () => {
  // O caso que derrubava o único admin: prédio nulo passava pela trava antiga
  const adminGlobal = { predio_id: null, permissoes: ['admin', 'equipe'] };
  assert.deepEqual(barrarReconvite({ acessoAtual: adminGlobal, predioId: 'p15', editorAdmin: false }), { status: 409, error: MSG_ALVO_ADMIN });
  assert.equal(barrarReconvite({ acessoAtual: adminGlobal, predioId: 'p15', editorAdmin: true }).status, 409);
});

test('reconvite: outro prédio só com admin; sem acesso ou mesmo prédio segue', () => {
  assert.equal(barrarReconvite({ acessoAtual: { predio_id: 'p32', permissoes: [] }, predioId: 'p15', editorAdmin: false }).status, 409);
  assert.equal(barrarReconvite({ acessoAtual: { predio_id: 'p32', permissoes: [] }, predioId: 'p15', editorAdmin: true }), null);
  assert.equal(barrarReconvite({ acessoAtual: null, predioId: 'p15', editorAdmin: false }), null);
  assert.equal(barrarReconvite({ acessoAtual: { predio_id: 'p15', permissoes: ['grade'] }, predioId: 'p15', editorAdmin: false }), null);
  assert.equal(barrarReconvite({ acessoAtual: { predio_id: null, permissoes: [] }, predioId: 'p15', editorAdmin: false }), null);
});

// Login do relatório da rede (coordenação da recepção): vale fora do prédio,
// então só o admin mexe nele — como no caso do admin.
const COORD = { user_id: 'coord-1', permissoes: ['relatorio_emprestimos_rede'] };

test('rede: gestor não "reconvida" nem revoga o login da rede; admin é mandado ao Painel Admin', () => {
  assert.equal(temRelatorioRede(COORD.permissoes), true);
  assert.equal(temRelatorioRede(['relatorios']), false);
  // prédio nulo passaria pela trava de "outro prédio" e o upsert o prenderia a este prédio
  assert.deepEqual(barrarReconvite({ acessoAtual: { predio_id: null, ...COORD }, predioId: 'p15', editorAdmin: false }), { status: 409, error: MSG_ALVO_REDE });
  assert.equal(barrarReconvite({ acessoAtual: { predio_id: null, ...COORD }, predioId: 'p15', editorAdmin: true }).status, 409);
  assert.deepEqual(barrarRevogacao({ alvo: COORD, editorId: GESTOR.user_id, editorAdmin: false }), { status: 403, error: MSG_ALVO_REDE });
  assert.equal(barrarRevogacao({ alvo: COORD, editorId: 'admin-1', editorAdmin: true }).status, 400);
});

test('permissões: gestor comum não concede nem retira admin/relatório da rede; admin concede', () => {
  const REDE = 'relatorio_emprestimos_rede';
  // concede: descartado
  assert.deepEqual(sanitizarPermissoes(['grade', REDE, 'admin', 'lixo'], { permitirAdmin: false }), ['grade']);
  // retira: o que o membro já tinha fica (a tela do gestor nem mostra o módulo)
  assert.deepEqual(sanitizarPermissoes(['avisos'], { permitirAdmin: false, atuais: ['grade', REDE] }), ['avisos', REDE]);
  // admin nunca volta por `atuais`
  assert.deepEqual(sanitizarPermissoes(['grade'], { permitirAdmin: false, atuais: ['admin'] }), ['grade']);
  // admin concede qualquer módulo válido, sem repetidos
  assert.deepEqual(sanitizarPermissoes([REDE, 'admin', REDE, 'lixo'], { permitirAdmin: true }), [REDE, 'admin']);
});
