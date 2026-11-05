// Painel Admin e Contatos, com Supabase falso (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom } from './supabaseFalso.js';

const { default: adminService } = await import('../../backend_core/services/admin.service.js');
const { default: contatosService } = await import('../../backend_core/services/contatos.service.js');

const PREDIO = '11111111-2222-4333-8444-555555555555';

test('excluir prédio: lista o que ainda está vinculado e não apaga (FKs CASCADE/RESTRICT)', async () => {
  const acoes = [];
  supabase.from = fakeFrom((q) => {
    if (q.acao === 'delete') { acoes.push(`delete ${q.tabela}`); return { error: null }; }
    return { count: { avisos: 3, emprestimos_registro: 41 }[q.tabela] || 0, error: null };
  });
  await assert.rejects(adminService.deletarPredio(PREDIO), (e) => e.status === 400 && /3 aviso\(s\), 41 registro\(s\)/.test(e.message));
  assert.deepEqual(acoes, []);
});

test('excluir prédio limpo: apaga e remove o JSON público da grade', async () => {
  const acoes = [];
  supabase.from = fakeFrom((q) => {
    if (q.acao === 'delete') { acoes.push(`delete ${q.tabela}`); return { error: null }; }
    return { count: 0, error: null };
  });
  supabase.storage.from = () => ({ remove: async (arquivos) => { acoes.push(`storage ${arquivos.join(',')}`); return { error: null }; } });
  await adminService.deletarPredio(PREDIO);
  assert.deepEqual(acoes, ['delete predios', `storage grade_predio_${PREDIO}.json`]);
});

test('admin não tira de si a permissão de administrador; senha curta é recusada', async () => {
  supabase.auth.admin.updateUserById = async () => ({ data: {}, error: null });
  supabase.from = fakeFrom(() => ({ error: null }));
  await assert.rejects(adminService.atualizarUsuarioCompleto('admin-1', { permissoes: ['grade'] }, { id: 'admin-1' }), /própria permissão de administrador/);
  await assert.rejects(adminService.atualizarUsuarioCompleto('outro', { permissoes: [], senha: '1234567' }, { id: 'admin-1' }), /pelo menos 8/);
  assert.equal((await adminService.atualizarUsuarioCompleto('outro', { permissoes: ['grade'], senha: 'senha-boa-123' }, { id: 'admin-1' })).success, true);
});

test('relatório da rede: grava só pontos que existem, mexendo só no que mudou; sem o módulo, limpa', async () => {
  const PONTOS = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003'];
  let vinculados = [PONTOS[0], PONTOS[1]];
  const escritas = [];
  supabase.auth.admin.updateUserById = async () => ({ data: {}, error: null });
  supabase.from = fakeFrom((q) => {
    if (q.acao !== 'select') { escritas.push(q); return { error: null }; }
    if (q.tabela === 'emprestimo_pontos') return { data: PONTOS.map(id => ({ id, predio_id: PREDIO, nome: 'Recepção', ativo: true, predio: { nome: 'Prédio 15' } })), error: null };
    if (q.tabela === 'emprestimo_relatorio_rede_pontos') return { data: vinculados.map(ponto_id => ({ ponto_id })), error: null };
    return { error: null };
  });
  const coord = { permissoes: ['relatorio_emprestimos_rede'], pontosRede: [PONTOS[1], PONTOS[2], 'nao-existe', PONTOS[2]] };

  const r = await adminService.atualizarUsuarioCompleto('coord-1', coord, { id: 'admin-1' });
  assert.deepEqual(r.pontosRede, [PONTOS[1], PONTOS[2]]);
  const rede = escritas.filter(e => e.tabela === 'emprestimo_relatorio_rede_pontos');
  assert.deepEqual(rede.map(e => e.acao), ['delete', 'insert']);
  assert.deepEqual(rede[0].em.ponto_id, [PONTOS[0]]);
  assert.deepEqual(rede[1].payload, [{ user_id: 'coord-1', ponto_id: PONTOS[2] }]);

  // Lista ausente (cliente antigo): não mexe
  escritas.length = 0;
  assert.equal((await adminService.atualizarUsuarioCompleto('coord-1', { permissoes: ['relatorio_emprestimos_rede'] }, { id: 'admin-1' })).pontosRede, null);
  assert.equal(escritas.filter(e => e.tabela === 'emprestimo_relatorio_rede_pontos').length, 0);

  // Tirou o módulo: a lista vai junto
  escritas.length = 0;
  vinculados = [PONTOS[1]];
  assert.deepEqual((await adminService.atualizarUsuarioCompleto('coord-1', { permissoes: ['grade'], pontosRede: [PONTOS[1]] }, { id: 'admin-1' })).pontosRede, []);
  assert.deepEqual(escritas.filter(e => e.tabela === 'emprestimo_relatorio_rede_pontos').map(e => [e.acao, e.em?.ponto_id]), [['delete', [PONTOS[1]]]]);
});

