// Escape do HTML das janelas de impressão (src/utils/html.js + reportGenerator):
// dado vindo do PDF (nome de sala) ou do usuário (nome do arquivo) não pode
// virar HTML ativo numa janela da mesma origem do sistema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escaparHtml, numeroSeguro } from '../src/utils/html.js';

test('escaparHtml neutraliza tags e aspas', () => {
  assert.equal(escaparHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escaparHtml("O'Brien & Cia"), 'O&#39;Brien &amp; Cia');
  assert.equal(escaparHtml(null), '');
  assert.equal(escaparHtml(205), '205');
});

test('numeroSeguro só deixa passar número', () => {
  assert.equal(numeroSeguro('42.5'), 42.5);
  assert.equal(numeroSeguro('100%;background:url(x)'), 0);
  assert.equal(numeroSeguro(undefined, 7), 7);
});

test('relatório de heatmap com nome de sala malicioso sai escapado', async () => {
  let escrito = '';
  globalThis.window = {
    open: () => ({ document: { write: (h) => { escrito = h; }, close() {} }, print() {} }),
    alert() {},
  };
  const { generateHeatmapPDF } = await import('../src/utils/reportGenerator.js');
  generateHeatmapPDF({
    heatmap: [{ sala: '<script>alert(document.cookie)</script>', contagemPorDia: { Segunda: '<b>3</b>' }, totalSala: 3, percSala: 10 }],
    mxCount: 3, percGeral: 10, totalOccupied: 3,
  }, ['Segunda']);
  assert.ok(escrito.includes('&lt;script&gt;alert(document.cookie)&lt;/script&gt;'));
  assert.ok(!escrito.includes('<script>alert'));
  assert.ok(!escrito.includes('<b>3</b>'));
  delete globalThis.window;
});

test('pop-up bloqueado não quebra (avisa e devolve)', async () => {
  let avisou = false;
  globalThis.window = { open: () => null, alert: () => { avisou = true; } };
  const { generateHeatmapPDF } = await import('../src/utils/reportGenerator.js');
  assert.doesNotThrow(() => generateHeatmapPDF({ heatmap: [{ sala: '101', contagemPorDia: {}, totalSala: 0, percSala: 0 }], mxCount: 1 }, []));
  assert.equal(avisou, true);
  delete globalThis.window;
});
