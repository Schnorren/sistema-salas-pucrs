// Resumo "o que mudou" da importação (backend_core/utils/gradeComparacao.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararGrades } from '../backend_core/utils/gradeComparacao.js';

const aula = (sala, dia, periodo, nome) => ({ sala, dia, periodo, nome });
const BASE = [
  aula('205', 'Segunda', 'A', 'Cálculo I'),
  aula('205', 'Segunda', 'B', 'Cálculo I'),
  aula('301', 'Terça', 'J', 'Física'),
];

test('reimportar a mesma agenda não muda nada', () => {
  const r = compararGrades(BASE, [...BASE].reverse());
  assert.equal(r.iguais, true);
  assert.deepEqual([r.novos, r.removidos, r.alterados, r.totalSalasAfetadas], [0, 0, 0, 0]);
  assert.equal(r.antes, 3);
  assert.equal(r.depois, 3);
});

test('conta novos, removidos e alterados por slot, com as salas afetadas', () => {
  const depois = [
    aula('205', 'Segunda', 'A', 'Cálculo I'),
    aula('205', 'Segunda', 'B', 'Álgebra'),        // alterado
    aula('412', 'Quarta', 'C', 'Programação'),      // novo
  ];                                                // 301 Terça J removido
  const r = compararGrades(BASE, depois);
  assert.equal(r.iguais, false);
  assert.deepEqual([r.novos, r.removidos, r.alterados], [1, 1, 1]);
  assert.deepEqual(r.salasAfetadas, ['205', '301', '412']);
});

test('slot com duas atividades compara o conjunto; espaços não contam', () => {
  const antes = [aula('101', 'Sexta', 'L', 'A'), aula('101', 'Sexta', 'L', 'B')];
  assert.equal(compararGrades(antes, [aula('101', 'Sexta', 'L', ' B '), aula('101', 'Sexta', 'L', 'A')]).iguais, true);
  assert.equal(compararGrades(antes, [aula('101', 'Sexta', 'L', 'A')]).alterados, 1);
});

test('primeira importação: tudo novo; linhas incompletas ignoradas; lista de salas limitada', () => {
  const muitas = Array.from({ length: 20 }, (_, i) => aula(String(100 + i), 'Segunda', 'A', 'X'));
  const r = compararGrades([], [...muitas, { sala: '', dia: 'Segunda', periodo: 'A' }, null]);
  assert.equal(r.novos, 20);
  assert.equal(r.totalSalasAfetadas, 20);
  assert.equal(r.salasAfetadas.length, 12);
  assert.deepEqual(r.salasAfetadas.slice(0, 2), ['100', '101']);
});
