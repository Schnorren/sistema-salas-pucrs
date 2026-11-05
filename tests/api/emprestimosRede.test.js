// Relatório de empréstimos da REDE (vários prédios), ponta a ponta:
// withAuth + /api/emprestimos/rede/* com Supabase falso (sem rede).
// O login da coordenação não tem prédio: vê só os pontos que o admin liberou,
// e nada do resto do módulo de empréstimos.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom, chamar } from './supabaseFalso.js';

const { default: emprestimos } = await import('../../api/emprestimos/index.js');

const P15 = '15151515-0000-4000-8000-000000000015';
const P9 = '09090909-0000-4000-8000-000000000009';
const P32 = '32323232-0000-4000-8000-000000000032';
const ponto = (id, predio_id, predio, nome = 'Recepção') => ({ id, predio_id, nome, ativo: true, predio: { nome: predio } });
const REC15 = ponto('aaaaaaaa-0000-4000-8000-000000000015', P15, 'Prédio 15');
const SEC15 = ponto('bbbbbbbb-0000-4000-8000-000000000015', P15, 'Prédio 15', 'Secretaria');
const REC9 = ponto('aaaaaaaa-0000-4000-8000-000000000009', P9, 'Prédio 9');
const REC32 = ponto('aaaaaaaa-0000-4000-8000-000000000032', P32, 'Prédio 32');
const TODOS = [REC15, SEC15, REC9, REC32];

const USUARIOS = {
  'tok-coord': { id: 'coord-1', email: 'coord@pucrs.br' },
  'tok-coord-vazia': { id: 'coord-2', email: 'coord2@pucrs.br' },
  'tok-admin': { id: 'admin-1', email: 'admin@pucrs.br' },
  'tok-membro': { id: 'membro-1', email: 'membro@pucrs.br' },
};
const ACESSOS = {
  'coord-1': { predio_id: null, permissoes: ['relatorio_emprestimos_rede'] },
  'coord-2': { predio_id: null, permissoes: ['relatorio_emprestimos_rede'] },
  'admin-1': { predio_id: null, permissoes: ['admin'] },
  'membro-1': { predio_id: P15, permissoes: ['grade', 'relatorios'] },
};
// Pontos liberados no Painel Admin (emprestimo_relatorio_rede_pontos)
const LIBERADOS = { 'coord-1': [REC9, REC15, REC32], 'coord-2': [] };

let rpcs;
beforeEach(() => {
  rpcs = [];
  supabase.auth.getUser = async (token) => {
    const user = USUARIOS[token];
    return user ? { data: { user }, error: null } : { data: { user: null }, error: Object.assign(new Error('invalid JWT'), { status: 401 }) };
  };
  supabase.from = fakeFrom((q) => {
    if (q.tabela === 'usuarios_acessos') return { data: ACESSOS[q.filtros.user_id] || null, error: null };
    if (q.tabela === 'emprestimo_relatorio_rede_pontos') {
      return { data: (LIBERADOS[q.filtros.user_id] || []).map(p => ({ ponto: p })), error: null };
    }
    if (q.tabela === 'emprestimo_pontos') {
      const doPredio = q.filtros.predio_id ? TODOS.filter(p => p.predio_id === q.filtros.predio_id) : TODOS;
      return { data: doPredio, error: null };
    }
    return { data: [], error: null };
  });
  supabase.rpc = async (nome, params) => {
    rpcs.push({ nome, params });
    return {
      data: {
        pontos: [{ id: REC15.id, nome: 'Recepção', predioId: P15, predio: 'Prédio 15' }], itens: [], registros: [],
        retiradasPorAluno: [], nomesDosAlunos: ['Fulano'],
      }, error: null,
    };
  };
});

const get = (token, url, query = {}) => chamar(emprestimos, { url, query, headers: { authorization: `Bearer ${token}` } });
const PERIODO = { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59' };

test('rede: a coordenação vê só os pontos liberados, por prédio (ordem numérica) e nome', async () => {
  const r = await get('tok-coord', '/api/emprestimos/rede/pontos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map(p => `${p.predioNome} · ${p.nome}`), ['Prédio 9 · Recepção', 'Prédio 15 · Recepção', 'Prédio 32 · Recepção']);
  assert.deepEqual(Object.keys(r.body[0]).sort(), ['ativo', 'id', 'nome', 'predioId', 'predioNome']);
});

test('rede: sem filtro, o relatório pede todos os liberados; o período vai em Brasília', async () => {
  const r = await get('tok-coord', '/api/emprestimos/rede/relatorio', PERIODO);
  assert.equal(r.status, 200);
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].nome, 'emprestimo_relatorio_rede');
  assert.deepEqual(new Set(rpcs[0].params.p_pontos), new Set([REC9.id, REC15.id, REC32.id]));
  assert.equal(rpcs[0].params.p_inicio, '2026-03-01T00:00:00-03:00');
  assert.equal(rpcs[0].params.p_fim, '2026-03-31T23:59:59.999-03:00');
  assert.ok(!('p_predio_id' in rpcs[0].params), 'o relatório da rede não usa o prédio do login');
  // Anônimo: só os campos do relatório, mesmo se o banco mandar algo a mais
  assert.deepEqual(Object.keys(r.body).sort(), ['itens', 'pontos', 'registros', 'retiradasPorAluno']);
});

test('rede: filtro por pontos liberados passa; ponto de fora (mesmo de prédio liberado) dá 403 sem consultar', async () => {
  const ok = await get('tok-coord', '/api/emprestimos/rede/relatorio', { ...PERIODO, pontos: `${REC9.id},${REC32.id}` });
  assert.equal(ok.status, 200);
  assert.deepEqual(rpcs[0].params.p_pontos, [REC9.id, REC32.id]);

  rpcs = [];
  const fora = await get('tok-coord', '/api/emprestimos/rede/relatorio', { ...PERIODO, pontos: `${REC9.id},${SEC15.id}` });
  assert.equal(fora.status, 403);
  const lixo = await get('tok-coord', '/api/emprestimos/rede/relatorio', { ...PERIODO, pontos: "x' or 1=1" });
  assert.equal(lixo.status, 403);
  assert.equal(rpcs.length, 0);
});

test('rede: login sem nenhum ponto liberado recebe aviso claro, não um relatório vazio', async () => {
  const r = await get('tok-coord-vazia', '/api/emprestimos/rede/relatorio', PERIODO);
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Nenhum ponto de empréstimo foi liberado/);
  assert.equal(rpcs.length, 0);
});

test('rede: a coordenação não usa o resto do módulo (relatório do prédio, balcão, gestão)', async () => {
  for (const url of ['/api/emprestimos/relatorio', '/api/emprestimos/pontos', '/api/emprestimos/painel', '/api/emprestimos/gestao']) {
    const r = await get('tok-coord', url, PERIODO);
    assert.equal(r.status, 403, url);
  }
  assert.equal(rpcs.length, 0);
});

test('rede: sem o módulo → 403 (mesmo com Relatórios no prédio); admin vê todos os pontos', async () => {
  assert.equal((await get('tok-membro', '/api/emprestimos/rede/pontos')).status, 403);
  assert.equal((await get('tok-membro', '/api/emprestimos/rede/relatorio', PERIODO)).status, 403);

  const admin = await get('tok-admin', '/api/emprestimos/rede/pontos');
  assert.equal(admin.status, 200);
  assert.equal(admin.body.length, TODOS.length);
});
