// Troca de titular do empréstimo, ponta a ponta: withAuth + POST
// /api/emprestimos/transferir/:id com Supabase falso (sem rede). A regra
// atômica (suspensão, limite, item sempre emprestado) vive na RPC
// emprestimo_transferir; aqui vale o que é do handler e do service: prédio do
// withAuth, ponto que o usuário opera, campos normalizados e auditoria.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom, chamar, silenciarConsole } from './supabaseFalso.js';

const { default: emprestimos } = await import('../../api/emprestimos/index.js');

const P15 = '15151515-0000-4000-8000-000000000015';
const P9 = '09090909-0000-4000-8000-000000000009';
const RECEPCAO = { id: 'aaaaaaaa-0000-4000-8000-000000000015', predio_id: P15, nome: 'Recepção', limite_por_aluno: 1, ativo: true };
const SECRETARIA = { id: 'bbbbbbbb-0000-4000-8000-000000000015', predio_id: P15, nome: 'Secretaria', limite_por_aluno: 1, ativo: true };

const registro = (id, extra = {}) => ({
  id, item_id: 'item-sinuca', matricula_aluno: '111', nome_aluno: 'Ana Souza', status: 'ATIVO',
  data_retirada: '2026-11-05T13:00:00Z', predio_id: P15, ponto_id: RECEPCAO.id, transferido_de: null,
  item: { nome_item: 'Sinuca 1', patrimonio: 'SIN1' }, ...extra,
});
const REGISTROS = {
  'reg-ana': registro('reg-ana'),
  'reg-secretaria': registro('reg-secretaria', { ponto_id: SECRETARIA.id }),
  'reg-outro-predio': registro('reg-outro-predio', { predio_id: P9 }),
  'reg-encerrado': registro('reg-encerrado', { status: 'TRANSFERIDO' }),
  // Bruno recebeu o item da Ana numa troca (para desfazer)
  'reg-bruno': registro('reg-bruno', { matricula_aluno: '222', nome_aluno: 'Bruno Lima', transferido_de: 'reg-ana-antigo' }),
};

const USUARIOS = {
  'tok-balcao': { id: 'balcao-1', email: 'recepcao@pucrs.br' },
  'tok-grade': { id: 'grade-1', email: 'grade@pucrs.br' },
};
const ACESSOS = {
  'balcao-1': { predio_id: P15, permissoes: ['emprestimos'] },
  'grade-1': { predio_id: P15, permissoes: ['grade'] },
};
// O atendente opera só a Recepção (Gestão de Equipe)
const VINCULOS = { 'balcao-1': [RECEPCAO.id] };

let rpcs, auditoria, respostaRpc;
beforeEach(() => {
  rpcs = [];
  auditoria = [];
  respostaRpc = { data: { id: 'reg-novo', matricula_aluno: '22233', status: 'ATIVO' }, error: null };
  supabase.auth.getUser = async (token) => {
    const user = USUARIOS[token];
    return user ? { data: { user }, error: null } : { data: { user: null }, error: Object.assign(new Error('invalid JWT'), { status: 401 }) };
  };
  supabase.from = fakeFrom(resolverBase);
  supabase.rpc = async (nome, params) => { rpcs.push({ nome, params }); return respostaRpc; };
});

function resolverBase(q) {
  if (q.tabela === 'usuarios_acessos') return { data: ACESSOS[q.filtros.user_id] || null, error: null };
  if (q.tabela === 'emprestimo_pontos') return { data: [RECEPCAO, SECRETARIA], error: null };
  if (q.tabela === 'emprestimo_ponto_usuarios') {
    return { data: (VINCULOS[q.filtros.user_id] || []).map(ponto_id => ({ ponto_id })), error: null };
  }
  if (q.tabela === 'emprestimos_registro') return { data: REGISTROS[q.filtros.id] || null, error: null };
  if (q.tabela === 'auditoria_log') { auditoria.push(q.payload); return { data: null, error: null }; }
  return { data: [], error: null };
}

const transferir = (id, body, { token = 'tok-balcao', headers = {} } = {}) => chamar(emprestimos, {
  metodo: 'POST', url: `/api/emprestimos/transferir/${id}`, body,
  headers: { authorization: `Bearer ${token}`, 'x-balcao': encodeURIComponent('Balcão 2'), ...headers },
});

test('troca: chama a RPC com o prédio do withAuth, matrícula e nome normalizados e o balcão; audita de → para', async () => {
  const r = await transferir('reg-ana', { matricula: ' 222 33 ', nomeAluno: '  bruno   LIMA ' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.id, 'reg-novo');
  assert.deepEqual(rpcs, [{
    nome: 'emprestimo_transferir',
    params: {
      p_predio_id: P15, p_emprestimo_id: 'reg-ana', p_matricula: '22233', p_nome: 'Bruno Lima',
      p_resp: 'recepcao@pucrs.br', p_balcao: 'Balcão 2',
    },
  }]);
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].acao, 'emprestimo.transferir');
  assert.equal(auditoria[0].entidade_id, 'reg-novo');
  assert.deepEqual(auditoria[0].detalhes, { item: 'Sinuca 1', de: '111', para: '22233', anterior: 'reg-ana', balcao: 'Balcão 2' });
});

test('troca: x-predio-id forjado por quem não é admin não muda o prédio', async () => {
  const r = await transferir('reg-ana', { matricula: '22233', nomeAluno: 'Bruno' }, { headers: { 'x-predio-id': P9 } });
  assert.equal(r.status, 201);
  assert.equal(rpcs[0].params.p_predio_id, P15);
});

