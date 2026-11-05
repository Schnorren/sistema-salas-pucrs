// Cartaz de troca de sala (src/utils/cartazTroca.js): data da aula impressa,
// escape de tudo que vem do formulário/banco e marca do prédio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarHtmlCartaz } from '../src/utils/cartazTroca.js';

const base = {
  nomeAula: 'BRANDED CONTENT', codCred: '97316-04/1', professor: '', predioDestino: '32', salaDestino: '410',
  salaOrigem: '205', periodos: 'LM', horario: '19:15 às 20:45', dia: 'Segunda', dataAula: '2026-11-09',
  nomePredio: 'Prédio 15 - Living 360', logos: { pucrs: '/pucrs.jpeg', living360: '/living.jpeg' }, geradoEm: '05/11/2026 10:00',
};

test('cartaz traz a data da aula (PT e EN) e só os períodos que mudam', () => {
  const html = gerarHtmlCartaz(base);
  assert.match(html, /Segunda-feira, 09\/11\/2026 &nbsp;·&nbsp; PERÍODOS: LM &nbsp;·&nbsp; 19:15 às 20:45/);
  assert.match(html, /Monday, November 9, 2026 only · Periods: LM \(19:15 to 20:45\)/);
  assert.match(html, /<div class="destino-sala">410<\/div>/);
  assert.match(html, /Sala 205/);
  assert.match(html, /COD \/ CRED/);
  assert.doesNotMatch(html, /PROFESSOR/); // campo vazio não aparece
});

test('cartaz escapa dados do formulário e do banco', () => {
  const html = gerarHtmlCartaz({ ...base, nomeAula: '<img src=x onerror=alert(1)>', salaDestino: '"><script>x</script>', professor: "O'Neil & Cia" });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /O&#39;Neil &amp; Cia/);
});

test('logo do Living 360 só no prédio 15; nos outros, o nome do prédio', () => {
  assert.match(gerarHtmlCartaz(base), /<img class="header-logo-living360"/);
  const outro = gerarHtmlCartaz({ ...base, nomePredio: 'Prédio 32 <b>' });
  assert.doesNotMatch(outro, /<img class="header-logo-living360"/);
  assert.match(outro, /<div class="header-predio">Prédio 32 &lt;b&gt;<\/div>/);
});
