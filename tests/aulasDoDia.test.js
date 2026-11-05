// Regras de blocos de aula e trocas de sala (src/utils/aulasDoDia.js).
// O teste mais importante é a PARIDADE: as chaves de bloco do front precisam
// ser idênticas às de computarChavesDeBlocos() (timeHelpers), que conta as
// trocas ativas do badge. Se divergirem, trocas somem ou aparecem em dobro.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PERIODS, computarChavesDeBlocos, getProximosSeteDias } from '../backend_core/utils/timeHelpers.js';
import {
  slotsDoDia, blocosDaSala, blocoNoPeriodo, periodosAfetadosPelaTroca, trocaNoPeriodo, trocasVigentes,
  desmontarChave, blocoDaChave, horarioDosPeriodos, dataCurta, dataPorExtenso, listarTrocas,
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

test('trocas vigentes: vale o registro da próxima ocorrência de cada dia', () => {
  // Quinta 05/11: Quinta..Domingo são da semana de 02/11; Segunda..Quarta, da de 09/11
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-05T15:00:00-03:00') });
  let proximosDias;
  try { proximosDias = getProximosSeteDias(); } finally { mock.timers.reset(); }

  const registros = [
    { aula_unique_key: 'Segunda-205-L', semana: '2026-11-02', sala_destino: 'passou' },
    { aula_unique_key: 'Segunda-205-L', semana: '2026-11-09', sala_destino: 'antecedencia' },
    { aula_unique_key: 'Quinta-301-A', semana: '2026-11-02', sala_destino: 'hoje' },
    { aula_unique_key: 'Quinta-302-A', semana: '2026-11-09', sala_destino: 'daqui-7-dias' },
    { aula_unique_key: 'Sábado-102-C', semana: '2026-11-02T00:00:00', sala_destino: 'sabado' },
    { aula_unique_key: 'semdia', semana: '2026-11-02' },
  ];
  const vigentes = trocasVigentes(registros, proximosDias);
  assert.deepEqual(Object.keys(vigentes).sort(), ['Quinta-301-A', 'Segunda-205-L', 'Sábado-102-C']);
  assert.equal(vigentes['Segunda-205-L'].sala_destino, 'antecedencia'); // a de 02/11 já passou
  assert.deepEqual(trocasVigentes(null, proximosDias), {});
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

test('chave da troca: dia, sala (com hífen) e período inicial', () => {
  assert.deepEqual(desmontarChave('Segunda-205-L'), { dia: 'Segunda', sala: '205', periodo: 'L' });
  assert.deepEqual(desmontarChave('Terça-LAB-2-E1'), { dia: 'Terça', sala: 'LAB-2', periodo: 'E1' });
  assert.equal(desmontarChave('semdia'), null);
});

test('horário e datas por extenso, sem fuso', () => {
  assert.equal(horarioDosPeriodos(['M', 'L']), '19:15 às 20:45');
  assert.equal(horarioDosPeriodos(['E', 'E1']), '11:30 às 13:00');
  assert.equal(horarioDosPeriodos([]), '');
  assert.equal(dataCurta('2026-11-09'), '09/11');
  assert.equal(dataPorExtenso('Segunda', '2026-11-09'), 'segunda-feira, 09/11/2026');
  assert.equal(dataPorExtenso('Sábado', '2026-11-07'), 'sábado, 07/11/2026');
});

test('lista de trocas: aula da grade, períodos afetados e ordem por data/período', () => {
  const grade = [
    ...['L', 'M', 'N', 'P'].map(p => ({ dia_semana: 'Segunda', periodo: p, nome_aula: '97316-04/1 - BRANDED CONTENT', sala: '205' })),
    ...['A', 'B'].map(p => ({ dia_semana: 'Quinta', periodo: p, nome_aula: 'CÁLCULO', sala: '201' })),
    { dia_semana: 'Quinta', periodo: 'J', nome_aula: 'FÍSICA', sala: '101' },
  ];
  assert.equal(blocoDaChave(grade, 'Segunda-205-L').nomeAula, 'BRANDED CONTENT');
  assert.equal(blocoDaChave(grade, 'Segunda-205-M'), null); // M não inicia bloco

  // Quinta 05/11: Quinta = hoje (0), Segunda = 09/11 (4)
  const proximosDias = [
    { dia: 'Quinta', data: '2026-11-05', semana: '2026-11-02', emDias: 0 },
    { dia: 'Segunda', data: '2026-11-09', semana: '2026-11-09', emDias: 4 },
  ];
  const trocas = {
    'Segunda-205-L': { periodos_str: 'L,M', predio_destino: '32', sala_destino: '410', semana: '2026-11-09' },
    'Quinta-101-J': { periodos_str: 'J', predio_destino: '9', sala_destino: '1', semana: '2026-11-02' },
    'Quinta-201-A': { periodos_str: 'A,B', predio_destino: '30', sala_destino: '2', semana: '2026-11-02' },
    'Quinta-999-C': { periodos_str: 'C,D', nome_aula_editado: 'SUMIU DA GRADE', semana: '2026-11-02' },
    'Domingo-1-A': { periodos_str: 'A', semana: '2026-11-02' }, // dia fora dos próximos dias
  };
  const itens = listarTrocas(trocas, grade, proximosDias);
  assert.deepEqual(itens.map(i => i.chave), ['Quinta-201-A', 'Quinta-999-C', 'Quinta-101-J', 'Segunda-205-L']);
  const branded = itens.find(i => i.chave === 'Segunda-205-L');
  assert.deepEqual(branded.afetados, ['L', 'M']);
  assert.equal(branded.data, '2026-11-09');
  assert.equal(branded.bloco.periodos.length, 4);
  const orfa = itens.find(i => i.chave === 'Quinta-999-C');
  assert.equal(orfa.bloco, null);
  assert.deepEqual(orfa.afetados, ['C', 'D']);
  assert.deepEqual(listarTrocas(null, grade, proximosDias), []);
});
