// Relatório de empréstimos (service), com Supabase falso (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, fakeFrom } from './supabaseFalso.js';

const { default: service } = await import('../../backend_core/services/emprestimos.service.js');
const { MAX_RETIRADAS_RELATORIO } = await import('../../backend_core/utils/limites.js');

const PREDIO = '11111111-2222-4333-8444-555555555555';
const RECEPCAO = 'aaaaaaaa-0000-4000-8000-000000000001';
const gestora = { id: 'u1', predio_id: PREDIO, permissoes: ['relatorios'], is_admin: false };

const prepararBanco = (respostaRpc) => {
  const chamadas = [];
  supabase.from = fakeFrom((q) => {
    if (q.tabela === 'emprestimo_pontos') return { data: [{ id: RECEPCAO, predio_id: PREDIO, nome: 'Recepção', limite_por_aluno: 1, ativo: true }], error: null };
    return { data: [], error: null };
  });
  supabase.rpc = async (nome, params) => { chamadas.push({ nome, params }); return { data: respostaRpc, error: null }; };
  return chamadas;
};

test('relatório: período em Brasília, fim inclui o minuto inteiro, prédio do withAuth', async () => {
  const chamadas = prepararBanco({ pontos: [], itens: [], registros: [], retiradasPorAluno: [] });
  await service.relatorio(gestora, { inicio: '2026-01-01T00:00', fim: '2026-12-31T23:59' });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].nome, 'emprestimo_relatorio');
  assert.deepEqual(chamadas[0].params, {
    p_predio_id: PREDIO, p_pontos: null,
    p_inicio: '2026-01-01T00:00:00-03:00', p_fim: '2026-12-31T23:59:59.999-03:00',
  });
});

test('relatório: só repassa os campos anônimos (nada de nome/matrícula, mesmo se o banco mandar)', async () => {
  prepararBanco({
    pontos: [{ id: RECEPCAO, nome: 'Recepção' }], itens: [],
    registros: [{ item: 'i1', ponto: RECEPCAO, retirada: '2026-03-02T13:00:00Z', devolucao: null, status: 'ATIVO', ocorrencia: null }],
    retiradasPorAluno: [1], tabelaAlunosUnicos: [{ nome: 'Fulano', matricula: '123' }],
  });
  const r = await service.relatorio(gestora, { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59' });
  assert.deepEqual(Object.keys(r).sort(), ['itens', 'pontos', 'registros', 'retiradasPorAluno']);
});

test('relatório: ponto de fora, período invertido e sem permissão são recusados', async () => {
  prepararBanco({ pontos: [], itens: [], registros: [], retiradasPorAluno: [] });
  await assert.rejects(service.relatorio(gestora, { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59', pontoId: 'outro' }), (e) => e.status === 403);
  await assert.rejects(service.relatorio(gestora, { inicio: '2026-03-31T00:00', fim: '2026-03-01T23:59' }), /início do período precisa ser antes do fim/);
  await assert.rejects(service.relatorio({ ...gestora, permissoes: ['grade'] }, { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59' }), (e) => e.status === 403);
  await assert.rejects(service.relatorio(gestora, { inicio: '', fim: '2026-03-31T23:59' }), /obrigatórios/);
});

test('relatório: período com retiradas demais pede um período menor (a resposta passaria de 4,5 MB)', async () => {
  const registros = Array.from({ length: MAX_RETIRADAS_RELATORIO + 1 }, () => ({}));
  prepararBanco({ pontos: [], itens: [], registros, retiradasPorAluno: [] });
  await assert.rejects(service.relatorio(gestora, { inicio: '2020-01-01T00:00', fim: '2026-12-31T23:59' }),
    (e) => e.status === 422 && /Escolha um período menor/.test(e.message));
});
