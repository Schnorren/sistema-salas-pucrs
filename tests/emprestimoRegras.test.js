// Regras puras do módulo de empréstimos (backend_core/utils/emprestimoRegras.js),
// usadas pelo front e pelo back. Datas de exibição no fuso de Brasília.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutosEntre, formatarDuracao, rotuloDataHora, inputDataHoraSP, inputInicioDoDiaSP, resolverItemPorTermo,
  hojeSP, normalizarNome, normalizarMatricula, podeDesfazer, restanteParaDesfazerMs, JANELA_DESFAZER_MIN,
  mediana, calcularMedianas, preverDevolucao, previsaoDaCategoria, PREVISAO_VOLTA,
} from '../backend_core/utils/emprestimoRegras.js';

// Instante em horário de Brasília (UTC-3, sem horário de verão)
const br = (iso) => new Date(`${iso}-03:00`);

test('minutos entre datas: inteiro, nunca negativo, null se inválido', () => {
  assert.equal(minutosEntre(br('2026-11-05T10:00:00'), br('2026-11-05T10:59:59')), 59);
  assert.equal(minutosEntre(br('2026-11-05T10:00:00'), br('2026-11-05T09:00:00')), 0);
  assert.equal(minutosEntre('lixo', br('2026-11-05T10:00:00')), null);
  assert.equal(minutosEntre(null), null);
});

test('duração legível', () => {
  assert.equal(formatarDuracao(0), '0 min');
  assert.equal(formatarDuracao(45), '45 min');
  assert.equal(formatarDuracao(60), '1h');
  assert.equal(formatarDuracao(65), '1h 5m');
  assert.equal(formatarDuracao(null), '--');
  assert.equal(formatarDuracao(NaN), '--');
});

test('data/hora de registro: só a hora se foi hoje em Brasília', () => {
  const agora = br('2026-11-05T15:00:00');
  assert.equal(rotuloDataHora(br('2026-11-05T09:07:00').toISOString(), agora), '09:07');
  assert.equal(rotuloDataHora(br('2026-11-04T22:30:00').toISOString(), agora), '04/11 22:30');
  assert.equal(rotuloDataHora(br('2025-12-31T08:00:00').toISOString(), agora), '31/12/2025 08:00');
  assert.equal(rotuloDataHora(null, agora), '--');
});

test('virada do dia é a de Brasília, não a de UTC', () => {
  // 23:30 em Brasília = 02:30 UTC do dia seguinte: ainda é "hoje" para a recepção
  const agora = br('2026-11-05T23:45:00');
  assert.equal(rotuloDataHora(br('2026-11-05T23:30:00'), agora), '23:30');
  // 00:10 do dia 06 em Brasília já é outro dia em relação às 23:45 do dia 05
  assert.equal(rotuloDataHora(br('2026-11-06T00:10:00'), agora), '06/11 00:10');
});

test('valores de datetime-local no horário de Brasília', () => {
  const d = br('2026-11-05T21:15:00'); // 00:15 UTC do dia 06
  assert.equal(inputDataHoraSP(d), '2026-11-05T21:15');
  assert.equal(inputInicioDoDiaSP(d), '2026-11-05T00:00');
});

test('bipagem: código exato ganha de nome que contém o código', () => {
  const itens = [
    { id: 'a', nome_item: 'Jogo 12 peças', patrimonio: 'X-1' },
    { id: 'b', nome_item: 'Bola de pebolim', patrimonio: '12' },
  ];
  assert.equal(resolverItemPorTermo(itens, '12').item.id, 'b');
  assert.equal(resolverItemPorTermo(itens, ' x-1 ').item.id, 'a'); // maiúsc./espaços indiferentes
});

test('bipagem por nome só quando um único item casa (acento indiferente)', () => {
  const itens = [
    { id: 'a', nome_item: 'Bolas de sinuca 1', patrimonio: 'SIN-1' },
    { id: 'b', nome_item: 'Bolas de sinuca 2', patrimonio: 'SIN-2' },
    { id: 'c', nome_item: 'Kit ping-pong', patrimonio: 'PP-1' },
  ];
  assert.equal(resolverItemPorTermo(itens, 'ping').item.id, 'c');
  const r = resolverItemPorTermo(itens, 'sinuca');
  assert.equal(r.item, null);
  assert.deepEqual(r.ambiguos.map(i => i.id), ['a', 'b']);
  assert.equal(resolverItemPorTermo([{ id: 'd', nome_item: 'Pebolim Média' }], 'media').item.id, 'd');
  assert.deepEqual(resolverItemPorTermo(itens, '   '), { item: null, ambiguos: [] });
  assert.deepEqual(resolverItemPorTermo(itens, 'xadrez'), { item: null, ambiguos: [] });
});