// Conta nova pelo Painel Admin: Auth + acessos + pontos, num banco falso
const BALCAO_15 = 'cccccccc-0000-4000-8000-000000000015';
const BALCAO_9 = 'cccccccc-0000-4000-8000-000000000009';
function prepararCriacao({ erroInvite = null, erroCreate = null, erroAcesso = null } = {}) {
  const chamadas = { invite: [], create: [], deletados: [], escritas: [] };
  supabase.auth.admin.inviteUserByEmail = async (email, opcoes) => {
    chamadas.invite.push({ email, opcoes });
    return erroInvite ? { data: null, error: erroInvite } : { data: { user: { id: 'novo-1', email } }, error: null };
  };
  supabase.auth.admin.createUser = async (dados) => {
    chamadas.create.push(dados);
    return erroCreate ? { data: null, error: erroCreate } : { data: { user: { id: 'novo-1', email: dados.email } }, error: null };
  };
  supabase.auth.admin.deleteUser = async (id) => { chamadas.deletados.push(id); return { error: null }; };
  supabase.from = fakeFrom((q) => {
    if (q.acao !== 'select') {
      chamadas.escritas.push(q);
      return { error: q.tabela === 'usuarios_acessos' ? erroAcesso : null };
    }
    if (q.tabela === 'emprestimo_pontos') {
      const todos = [
        { id: BALCAO_15, predio_id: PREDIO, nome: 'Recepção', ativo: true, predio: { nome: 'Prédio 15' } },
        { id: BALCAO_9, predio_id: 'outro-predio', nome: 'Recepção', ativo: true, predio: { nome: 'Prédio 9' } },
      ];
      return { data: q.filtros.predio_id ? todos.filter(p => p.predio_id === q.filtros.predio_id) : todos, error: null };
    }
    return { data: [], error: null };
  });
  return chamadas;
}

test('criar conta por convite: e-mail normalizado, link do app, acessos e pontos do balcão só do prédio', async () => {
  process.env.APP_URL = 'https://salas.exemplo.br/';
  const c = prepararCriacao();
  const r = await adminService.criarUsuario({
    email: '  Fulana@PUCRS.br ', nome: ' Fulana  de Tal ', predioId: PREDIO,
    permissoes: ['emprestimos', 'grade', 'lixo'], pontosBalcao: [BALCAO_15, BALCAO_9],
  });
  delete process.env.APP_URL;
  assert.equal(r.modo, 'convite');
  assert.match(r.message, /Convite enviado para fulana@pucrs\.br/);
  assert.deepEqual(c.invite, [{ email: 'fulana@pucrs.br', opcoes: { data: { nome: 'Fulana de Tal' }, redirectTo: 'https://salas.exemplo.br' } }]);
  assert.equal(c.create.length, 0);
  const acesso = c.escritas.find(e => e.tabela === 'usuarios_acessos');
  assert.deepEqual(acesso.payload, { user_id: 'novo-1', predio_id: PREDIO, perfil_id: null, permissoes: ['emprestimos', 'grade'] });
  // ponto de outro prédio é descartado
  assert.deepEqual(c.escritas.find(e => e.tabela === 'emprestimo_ponto_usuarios' && e.acao === 'insert').payload, [{ ponto_id: BALCAO_15, user_id: 'novo-1' }]);
});

