// Painel do balcão (service), com Supabase falso (sem rede).
// A previsão de volta vem da RPC emprestimo_duracoes_recentes (uma linha por
// item, já recortada no banco) — não de registros brutos: o painel é recarregado
// a cada minuto em cada PC, e os ~200 KB por recarga eram o maior consumo de
// tráfego do plano gratuito do Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom } from './supabaseFalso.js';

const { default: service } = await import('../../backend_core/services/emprestimos.service.js');
const { PREVISAO_VOLTA } = await import('../../backend_core/utils/emprestimoRegras.js');

const PREDIO = '11111111-2222-4333-8444-555555555555';
const RECEPCAO = 'aaaaaaaa-0000-4000-8000-000000000001';
const gestora = { id: 'u1', predio_id: PREDIO, permissoes: ['emprestimos', 'gestao_emprestimos'], is_admin: false };

const ITENS = [
  { id: 'bola1', nome_item: 'Bola 1', patrimonio: 'B1', status: 'DISPONIVEL', observacoes: null, ativo: true, categoria_id: 'pebolim',
    categoria: { id: 'pebolim', nome: 'Pebolim', ativo: true, ponto_id: RECEPCAO } },
  { id: 'bola2', nome_item: 'Bola 2', patrimonio: 'B2', status: 'DISPONIVEL', observacoes: null, ativo: true, categoria_id: 'pebolim',
    categoria: { id: 'pebolim', nome: 'Pebolim', ativo: true, ponto_id: RECEPCAO } },
];

const prepararBanco = (duracoes) => {
  const consultas = [];
  const rpcs = [];
  supabase.from = fakeFrom((q) => {
    consultas.push(q);
    if (q.tabela === 'emprestimo_pontos') return { data: [{ id: RECEPCAO, predio_id: PREDIO, nome: 'Recepção', limite_por_aluno: 1, ativo: true }], error: null };
    if (q.tabela === 'emprestimo_itens') return { data: ITENS, error: null };
    return { data: [], error: null };
  });
  supabase.rpc = async (nome, params) => { rpcs.push({ nome, params }); return { data: duracoes, error: null }; };
  return { consultas, rpcs };
};

test('painel: previsão vem da RPC, com os itens do ponto e os limites de PREVISAO_VOLTA', async () => {
  const { rpcs, consultas } = prepararBanco([{ item_id: 'bola1', minutos: [10, 20, 30, 40, 50] }]);
  const painel = await service.painel(gestora, RECEPCAO);

  assert.deepEqual(rpcs, [{
    nome: 'emprestimo_duracoes_recentes',
    params: { p_item_ids: ['bola1', 'bola2'], p_por_item: PREVISAO_VOLTA.porItem, p_min_min: PREVISAO_VOLTA.minMin, p_max_min: PREVISAO_VOLTA.maxMin },
  }]);
  // emprestimos_registro só é lido para os empréstimos em andamento (nada de histórico bruto)
  const registros = consultas.filter(q => q.tabela === 'emprestimos_registro');
  assert.ok(registros.every(q => q.filtros.status === 'ATIVO'), 'o painel não pode voltar a buscar devoluções brutas');

  const porId = Object.fromEntries(painel.itens.map(i => [i.id, i]));
  assert.equal(porId.bola1.mediana_min, 30);
  assert.equal(porId.bola1.amostras, 5);
  // Bola 2 sem histórico próprio: usa a categoria (Pebolim)
  assert.equal(porId.bola2.mediana_min, 30);
});

test('painel: sem histórico, sem previsão (e a RPC não quebra o painel)', async () => {
  prepararBanco([]);
  const painel = await service.painel(gestora, RECEPCAO);
  assert.ok(painel.itens.every(i => i.mediana_min === null && i.amostras === 0));
});

test('painel: erro da RPC não vira painel vazio silencioso', async () => {
  prepararBanco(null);
  supabase.rpc = async () => ({ data: null, error: { message: 'function emprestimo_duracoes_recentes does not exist' } });
  await assert.rejects(service.painel(gestora, RECEPCAO));
});
