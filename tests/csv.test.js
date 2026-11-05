// Exportação CSV (src/utils/csv.js): fórmula vira texto, separadores ficam entre aspas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celulaCsv, linhaCsv } from '../src/utils/csv.js';

test('célula que o Excel leria como fórmula vira texto literal', () => {
  assert.equal(celulaCsv('=HYPERLINK("http://x","clique")'), `"'=HYPERLINK(""http://x"",""clique"")"`);
  assert.equal(celulaCsv('+5511999'), "'+5511999");
  assert.equal(celulaCsv('-2+3'), "'-2+3");
  assert.equal(celulaCsv('@SUM(A1)'), "'@SUM(A1)");
});

test('vírgula, aspas e quebra de linha ficam entre aspas; número passa direto', () => {
  assert.equal(celulaCsv('Sala 205, bloco A'), '"Sala 205, bloco A"');
  assert.equal(celulaCsv('diz "oi"'), '"diz ""oi"""');
  assert.equal(celulaCsv('linha1\nlinha2'), '"linha1\nlinha2"');
  assert.equal(celulaCsv(42), '42');
  assert.equal(celulaCsv(-3), '-3');
  assert.equal(celulaCsv(null), '');
  assert.equal(linhaCsv(['205', 3, '12.5%']), '205,3,12.5%');
});