test('"hoje" é o dia de Brasília', () => {
  assert.equal(hojeSP(br('2026-11-05T23:59:00')), '2026-11-05');
  assert.equal(hojeSP(br('2026-11-06T00:01:00')), '2026-11-06');
});

test('nome do aluno padronizado', () => {
  assert.equal(normalizarNome('  joão   DA silva '), 'João da Silva');
  assert.equal(normalizarNome('ANA E SOUZA DOS SANTOS'), 'Ana e Souza dos Santos');
  assert.equal(normalizarNome("maria-clara d'ávila"), "Maria-Clara D'Ávila");
  assert.equal(normalizarNome('pedro henrique ii'), 'Pedro Henrique II');
  assert.equal(normalizarNome('Da Costa'), 'Da Costa'); // partícula só fica minúscula no meio
  assert.equal(normalizarNome('   '), '');
  assert.equal(normalizarNome(null), '');
});

test('matrícula do crachá sem espaços', () => {
  assert.equal(normalizarMatricula(' 2110 0123 \n'), '21100123');
  assert.equal(normalizarMatricula(undefined), '');
});

test('desfazer só dentro da janela (espelho das RPCs: 10 min)', () => {
  assert.equal(JANELA_DESFAZER_MIN, 10);
  const registro = br('2026-11-05T10:00:00').toISOString();
  assert.equal(podeDesfazer(registro, br('2026-11-05T10:09:59')), true);
  assert.equal(podeDesfazer(registro, br('2026-11-05T10:10:01')), false);
  assert.equal(restanteParaDesfazerMs(registro, br('2026-11-05T10:04:00')), 6 * 60000);
  assert.equal(restanteParaDesfazerMs('lixo'), 0);
  assert.equal(podeDesfazer(null), false);
});

test('mediana', () => {
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), null);
});

// N devoluções de `minutos` cada, a partir de 05/11 08:00, do mais novo ao mais antigo
const devolucoes = (itemId, minutosLista) => minutosLista.map((m, i) => {
  const ini = new Date(br('2026-11-05T08:00:00').getTime() - i * 86400000);
  return { item_id: itemId, data_retirada: ini.toISOString(), data_devolucao: new Date(ini.getTime() + m * 60000).toISOString() };
});

test('duração típica: por item, com 5+ amostras válidas', () => {
  const itens = [{ id: 'a', categoria_id: 'sinuca' }];
  const m = calcularMedianas(devolucoes('a', [30, 40, 50, 60, 70]), itens);
  assert.deepEqual(m.get('a'), { mediana: 50, amostras: 5, fonte: 'item' });
});

test('duração típica: ignora desfeito na hora (< 2 min) e esquecido (> 12 h)', () => {
  const itens = [{ id: 'a', categoria_id: 'c' }];
  const m = calcularMedianas(devolucoes('a', [1, 30, 30, 30, 30, 30, 900]), itens);
  assert.deepEqual(m.get('a'), { mediana: 30, amostras: 5, fonte: 'item' });
  assert.equal(calcularMedianas(devolucoes('a', [1, 1, 30, 900]), itens).has('a'), false);
});

test('duração típica: item com pouco histórico usa a categoria', () => {
  const itens = [{ id: 'bola1', categoria_id: 'pebolim' }, { id: 'bola2', categoria_id: 'pebolim' }];
  const registros = [...devolucoes('bola1', [20, 20, 20]), ...devolucoes('bola2', [40, 40])];
  const m = calcularMedianas(registros, itens);
  assert.deepEqual(m.get('bola1'), { mediana: 20, amostras: 5, fonte: 'categoria' });
  assert.equal(m.get('bola2').fonte, 'categoria');
});

test('duração típica: só as últimas 30 do item contam', () => {
  const itens = [{ id: 'a', categoria_id: 'c' }];
  const recentes = Array(30).fill(10);
  const antigas = Array(40).fill(300);
  assert.equal(calcularMedianas(devolucoes('a', [...recentes, ...antigas]), itens).get('a').mediana, 10);
});

