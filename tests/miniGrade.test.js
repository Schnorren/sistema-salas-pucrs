// Mini-grade e agenda da sala da Linha do tempo no celular (src/utils/miniGrade.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERIODS } from '../backend_core/utils/timeHelpers.js';
import { segmentosDaLinha, itensDaAgenda, blocosDaFaixa } from '../src/utils/miniGrade.js';

// Slots no formato que a Timeline monta: blocos = [[índice inicial, quantidade, nome, tipo?]]
function slotsDe(blocos, idxAgora = -1, sala = '204') {
  const slots = PERIODS.map((p, i) => ({ periodo: p.code, ocupado: false, isAgora: i === idxAgora }));
  for (const [ini, n, nome, tipo] of blocos) {
    const periodos = PERIODS.slice(ini, ini + n).map((p) => p.code);
    for (let i = ini; i < ini + n; i++) {
      Object.assign(slots[i], {
        ocupado: true, nome, tipo: tipo || 'Regular', periodos,
        aulaUniqueKey: `Quinta-${sala}-${PERIODS[ini].code}`,
        aulaParseada: { nomeAula: nome, codCred: '46301-04/2' },
      });
    }
  }
  return slots;
}

test('segmentosDaLinha: uma aula é um segmento; cada período livre é um segmento', () => {
  const segs = segmentosDaLinha(slotsDe([[2, 2, 'PRODUÇÃO'], [4, 2, 'FOTOGRAFIA', 'Interno']]), {});
  assert.equal(segs.length, 2 + 1 + 1 + 10); // A, B livres; CD; E E1; F..P livres
  assert.deepEqual(segs[2], { ini: 2, fim: 3, tipo: 'regular', chave: 'Quinta-204-C', agora: false });
  assert.deepEqual(segs[3], { ini: 4, fim: 5, tipo: 'interno', chave: 'Quinta-204-E', agora: false });
  assert.ok(segs.filter((s) => s.tipo === 'livre').every((s) => s.ini === s.fim && s.chave === null));
});

test('segmentosDaLinha: aulas vizinhas diferentes não se juntam', () => {
  const segs = segmentosDaLinha(slotsDe([[0, 2, 'A'], [2, 2, 'B']]), {});
  assert.deepEqual(segs.slice(0, 2).map((s) => [s.ini, s.fim, s.chave]), [[0, 1, 'Quinta-204-A'], [2, 3, 'Quinta-204-C']]);
});

test('segmentosDaLinha: troca parcial divide a aula (só os períodos trocados ficam vermelhos)', () => {
  const trocas = { 'Quinta-204-L': { periodos_str: 'L,M' } };
  const segs = segmentosDaLinha(slotsDe([[12, 4, 'PROJETO']], 13), trocas);
  const aula = segs.filter((s) => s.chave === 'Quinta-204-L');
  assert.deepEqual(aula.map((s) => [s.ini, s.fim, s.tipo, s.agora]), [[12, 13, 'troca', true], [14, 15, 'regular', false]]);
});

test('segmentosDaLinha: troca antiga sem vírgula vale para o bloco inteiro', () => {
  const segs = segmentosDaLinha(slotsDe([[2, 2, 'X']]), { 'Quinta-204-C': { periodos_str: 'CD' } });
  assert.deepEqual(segs.filter((s) => s.chave).map((s) => [s.ini, s.fim, s.tipo]), [[2, 3, 'troca']]);
});

test('itensDaAgenda: aulas e sequências livres, na ordem do dia', () => {
  const itens = itensDaAgenda(slotsDe([[2, 2, 'PRODUÇÃO'], [4, 2, 'FOTOGRAFIA'], [12, 2, 'PROJETO']]));
  assert.deepEqual(itens.map((i) => (i.livre ? `livre ${i.ini}-${i.fim}` : `${i.nome} ${i.ini}-${i.fim}`)), [
    'livre 0-1', 'PRODUÇÃO 2-3', 'FOTOGRAFIA 4-5', 'livre 6-11', 'PROJETO 12-13', 'livre 14-15',
  ]);
  assert.deepEqual(itens[1].periodos, ['C', 'D']);
  assert.equal(itens[1].codCred, '46301-04/2');
});

test('itensDaAgenda: sala sem aula é um item livre do dia inteiro', () => {
  assert.deepEqual(itensDaAgenda(slotsDe([])), [{ livre: true, ini: 0, fim: 15 }]);
});

test('blocosDaFaixa: cada aula é um bloco com nome, letras e o período atual', () => {
  const blocos = blocosDaFaixa(slotsDe([[2, 2, 'PRODUÇÃO'], [4, 2, 'FOTOGRAFIA', 'Interno']], 3), {});
  const aulas = blocos.filter((b) => !b.livre);
  assert.deepEqual(aulas.map((b) => [b.nome, b.periodos.join(''), b.tipo, b.idxAgora, b.continua]), [
    ['PRODUÇÃO', 'CD', 'regular', 1, false],
    ['FOTOGRAFIA', 'EE1', 'interno', -1, false],
  ]);
  const livres = blocos.filter((b) => b.livre);
  assert.equal(livres.length, 12);
  assert.deepEqual(livres.slice(0, 2).map((b) => b.periodo), ['A', 'B']);
});

test('blocosDaFaixa: troca parcial divide a aula; a parte trocada traz o registro', () => {
  const registro = { predio_destino: '32', sala_destino: '410', periodos_str: 'L,M' };
  const aulas = blocosDaFaixa(slotsDe([[12, 4, 'PROJETO']]), { 'Quinta-204-L': registro }).filter((b) => !b.livre);
  assert.deepEqual(aulas.map((b) => [b.periodos.join(''), b.tipo, b.continua, b.troca?.sala_destino ?? null, b.nome]), [
    ['LM', 'troca', false, '410', 'PROJETO'],
    ['NP', 'regular', true, null, 'PROJETO'],
  ]);
});

test('blocosDaFaixa: sem aula, 16 períodos livres', () => {
  const blocos = blocosDaFaixa(slotsDe([]), {});
  assert.equal(blocos.length, 16);
  assert.ok(blocos.every((b) => b.livre));
});
