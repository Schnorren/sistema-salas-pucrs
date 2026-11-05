// Mini-grade e agenda da sala da Linha do tempo no celular (src/utils/miniGrade.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERIODS } from '../backend_core/utils/timeHelpers.js';
import { segmentosDaLinha, itensDaAgenda, resumoDaLinha } from '../src/utils/miniGrade.js';

const INICIOS = PERIODS.map((p) => p.lb);

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

test('resumoDaLinha: aula de agora, com a troca que vale no período', () => {
  const trocas = { 'Quinta-204-C': { predio_destino: '32', sala_destino: '410', periodos_str: 'C,D' } };
  const r = resumoDaLinha(slotsDe([[2, 2, 'PRODUÇÃO']], 2), trocas, 2, INICIOS);
  assert.equal(r.tipo, 'agora');
  assert.equal(r.bloco.nome, 'PRODUÇÃO');
  assert.equal(r.troca.sala_destino, '410');
});

test('resumoDaLinha: troca que não cobre o período atual não aparece', () => {
  const trocas = { 'Quinta-204-L': { periodos_str: 'N,P' } };
  const r = resumoDaLinha(slotsDe([[12, 4, 'PROJETO']], 12), trocas, 12, INICIOS);
  assert.equal(r.tipo, 'agora');
  assert.equal(r.troca, null);
});

test('resumoDaLinha: livre agora mostra a próxima aula e o horário', () => {
  const r = resumoDaLinha(slotsDe([[0, 2, 'ESTATÍSTICA'], [4, 2, 'REDAÇÃO']], 2), {}, 2, INICIOS);
  assert.deepEqual([r.tipo, r.bloco.nome, r.inicio], ['livre', 'REDAÇÃO', '11:30']);
});

test('resumoDaLinha: sem mais aulas no dia', () => {
  assert.equal(resumoDaLinha(slotsDe([[0, 2, 'ESTATÍSTICA']], 5), {}, 5, INICIOS).tipo, 'livreResto');
});

test('resumoDaLinha: outro dia (sem período atual) mostra a primeira aula e o total', () => {
  const r = resumoDaLinha(slotsDe([[6, 2, 'ÁLGEBRA'], [10, 2, 'FÍSICA']]), {}, -1, INICIOS);
  assert.deepEqual([r.tipo, r.bloco.nome, r.inicio, r.total], ['dia', 'ÁLGEBRA', '14:00', 2]);
});

test('resumoDaLinha: sala sem aula', () => {
  assert.equal(resumoDaLinha(slotsDe([]), {}, 3, INICIOS).tipo, 'vazia');
});