// O painel recebe da RPC emprestimo_duracoes_recentes uma linha por item com as
// durações já calculadas — a regra tem que dar o mesmo que com registros brutos.
test('duração típica: durações já recortadas pelo banco (RPC) dão o mesmo resultado', () => {
  const itens = [{ id: 'bola1', categoria_id: 'pebolim' }, { id: 'bola2', categoria_id: 'pebolim' }, { id: 'taco', categoria_id: 'sinuca' }];
  const bruto = [...devolucoes('bola1', [20, 20, 20]), ...devolucoes('bola2', [40, 40]), ...devolucoes('taco', [30, 40, 50, 60, 70, 80])];
  const daRpc = [
    { item_id: 'bola1', minutos: [20, 20, 20] },
    { item_id: 'bola2', minutos: [40, 40] },
    { item_id: 'taco', minutos: [30, 40, 50, 60, 70, 80] },
  ];
  assert.deepEqual(calcularMedianas(daRpc, itens), calcularMedianas(bruto, itens));
  assert.deepEqual(calcularMedianas(daRpc, itens).get('taco'), { mediana: 55, amostras: 6, fonte: 'item' });
});

test('duração típica: formato da RPC também respeita o intervalo válido e o teto por item', () => {
  const itens = [{ id: 'a', categoria_id: 'c' }];
  // a RPC já filtra, mas a regra não confia nisso
  const m = calcularMedianas([{ item_id: 'a', minutos: [1, 30, 30, 30, 30, 30, 900] }], itens);
  assert.deepEqual(m.get('a'), { mediana: 30, amostras: 5, fonte: 'item' });
  const longa = [{ item_id: 'a', minutos: [...Array(30).fill(10), ...Array(40).fill(300)] }];
  assert.deepEqual(calcularMedianas(longa, itens).get('a'), { mediana: 10, amostras: 30, fonte: 'item' });
  assert.equal(calcularMedianas([{ item_id: 'a', minutos: [] }, null], itens).has('a'), false);
});

test('duração típica: limites padrão vêm de PREVISAO_VOLTA (os mesmos passados à RPC)', () => {
  assert.deepEqual({ ...PREVISAO_VOLTA }, { porItem: 30, minimo: 5, minMin: 2, maxMin: 720 });
  assert.equal(Object.isFrozen(PREVISAO_VOLTA), true);
});

test('previsão de volta: no tempo, passou do habitual e sem histórico', () => {
  const desde = br('2026-11-05T14:00:00').toISOString();
  const noTempo = preverDevolucao({ desde, medianaMin: 45 }, br('2026-11-05T14:25:00'));
  assert.equal(noTempo.estado, 'no_tempo');
  assert.equal(noTempo.texto, 'costuma voltar em ~20 min');
  const passou = preverDevolucao({ desde, medianaMin: 45 }, br('2026-11-05T15:10:00'));
  assert.equal(passou.estado, 'passou');
  assert.equal(passou.texto, 'passou do tempo habitual (~45 min)');
  assert.equal(preverDevolucao({ desde, medianaMin: null }, br('2026-11-05T14:25:00')).estado, 'sem_historico');
  assert.equal(preverDevolucao({ desde, medianaMin: 45 }, br('2026-11-05T14:41:00')).texto, 'costuma voltar em ~4 min');
  assert.equal(preverDevolucao({}), null);
});

test('previsão da categoria: só quando todos estão fora', () => {
  const agora = br('2026-11-05T14:30:00');
  const fora = (min, mediana) => ({
    status: 'EMPRESTADO', mediana_min: mediana,
    emprestimo: { dataRetirada: new Date(agora.getTime() - min * 60000).toISOString() },
  });
  assert.equal(previsaoDaCategoria([fora(10, 60), fora(20, 30)], agora).texto, 'próxima volta prevista em ~10 min');
  assert.equal(previsaoDaCategoria([fora(10, 60), { status: 'DISPONIVEL' }], agora), null);
  assert.equal(previsaoDaCategoria([fora(10, null), { status: 'MANUTENCAO' }], agora), null);
  assert.equal(previsaoDaCategoria([], agora), null);
});
