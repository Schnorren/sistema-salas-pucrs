// withAuth + /api/equipe ponta a ponta, com Supabase falso (sem rede).
// Regressão das correções de 2026-11-05: erro do handler não vira 401 com
// mensagem do banco; gestor comum não rebaixa nem remove administrador.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom, chamar, silenciarConsole } from './supabaseFalso.js';

const { withAuth } = await import('../../backend_core/middlewares/withAuth.js');
const { default: equipe } = await import('../../api/equipe/index.js');

const USUARIOS = {
  'tok-admin': { id: 'admin-1', email: 'admin@pucrs.br' },
  'tok-gestor': { id: 'gestor-1', email: 'gestor@pucrs.br' },
  'tok-membro': { id: 'membro-1', email: 'membro@pucrs.br' },
  // token próprio: o withAuth guarda a sessão em cache por token, e o teste do
  // banco fora do ar precisa de uma sessão que ainda não passou pelo cache
  'tok-membro-db': { id: 'membro-1', email: 'membro@pucrs.br' },
  'tok-coord': { id: 'coord-1', email: 'coord@pucrs.br' },
};
const EMAIL_PARA_ID = { 'admin@pucrs.br': 'admin-1', 'gestor@pucrs.br': 'gestor-1', 'membro@pucrs.br': 'membro-1', 'coord@pucrs.br': 'coord-1' };
let acessos;
let modoAuth;
let modoDb;
let escritas;

beforeEach(() => {
  acessos = {
    'admin-1': { user_id: 'admin-1', predio_id: null, permissoes: ['admin', 'equipe'] },
    'gestor-1': { user_id: 'gestor-1', predio_id: 'p15', permissoes: ['equipe', 'grade'] },
    'membro-1': { user_id: 'membro-1', predio_id: 'p15', permissoes: ['grade'] },
    // coordenação da recepção: relatório da rede, sem prédio
    'coord-1': { user_id: 'coord-1', predio_id: null, permissoes: ['relatorio_emprestimos_rede'] },
  };
  modoAuth = 'ok';
  modoDb = 'ok';
  escritas = [];
  supabase.auth.getUser = async (token) => {
    if (modoAuth === 'rede') return { data: { user: null }, error: Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 }) };
    const user = USUARIOS[token];
    return user ? { data: { user }, error: null } : { data: { user: null }, error: Object.assign(new Error('invalid JWT'), { status: 401 }) };
  };
  supabase.auth.admin.inviteUserByEmail = async () => ({ data: null, error: Object.assign(new Error('already been registered'), { status: 422 }) });
  supabase.auth.admin.listUsers = async () => ({ data: { users: Object.values(USUARIOS) }, error: null });
  supabase.auth.admin.updateUserById = async () => ({ data: {}, error: null });
  supabase.auth.resetPasswordForEmail = async () => ({ data: {}, error: null });
  supabase.from = fakeFrom((q) => {
    if (q.acao !== 'select') { escritas.push(q); return { data: null, error: null }; }
    if (q.tabela === 'usuarios_acessos') {
      if (modoDb === 'erro') return { data: null, error: { code: 'XX000', message: 'coluna secreta quebrou' } };
      const linha = acessos[q.filtros.user_id];
      if (q.single && !linha) return { data: null, error: { code: 'PGRST116' } };
      return { data: linha || null, error: null };
    }
    if (q.tabela === 'vw_equipe_predio') {
      const id = EMAIL_PARA_ID[q.filtros.email];
      const a = acessos[id];
      return a && a.predio_id === q.filtros.predio_id
        ? { data: { user_id: id, permissoes: a.permissoes }, error: null }
        : { data: null, error: { code: 'PGRST116' } };
    }
    if (q.tabela === 'sistema_modulos') return { data: [{ id: 'admin' }, { id: 'grade' }, { id: 'relatorio_emprestimos_rede' }], error: null };
    return { data: [], error: null };
  });
});

const auth = (token, extra = {}) => ({ authorization: `Bearer ${token}`, ...extra });
const eco = withAuth(async (req, res) => res.status(200).json(req.user), 'grade');

test('withAuth: sem token, esquema errado ou token inválido → 401', async () => {
  assert.equal((await chamar(eco)).status, 401);
  assert.equal((await chamar(eco, { headers: { authorization: 'Basic abc' } })).status, 401);
  const r = await chamar(eco, { headers: auth('tok-desconhecido') });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /Sessão expirada/);
});

test('withAuth: Auth ou banco fora do ar → 503, sem vazar o erro do banco', async (t) => {
  silenciarConsole(t);
  modoAuth = 'rede';
  assert.equal((await chamar(eco, { headers: auth('tok-rede-1') })).status, 503);
  modoAuth = 'ok';
  modoDb = 'erro';
  const r = await chamar(eco, { headers: auth('tok-membro-db') });
  assert.equal(r.status, 503);
  assert.doesNotMatch(JSON.stringify(r.body), /coluna secreta/);
});