test('criar conta com senha: nenhum e-mail sai, e-mail já confirmado; senha curta nem chega ao Auth', async () => {
  const c = prepararCriacao();
  await assert.rejects(adminService.criarUsuario({ email: 'a@pucrs.br', predioId: PREDIO, permissoes: ['grade'], modo: 'senha', senha: '1234567' }), /pelo menos 8/);
  assert.equal(c.create.length, 0);

  const r = await adminService.criarUsuario({
    email: 'coord@pucrs.br', permissoes: ['relatorio_emprestimos_rede'], pontosRede: [BALCAO_15, 'nao-existe'], modo: 'senha', senha: 'senha-boa-123',
  });
  assert.equal(r.modo, 'senha');
  assert.equal(c.invite.length, 0);
  assert.deepEqual(c.create, [{ email: 'coord@pucrs.br', password: 'senha-boa-123', email_confirm: true, user_metadata: {} }]);
  assert.deepEqual(r.pontosRede, [BALCAO_15]);
});

test('criar conta: sem prédio só com admin ou relatório da rede; sem módulo nenhum é recusado', async () => {
  const c = prepararCriacao();
  await assert.rejects(adminService.criarUsuario({ email: 'x@pucrs.br', permissoes: ['grade'] }), (e) => e.status === 400 && /Escolha o prédio/.test(e.message));
  await assert.rejects(adminService.criarUsuario({ email: 'x@pucrs.br', predioId: PREDIO, permissoes: [] }), /pelo menos um módulo/);
  await assert.rejects(adminService.criarUsuario({ email: 'sem-arroba', predioId: PREDIO, permissoes: ['grade'] }), /E-mail inválido/);
  assert.equal(c.invite.length + c.create.length, 0);
  // admin sem prédio pode
  assert.equal((await adminService.criarUsuario({ email: 'adm2@pucrs.br', permissoes: ['admin'] })).permissoes[0], 'admin');
});

test('criar conta: e-mail que já tem conta dá 409 (não sobrescreve); limite de e-mail sugere a senha', async () => {
  let c = prepararCriacao({ erroInvite: Object.assign(new Error('A user with this email address has already been registered'), { status: 422, code: 'email_exists' }) });
  await assert.rejects(adminService.criarUsuario({ email: 'ja@pucrs.br', predioId: PREDIO, permissoes: ['grade'] }), (e) => e.status === 409 && /Editar Acesso/.test(e.message));
  assert.equal(c.escritas.length, 0);

  c = prepararCriacao({ erroInvite: Object.assign(new Error('email rate limit exceeded'), { status: 429 }) });
  await assert.rejects(adminService.criarUsuario({ email: 'b@pucrs.br', predioId: PREDIO, permissoes: ['grade'] }), (e) => e.status === 429 && /Definir a senha agora/.test(e.message));

  c = prepararCriacao({ erroCreate: Object.assign(new Error('Password is known to be weak'), { status: 422, code: 'weak_password' }) });
  await assert.rejects(adminService.criarUsuario({ email: 'c@pucrs.br', predioId: PREDIO, permissoes: ['grade'], modo: 'senha', senha: 'senha-boa-123' }), /fraca/);
});

test('criar conta: se os acessos não gravam, a conta do Auth é desfeita', async (t) => {
  t.mock.method(console, 'error', () => {});
  const c = prepararCriacao({ erroAcesso: { code: 'XX000', message: 'falhou' } });
  await assert.rejects(adminService.criarUsuario({ email: 'd@pucrs.br', predioId: PREDIO, permissoes: ['grade'] }));
  assert.deepEqual(c.deletados, ['novo-1']);
});

test('contatos: a API não troca o tipo de um contato (árvore escola→unidade, local→serviço)', async () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  supabase.from = fakeFrom((q) => {
    if (q.maybe) return { data: { id: ID, tipo: 'escola', nome: 'Escola X', pai_id: null }, error: null };
    if (q.acao === 'update') return { data: [{ id: ID, nome: q.payload.nome, tipo: q.payload.tipo }], error: null };
    return { error: null };
  });
  await assert.rejects(contatosService.atualizarContato(ID, { tipo: 'local', nome: 'Escola X' }, { id: 'u' }), /tipo de um contato não pode ser alterado/);
  const r = await contatosService.atualizarContato(ID, { tipo: 'escola', nome: 'Escola X (nova)' }, { id: 'u' });
  assert.equal(r.nome, 'Escola X (nova)');
});
