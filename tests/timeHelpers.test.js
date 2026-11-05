// Regras de horário da PUCRS (backend_core/utils/timeHelpers.js), usadas
// pelo front e pelo back. "Agora" é sempre o horário de Brasília.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentPeriod, getSemanaAtual, getDiaAtual, extractPeriodCode, isInternalClass, groupConsecutiveClasses,
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