test('troca: mesma pessoa, sem matrícula ou sem nome são recusados antes da RPC', async (t) => {
  silenciarConsole(t);
  const mesma = await transferir('reg-ana', { matricula: '1 1 1', nomeAluno: 'Ana Souza' });
  assert.equal(mesma.status, 400);
  assert.match(mesma.body.error, /já está com o item/);
  assert.equal((await transferir('reg-ana', { matricula: '  ', nomeAluno: 'Bruno' })).status, 400);
  assert.equal((await transferir('reg-ana', { matricula: '22233', nomeAluno: 'B' })).status, 400);
  assert.equal(rpcs.length, 0);
  assert.equal(auditoria.length, 0);
});

test('troca: empréstimo de ponto que o atendente não opera (403), de outro prédio (404) ou encerrado (400)', async (t) => {
  silenciarConsole(t);
  assert.equal((await transferir('reg-secretaria', { matricula: '22233', nomeAluno: 'Bruno' })).status, 403);
  assert.equal((await transferir('reg-outro-predio', { matricula: '22233', nomeAluno: 'Bruno' })).status, 404);
  const encerrado = await transferir('reg-encerrado', { matricula: '22233', nomeAluno: 'Bruno' });
  assert.equal(encerrado.status, 400);
  assert.match(encerrado.body.error, /já foi encerrado/);
  assert.equal(rpcs.length, 0);
});

test('troca: sem o módulo de empréstimos é 403', async (t) => {
  silenciarConsole(t);
  const r = await transferir('reg-ana', { matricula: '22233', nomeAluno: 'Bruno' }, { token: 'tok-grade' });
  assert.equal(r.status, 403);
  assert.equal(rpcs.length, 0);
});

test('troca: recusa da RPC (aluno suspenso, limite) chega ao balcão com a mensagem e sem auditoria', async (t) => {
  silenciarConsole(t);
  respostaRpc = { data: null, error: { code: 'P0001', message: 'Aluno suspenso dos empréstimos: Perdeu uma bola' } };
  const r = await transferir('reg-ana', { matricula: '22233', nomeAluno: 'Bruno' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Aluno suspenso dos empréstimos: Perdeu uma bola');
  assert.equal(auditoria.length, 0);
});

test('desfazer uma troca (cancelar o registro novo) marca a auditoria como troca desfeita', async () => {
  respostaRpc = { data: { id: 'reg-bruno', status: 'CANCELADO' }, error: null };
  const r = await chamar(emprestimos, {
    metodo: 'POST', url: '/api/emprestimos/cancelar/reg-bruno', body: { motivo: 'Troca de titular desfeita no balcão' },
    headers: { authorization: 'Bearer tok-balcao' },
  });
  assert.equal(r.status, 200);
  assert.equal(rpcs[0].nome, 'emprestimo_cancelar');
  assert.equal(auditoria[0].acao, 'emprestimo.cancelar');
  assert.equal(auditoria[0].detalhes.trocaDesfeita, true);
});

test('histórico: a troca mostra para quem o item passou e de quem foi recebido (troca desfeita não conta)', async () => {
  const ana = registro('reg-a', { status: 'TRANSFERIDO', data_devolucao: '2026-11-05T13:25:00Z' });
  const bruno = registro('reg-b', {
    matricula_aluno: '222', nome_aluno: 'Bruno Lima', transferido_de: 'reg-a', data_retirada: '2026-11-05T13:25:00Z',
  });
  const consultas = [];
  supabase.from = fakeFrom((q) => {
    if (q.tabela !== 'emprestimos_registro') return resolverBase(q);
    consultas.push(q.em);
    if (q.em?.ponto_id) return { data: [bruno, ana], error: null }; // a página do histórico
    if (q.em?.id) return { data: [{ id: 'reg-a', nome_aluno: 'Ana Souza' }], error: null };
    if (q.em?.transferido_de) {
      return {
        data: [
          { transferido_de: 'reg-a', nome_aluno: 'Caio Melo', status: 'CANCELADO' }, // troca desfeita
          { transferido_de: 'reg-a', nome_aluno: 'Bruno Lima', status: 'ATIVO' },
        ], error: null,
      };
    }
    return { data: [], error: null };
  });
  const r = await chamar(emprestimos, {
    metodo: 'GET', url: `/api/emprestimos/historico?ponto=${RECEPCAO.id}`, query: { ponto: RECEPCAO.id },
    headers: { authorization: 'Bearer tok-balcao' },
  });
  assert.equal(r.status, 200);
  const [b, a] = r.body.itens;
  assert.equal(b.transferidoDe, 'reg-a');
  assert.equal(b.recebidoDe, 'Ana Souza');
  assert.equal(b.passouPara, null);
  assert.equal(a.status, 'TRANSFERIDO');
  assert.equal(a.passouPara, 'Bruno Lima');
  assert.deepEqual(consultas.slice(1), [{ id: ['reg-a'] }, { transferido_de: ['reg-a'] }]);
});

test('histórico sem troca não faz consulta extra', async () => {
  const consultas = [];
  supabase.from = fakeFrom((q) => {
    if (q.tabela !== 'emprestimos_registro') return resolverBase(q);
    consultas.push(q.em);
    return { data: [registro('reg-x', { status: 'CONCLUIDO', data_devolucao: '2026-11-05T13:30:00Z' })], error: null };
  });
  const r = await chamar(emprestimos, {
    metodo: 'GET', url: `/api/emprestimos/historico?ponto=${RECEPCAO.id}`, query: { ponto: RECEPCAO.id },
    headers: { authorization: 'Bearer tok-balcao' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.itens[0].recebidoDe, null);
  assert.equal(consultas.length, 1);
});
