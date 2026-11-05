// Visibilidade de salas (backend_core/utils/salas.js): o que vai para o JSON
// publicado, quais salas da agenda são novas e o resumo usado na pergunta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_SALA, salaVisivel, situacaoDaSala, separarSalasNovas, resumirAgendaPorSala, filtrarPublicacao,
} from '../backend_core/utils/salas.js';

test('só Ativa (ou sem status) é visível; Oculta e Pendente não', () => {
  assert.equal(salaVisivel({ status: STATUS_SALA.ATIVA }), true);
  assert.equal(salaVisivel({ status: null }), true);
  assert.equal(salaVisivel({ status: STATUS_SALA.OCULTA }), false);
  assert.equal(salaVisivel({ status: STATUS_SALA.PENDENTE }), false);
  assert.equal(salaVisivel(null), false);
  assert.deepEqual(
    [STATUS_SALA.ATIVA, STATUS_SALA.OCULTA, STATUS_SALA.PENDENTE, null].map(status => situacaoDaSala({ status })),
    ['visivel', 'oculta', 'pendente', 'visivel'],
  );
});

test('publicação leva só salas visíveis e só os agendamentos delas, sem o status', () => {
  const salas = [
    { numero: '201', andar: null, status: 'Ativa' },
    { numero: '225', andar: null, status: 'Oculta' },
    { numero: '312', andar: null, status: 'Pendente' },
  ];
  const grade = [
    { id: 1, dia_semana: 'Segunda', periodo: 'A', salas: { numero: '201', andar: null, status: 'Ativa' } },
    { id: 2, dia_semana: 'Segunda', periodo: 'A', salas: { numero: '225', andar: null, status: 'Oculta' } },
    { id: 3, dia_semana: 'Terça', periodo: 'B', salas: { numero: '312', andar: null, status: 'Pendente' } },
    { id: 4, dia_semana: 'Terça', periodo: 'B', salas: null },
  ];
  const pub = filtrarPublicacao(salas, grade);
  assert.deepEqual(pub.salas, [{ numero: '201', andar: null }]);
  assert.deepEqual(pub.grade, [{ id: 1, dia_semana: 'Segunda', periodo: 'A', salas: { numero: '201', andar: null } }]);
});

test('sala nova = número da agenda que o prédio não conhecia (sem repetir, em ordem numérica)', () => {
  const existentes = [{ numero: '201' }, { numero: '205' }];
  assert.deepEqual(separarSalasNovas(['205', '1101', '312', '312', '', null, '201', '90'], existentes), ['90', '312', '1101']);
  assert.deepEqual(separarSalasNovas(['201', '205'], existentes), []);
  // Primeira importação: todas são novas
  assert.deepEqual(separarSalasNovas(['205', '201'], []), ['201', '205']);
});

test('resumo da semana conta períodos regulares × internos e traz as atividades mais frequentes', () => {
  const r = resumirAgendaPorSala([
    { sala: '225', nome: 'Interno - APLICAÇÃO PRÉ-PROVA ENEM', tipo: 'Interno' },
    { sala: '225', nome: 'Interno - APLICAÇÃO PRÉ-PROVA ENEM', tipo: 'Interno' },
    { sala: '225', nome: 'Interno - CINE DEBATE', tipo: 'Interno' },
    { sala: '201', nome: 'CINESIOLOGIA', tipo: 'Regular' },
    { sala: '201', nome: 'A', tipo: 'Regular' },
    { sala: '201', nome: 'B', tipo: 'Regular' },
    { sala: '201', nome: 'C', tipo: 'Regular' },
    { sala: '201', nome: 'CINESIOLOGIA', tipo: 'Regular' },
    { sala: '201', nome: 'Interno - BANCA', tipo: 'Interno' },
    { sala: null, nome: 'sem sala', tipo: 'Regular' },
  ]);
  assert.deepEqual(r.get('225'), { periodos: 3, regulares: 0, internos: 3, exemplos: ['Interno - APLICAÇÃO PRÉ-PROVA ENEM', 'Interno - CINE DEBATE'] });
  assert.equal(r.get('201').periodos, 6);
  assert.equal(r.get('201').regulares, 5);
  assert.equal(r.get('201').internos, 1);
  assert.equal(r.get('201').exemplos.length, 3);
  assert.equal(r.get('201').exemplos[0], 'CINESIOLOGIA');
  assert.equal(r.has(null), false);
});

// --- Front (src/utils/salas.js): o que a tela manda para PUT /api/grade/salas ---
import { marcadaPorPadrao, montarAlteracoes, agruparPorAndar, descreverAgenda } from '../src/utils/salas.js';

test('pendente vem marcada só se tem aula regular; visível/oculta seguem o salvo', () => {
  assert.equal(marcadaPorPadrao({ situacao: 'pendente', regulares: 3 }), true);
  assert.equal(marcadaPorPadrao({ situacao: 'pendente', regulares: 0 }), false);
  assert.equal(marcadaPorPadrao({ situacao: 'visivel', regulares: 0 }), true);
  assert.equal(marcadaPorPadrao({ situacao: 'oculta', regulares: 9 }), false);
});

test('envia só o que mudou, mais toda sala pendente (a decisão que faltava)', () => {
  const salas = [
    { numero: '201', situacao: 'visivel', regulares: 40 },
    { numero: '225', situacao: 'visivel', regulares: 0 },
    { numero: '312', situacao: 'oculta', regulares: 0 },
    { numero: '330', situacao: 'pendente', regulares: 5 },
    { numero: '331', situacao: 'pendente', regulares: 0 },
  ];
  assert.deepEqual(montarAlteracoes(salas, {}), { exibir: ['330'], ocultar: ['331'] });
  assert.deepEqual(montarAlteracoes(salas, { '225': false, '312': true, '331': true }), { exibir: ['312', '330', '331'], ocultar: ['225'] });
  // Voltar ao que estava salvo não conta como alteração
  assert.deepEqual(montarAlteracoes(salas.slice(0, 3), { '201': true, '312': false }), { exibir: [], ocultar: [] });
});

test('agrupa por andar como a Planta e descreve a agenda', () => {
  const grupos = agruparPorAndar([{ numero: '312' }, { numero: '107' }, { numero: '201' }, { numero: '110' }, { numero: 'AUD' }]);
  assert.deepEqual(grupos.map(g => [g.rotulo, g.salas.map(s => s.numero)]), [
    ['Térreo / Outros', ['AUD']], ['1º andar', ['107', '110']], ['2º andar', ['201']], ['3º andar', ['312']],
  ]);
  assert.equal(descreverAgenda({ periodos: 0 }), 'Nenhum agendamento na agenda atual');
  assert.equal(descreverAgenda({ periodos: 20, regulares: 0, internos: 20 }), '20 períodos agendados na semana · só eventos internos');
  assert.equal(descreverAgenda({ periodos: 1, regulares: 1, internos: 0 }), '1 período agendado na semana · todos de aula regular');
});
