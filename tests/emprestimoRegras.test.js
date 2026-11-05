// Regras puras do módulo de empréstimos (backend_core/utils/emprestimoRegras.js),
// usadas pelo front e pelo back. Datas de exibição no fuso de Brasília.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutosEntre, formatarDuracao, rotuloDataHora, inputDataHoraSP, inputInicioDoDiaSP, resolverItemPorTermo,
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
