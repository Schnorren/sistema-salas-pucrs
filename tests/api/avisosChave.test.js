// Autorização de chave ligada à aula: montagem das linhas do aviso (puro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './supabaseFalso.js'; // define as variáveis de ambiente do client antes do backend

const { default: avisos } = await import('../../backend_core/services/avisos.service.js');

const user = { id: 'u1' };
const aula = (chave, periodos = 'AB') => ({ chave, periodos, nome_aula: 'PREVENÇÃO DE RISCO' });
const montar = (extra) => avisos.montarNovoAviso(
  { tipo: 'CHAVE', aluno_nome: 'Julia Machado', data_inicio: '2026-11-18', vigencia: 'DATA', aulas: [aula('Quarta-201-A')], ...extra },
  user, 'p15');

test('uma data: uma linha, não recorrente, fim = início', () => {
  const [l] = montar({});
  assert.equal(l.aula_chave, 'Quarta-201-A');
  assert.equal(l.sala_id, '201');
  assert.equal(l.recorrente, false);
  assert.equal(l.data_fim, '2026-11-18');
  assert.equal(l.predio_id, 'p15');
});

test('indeterminado: recorrente sem data_fim; várias aulas = várias linhas', () => {
  const ls = montar({ vigencia: 'INDETERMINADO', aulas: [aula('Terça-201-A'), aula('Quinta-LAB-2-C', 'CD')], descricao: ' licença ' });
  assert.equal(ls.length, 2);
  assert.ok(ls.every(l => l.recorrente && l.data_fim === null && l.descricao === 'licença'));
  assert.equal(ls[1].sala_id, 'LAB-2');
});

test('período: exige data final válida e não anterior', () => {
  assert.equal(montar({ vigencia: 'PERIODO', data_fim: '2026-12-12' })[0].data_fim, '2026-12-12');
  assert.throws(() => montar({ vigencia: 'PERIODO' }));
  assert.throws(() => montar({ vigencia: 'PERIODO', data_fim: '2026-11-01' }));
});

test('recusa aula inválida, repetida, vazia e vigência desconhecida', () => {
  assert.throws(() => montar({ aulas: [aula('lixo')] }));
  assert.throws(() => montar({ aulas: [aula('Quarta-201-A'), aula('Quarta-201-A')] }));
  assert.throws(() => montar({ aulas: [] }));
  assert.throws(() => montar({ vigencia: 'SEMPRE' }));
});

test('formato antigo (sala/disciplina livres) continua aceito', () => {
  const l = avisos.montarNovoAviso(
    { tipo: 'CHAVE', aluno_nome: 'X', sala_id: '201', disciplina: 'Y', data_prevista: '2026-11-18', periodo: 'BA' }, user, 'p15');
  assert.equal(l.periodo, 'AB');
  assert.equal(l.aula_chave, undefined);
});
