// Regras de blocos de aula e trocas de sala (src/utils/aulasDoDia.js).
// O teste mais importante é a PARIDADE: as chaves de bloco do front precisam
// ser idênticas às de computarChavesDeBlocos() (timeHelpers), que conta as
// trocas ativas do badge. Se divergirem, trocas somem ou aparecem em dobro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERIODS, computarChavesDeBlocos } from '../backend_core/utils/timeHelpers.js';
import {
  slotsDoDia, blocosDaSala, blocoNoPeriodo, periodosAfetadosPelaTroca, trocaNoPeriodo,
  salaCoincide, diaDaData, ordenarPeriodos, parsearNomeAula,
} from '../src/utils/aulasDoDia.js';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Gerador determinístico de grade "realista": blocos de 1 a 4 períodos,
// aulas internas, slot duplicado (1ª ocorrência vence) e nomes repetidos em
// blocos vizinhos que NÃO são adjacentes.
function gradeAleatoria(semente) {
  let s = semente;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const nomes = ['97316-04/1 - BRANDED CONTENT', '46512-04/2 - FOTOGRAFIA', 'INTERNO - REUNIÃO', '98201-04/1 - UX WRITING'];
  const grade = [];
  for (const dia of ['Segunda', 'Quarta-feira', 'Sexta']) {
    for (const sala of ['201', '202', '303', '2050']) {
      let i = 0;
      while (i < PERIODS.length) {
        if (rnd() < 0.4) { i++; continue; }
        const tam = 1 + Math.floor(rnd() * 4);
        const nome = nomes[Math.floor(rnd() * nomes.length)];
        for (let k = i; k < Math.min(PERIODS.length, i + tam); k++) {
          grade.push({ dia_semana: dia, periodo: `${PERIODS[k].code} - x`, nome_aula: nome, salas: { numero: sala } });
          if (rnd() < 0.05) grade.push({ dia_semana: dia, periodo: PERIODS[k].code, nome_aula: 'DUPLICADA', sala });
        }
        i += tam;
      }
    }
  }
  return grade;
}

test('chaves de bloco do front = chaves do timeHelpers (paridade)', () => {
  for (let semente = 1; semente <= 25; semente++) {
    const grade = gradeAleatoria(semente);
    const esperado = computarChavesDeBlocos(grade);
    const obtido = new Set();
    for (const dia of DIAS) {
      for (const [sala, slots] of slotsDoDia(grade, dia)) {
        blocosDaSala(slots, dia, sala).forEach(b => obtido.add(b.chave));
      }
    }
    assert.deepEqual([...obtido].sort(), [...esperado].sort(), `semente ${semente}`);
  }
});

test('bloco junta períodos adjacentes da mesma aula e separa aulas diferentes', () => {
  const grade = ['L', 'M', 'N', 'P'].map(p => ({ dia_semana: 'Quarta', periodo: p, nome_aula: '46390-04/1 - PROJETO', sala: '303' }))
    .concat([{ dia_semana: 'Quarta', periodo: 'C', nome_aula: '97333-04/2 - GESTÃO', sala: '303' }]);
  const blocos = blocosDaSala(slotsDoDia(grade, 'Quarta').get('303'), 'Quarta', '303');
  assert.equal(blocos.length, 2);
  assert.deepEqual(blocos[1].periodos, ['L', 'M', 'N', 'P']);
  assert.equal(blocos[1].chave, 'Quarta-303-L');
  assert.equal(blocos[1].inicio, '19:15');
  assert.equal(blocos[1].fim, '22:30');
  assert.equal(blocos[1].codCred, '46390-04/1');
  assert.equal(blocos[1].nomeAula, 'PROJETO');
  assert.equal(blocoNoPeriodo(blocos, 'N').chave, 'Quarta-303-L');
  assert.equal(blocoNoPeriodo(blocos, 'F'), null);
});

test('troca parcial só afeta os períodos gravados; formato antigo vale para o bloco todo', () => {
  const bloco = { chave: 'Quarta-303-L', periodos: ['L', 'M', 'N', 'P'] };
  assert.deepEqual(periodosAfetadosPelaTroca({ periodos_str: 'L,M' }, bloco.periodos), ['L', 'M']);
  assert.deepEqual(periodosAfetadosPelaTroca({ periodos_str: 'LMNP' }, bloco.periodos), ['L', 'M', 'N', 'P']);
  assert.deepEqual(periodosAfetadosPelaTroca({}, bloco.periodos), ['L', 'M', 'N', 'P']);
  const trocas = { 'Quarta-303-L': { periodos_str: 'L,M', sala_destino: '301' } };
  assert.equal(trocaNoPeriodo(trocas, bloco, 'M').sala_destino, '301');
  assert.equal(trocaNoPeriodo(trocas, bloco, 'N'), null);
  assert.equal(trocaNoPeriodo(trocas, null, 'M'), null);
});

test('sala da autorização de chave compara por palavra inteira', () => {
  assert.equal(salaCoincide('205', '205'), true);
  assert.equal(salaCoincide('sala 205', '205'), true);
  assert.equal(salaCoincide('2050', '205'), false);
  assert.equal(salaCoincide('Lab 4', '205'), false);
});

test('dia da semana de uma data sem depender do fuso', () => {
  assert.equal(diaDaData('2026-11-04'), 'Quarta');
  assert.equal(diaDaData('2026-11-08'), 'Domingo');
  assert.equal(diaDaData(''), null);
});

test('períodos seguem a ordem da PUCRS (E1 depois de E)', () => {
  assert.deepEqual(ordenarPeriodos(['F', 'E1', 'E', 'A']), ['A', 'E', 'E1', 'F']);
});

test('código/turma separado do nome da aula', () => {
  assert.deepEqual(parsearNomeAula('97316-04/1 - BRANDED CONTENT'), { codCred: '97316-04/1', nomeAula: 'BRANDED CONTENT' });
  assert.deepEqual(parsearNomeAula('INTERNO - REUNIÃO'), { codCred: '', nomeAula: 'INTERNO - REUNIÃO' });
});