test('withAuth: exceção do handler → 500 genérico (antes: 401 com a mensagem crua)', async (t) => {
  silenciarConsole(t);
  const explode = withAuth(async () => { throw new Error('duplicate key value violates unique constraint "segredo_idx"'); });
  const r = await chamar(explode, { headers: auth('tok-membro') });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /segredo_idx/);
});

test('withAuth: usuário comum não troca de prédio pelo header; admin precisa de uuid', async () => {
  const comum = await chamar(eco, { headers: auth('tok-membro', { 'x-predio-id': '00000000-0000-4000-8000-000000000032' }) });
  assert.equal(comum.body.predio_id, 'p15');
  const uuid = '11111111-2222-4333-8444-555555555555';
  assert.equal((await chamar(eco, { headers: auth('tok-admin', { 'x-predio-id': uuid }) })).body.predio_id, uuid);
  assert.equal((await chamar(eco, { headers: auth('tok-admin', { 'x-predio-id': "1' or 1=1" }) })).status, 400);
});

const comoGestor = (o) => chamar(equipe, { headers: auth('tok-gestor'), ...o });

test('equipe: gestor não edita admin (403)', async () => {
  acessos['admin-1'].predio_id = 'p15';
  const r = await comoGestor({ metodo: 'PUT', url: '/api/equipe/membro', body: { email: 'admin@pucrs.br', permissoes: ['grade'] } });
  assert.equal(r.status, 403);
  assert.equal(escritas.length, 0);
});

test('equipe: gestor não "reconvida" o admin global (o caso que derrubava o único admin)', async () => {
  const r = await comoGestor({ metodo: 'POST', url: '/api/equipe/convidar', body: { email: 'admin@pucrs.br', permissoes: ['grade'] } });
  assert.equal(r.status, 409);
  assert.equal(escritas.filter((e) => e.tabela === 'usuarios_acessos').length, 0);
});

test('equipe: ninguém revoga a si mesmo nem tira de si a Gestão de Equipe', async () => {
  assert.equal((await comoGestor({ metodo: 'DELETE', url: '/api/equipe/membro', body: { email: 'gestor@pucrs.br' } })).status, 400);
  assert.equal((await comoGestor({ metodo: 'PUT', url: '/api/equipe/membro', body: { email: 'gestor@pucrs.br', permissoes: ['grade'] } })).status, 400);
});

test('equipe: edição normal grava permissões sanitizadas e a auditoria antes de responder', async () => {
  const r = await comoGestor({ metodo: 'PUT', url: '/api/equipe/membro', body: { email: 'membro@pucrs.br', permissoes: ['avisos', 'admin', 'lixo'] } });
  assert.equal(r.status, 200);
  const update = escritas.find((e) => e.tabela === 'usuarios_acessos' && e.acao === 'update');
  assert.deepEqual(update.payload.permissoes, ['avisos']);
  assert.ok(escritas.some((e) => e.tabela === 'auditoria_log'));
});

test('equipe: gestor não "reconvida" o login da rede (prédio nulo) nem o revoga', async () => {
  const convite = await comoGestor({ metodo: 'POST', url: '/api/equipe/convidar', body: { email: 'coord@pucrs.br', permissoes: ['grade'] } });
  assert.equal(convite.status, 409);
  assert.equal(escritas.filter((e) => e.tabela === 'usuarios_acessos').length, 0);
  acessos['coord-1'].predio_id = 'p15';
  assert.equal((await comoGestor({ metodo: 'DELETE', url: '/api/equipe/membro', body: { email: 'coord@pucrs.br' } })).status, 403);
  assert.equal(escritas.filter((e) => e.tabela === 'usuarios_acessos').length, 0);
});

test('equipe: editar membro com o relatório da rede mantém o módulo; gestor não o concede a outro', async () => {
  acessos['coord-1'] = { user_id: 'coord-1', predio_id: 'p15', permissoes: ['grade', 'relatorio_emprestimos_rede'] };
  const r = await comoGestor({ metodo: 'PUT', url: '/api/equipe/membro', body: { email: 'coord@pucrs.br', permissoes: ['avisos'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(escritas.find((e) => e.tabela === 'usuarios_acessos').payload.permissoes, ['avisos', 'relatorio_emprestimos_rede']);

  escritas = [];
  await comoGestor({ metodo: 'PUT', url: '/api/equipe/membro', body: { email: 'membro@pucrs.br', permissoes: ['grade', 'relatorio_emprestimos_rede'] } });
  assert.deepEqual(escritas.find((e) => e.tabela === 'usuarios_acessos').payload.permissoes, ['grade']);
});

test('equipe: lista de módulos não mostra admin para gestor comum', async () => {
  const r = await comoGestor({ url: '/api/equipe/modulos' });
  assert.deepEqual(r.body.map((m) => m.id), ['grade']);
});
