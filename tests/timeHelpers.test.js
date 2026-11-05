// Regras de horário da PUCRS (backend_core/utils/timeHelpers.js), usadas
// pelo front e pelo back. "Agora" é sempre o horário de Brasília.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentPeriod, getSemanaAtual, getDiaAtual, extractPeriodCode, isInternalClass, groupConsecutiveClasses,
  getProximosSeteDias, getProximaOcorrencia,
} from '../backend_core/utils/timeHelpers.js';

// Congela o relógio num horário de Brasília (UTC-3, sem horário de verão)
const emBrasilia = (iso, fn) => {
  mock.timers.enable({ apis: ['Date'], now: new Date(`${iso}-03:00`) });
  try { return fn(); } finally { mock.timers.reset(); }
};

test('período atual pelo horário de Brasília', () => {
  assert.equal(emBrasilia('2026-11-04T10:05:00', getCurrentPeriod), 'C');
  assert.equal(emBrasilia('2026-11-04T08:00:00', getCurrentPeriod), 'A');
  assert.equal(emBrasilia('2026-11-04T19:20:00', getCurrentPeriod), 'L');
  assert.equal(emBrasilia('2026-11-04T22:29:00', getCurrentPeriod), 'P');
});

test('intervalo curto (até 30 min) conta como o período anterior; almoço não', () => {
  assert.equal(emBrasilia('2026-11-04T09:35:00', getCurrentPeriod), 'B'); // B vai até 09:30, C começa 09:45
  assert.equal(emBrasilia('2026-11-04T13:10:00', getCurrentPeriod), null); // almoço 13:00–14:00
  assert.equal(emBrasilia('2026-11-04T07:30:00', getCurrentPeriod), null);
  assert.equal(emBrasilia('2026-11-04T22:40:00', getCurrentPeriod), null);
});

test('dia e semana (segunda-feira ISO) no fuso de Brasília', () => {
  assert.equal(emBrasilia('2026-11-04T10:00:00', getDiaAtual), 'Quarta');
  assert.equal(emBrasilia('2026-11-04T10:00:00', getSemanaAtual), '2026-11-02');
  assert.equal(emBrasilia('2026-11-08T23:00:00', getSemanaAtual), '2026-11-02'); // domingo pertence à semana da segunda anterior
});

// Troca de sala é de UMA data: o dia escolhido é a próxima vez que ele acontece.
test('próxima ocorrência do dia conta hoje e nunca volta para um dia que já passou', () => {
  const naQuinta = (dia) => emBrasilia('2026-11-05T15:00:00', () => getProximaOcorrencia(dia));
  assert.deepEqual(naQuinta('Quinta'), { dia: 'Quinta', data: '2026-11-05', semana: '2026-11-02', emDias: 0 });
  assert.deepEqual(naQuinta('Segunda'), { dia: 'Segunda', data: '2026-11-09', semana: '2026-11-09', emDias: 4 });
  assert.deepEqual(naQuinta('Quarta'), { dia: 'Quarta', data: '2026-11-11', semana: '2026-11-09', emDias: 6 });
  assert.equal(naQuinta('Domingo').semana, '2026-11-02'); // domingo fecha a semana da segunda anterior
  assert.equal(naQuinta('Feriado').data, '2026-11-05');    // dia desconhecido cai em hoje

  // Domingo registrando a aula de amanhã: vai para a semana que começa na segunda
  const noDomingo = (dia) => emBrasilia('2026-11-08T10:00:00', () => getProximaOcorrencia(dia));
  assert.deepEqual(noDomingo('Segunda'), { dia: 'Segunda', data: '2026-11-09', semana: '2026-11-09', emDias: 1 });
  assert.equal(noDomingo('Domingo').data, '2026-11-08');
});

test('próximos 7 dias: começam hoje (fuso de Brasília), em ordem, com a semana de cada data', () => {
  const naQuinta = emBrasilia('2026-11-05T15:00:00', getProximosSeteDias);
  assert.deepEqual(naQuinta.map(d => d.dia), ['Quinta', 'Sexta', 'Sábado', 'Domingo', 'Segunda', 'Terça', 'Quarta']);
  assert.deepEqual(naQuinta.map(d => d.data), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']);
  assert.deepEqual([...new Set(naQuinta.map(d => d.semana))], ['2026-11-02', '2026-11-09']);

  // Na segunda, os 7 dias cabem numa semana só
  const naSegunda = emBrasilia('2026-11-09T08:00:00', getProximosSeteDias);
  assert.deepEqual([...new Set(naSegunda.map(d => d.semana))], ['2026-11-09']);

  // 22h30 em Brasília já é sexta em UTC — continua sendo quinta para a PUCRS
  assert.equal(emBrasilia('2026-11-05T22:30:00', getProximosSeteDias)[0].data, '2026-11-05');

  // Virada de ano
  const fimDeAno = emBrasilia('2026-12-30T10:00:00', getProximosSeteDias);
  assert.deepEqual(fimDeAno.find(d => d.dia === 'Sexta'), { dia: 'Sexta', data: '2027-01-01', semana: '2026-12-28', emDias: 2 });
  assert.deepEqual(fimDeAno.find(d => d.dia === 'Segunda'), { dia: 'Segunda', data: '2027-01-04', semana: '2027-01-04', emDias: 5 });
});

test('código do período e aula interna', () => {
  assert.equal(extractPeriodCode('E1 - 12:15'), 'E1');
  assert.equal(extractPeriodCode(''), '');
  assert.equal(isInternalClass('  interno - banca'), true);
  assert.equal(isInternalClass('97316-04/1 - BRANDED CONTENT'), false);
});

test('agrupa períodos consecutivos da mesma aula na mesma sala', () => {
  const aula = (periodo, nome, sala = '205') => ({ id: periodo, periodo, nome_aula: nome, salas: { numero: sala } });
  const grupos = groupConsecutiveClasses([aula('C', 'X'), aula('D', 'X'), aula('E', 'Y'), aula('L', 'X')]);
  assert.deepEqual(grupos.map(g => g.periodosFormatados), ['CD', 'E', 'L']);
  assert.equal(grupos[0].horarioInicio, '09:45');
  assert.equal(grupos[0].horarioFim, '11:15');
});
