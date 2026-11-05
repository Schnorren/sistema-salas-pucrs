import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarRelatorio } from '../src/utils/relatorioEmprestimos.js';
import { gerarPdfRelatorio, textoPdf, escalaEixo } from '../src/utils/pdfRelatorioEmprestimos.js';

const PONTO = 'p1';
const dadosBase = (n) => ({
  pontos: [{ id: PONTO, nome: 'Recepção' }],
  itens: [{ id: 'i1', nome: 'Bola de Pebolim', patrimonio: 'PEB-1', categoria: 'Jogos', ponto: PONTO, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' }],
  registros: Array.from({ length: n }, (_, k) => {
    const ret = new Date(Date.UTC(2026, 2, 2 + (k % 25), 13 + (k % 8), k % 60));
    return { item: 'i1', ponto: PONTO, retirada: ret.toISOString(), devolucao: new Date(ret.getTime() + 30 * 60000).toISOString(), status: 'CONCLUIDO', ocorrencia: null };
  }),
  retiradasPorAluno: Array.from({ length: 40 }, (_, k) => Math.floor(n / 40) + (k < n % 40 ? 1 : 0)),
});
const periodo = { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59', agora: new Date('2026-11-05T15:00:00Z') };
const meta = { predioNome: 'Prédio 15', pontoNome: 'Recepção', geradoEm: new Date('2026-11-05T17:30:00Z'), geradoPor: 'gestora@pucrs.br' };
// Sem compressão, o texto do PDF aparece legível no arquivo (WinAnsi = latin1)
const conteudo = (pdf) => Buffer.from(pdf.output('arraybuffer')).toString('latin1');

test('PDF: cabeçalho com prédio, ponto, período e data de geração; rodapé paginado', () => {
  const pdf = gerarPdfRelatorio(montarRelatorio(dadosBase(30), periodo), meta, { compress: false });
  const txt = conteudo(pdf);
  assert.ok(txt.includes('Período: 01/03/2026 00:00 a 31/03/2026 23:59'));
  assert.ok(txt.includes('Prédio 15  ·  Recepção'));
  assert.ok(txt.includes('Gerado em 05/11/2026 14:30'));
  assert.ok(txt.includes('Retiradas por dia'));
  assert.ok(txt.includes(`Página 1 de ${pdf.getNumberOfPages()}`));
  assert.ok(!txt.includes('/Subtype /Image'), 'PDF é vetorial, sem captura de tela');
  // Anônimo: sem tabela de alunos nem colunas Aluno/Matrícula (dados confidenciais)
  assert.ok(!txt.includes('(ALUNO)') && !txt.includes('MATRÍCULA') && !txt.includes('(Alunos)'));
});

test('PDF: só o resumo, sem a lista de retiradas — o tamanho não cresce com o período', () => {
  const pequeno = gerarPdfRelatorio(montarRelatorio(dadosBase(41), periodo), meta, { compress: false });
  const grande = gerarPdfRelatorio(montarRelatorio(dadosBase(1200), periodo), meta, { compress: false });
  for (const pdf of [pequeno, grande]) {
    const txt = conteudo(pdf);
    assert.ok(!txt.includes('Registro de retiradas'), 'lista de retiradas fica fora do PDF (decisão do usuário)');
    assert.ok(!txt.includes('da mais recente para a mais antiga'));
    assert.ok(!txt.includes('DEVOLUÇÃO') && !txt.includes('(DURA'), 'sem o cabeçalho da tabela');
    assert.ok(txt.includes('Itens mais retirados'), 'os gráficos continuam');
  }
  assert.equal(grande.getNumberOfPages(), pequeno.getNumberOfPages());
  assert.ok(grande.getNumberOfPages() <= 3);
  assert.ok(gerarPdfRelatorio(montarRelatorio(dadosBase(1200), periodo), meta).output('arraybuffer').byteLength < 100 * 1024);
});

test('PDF da rede: título próprio, retiradas por prédio e ranking somando os prédios', () => {
  const dados = {
    pontos: [{ id: 'r15', nome: 'Recepção', predio: 'Prédio 15' }, { id: 'r9', nome: 'Recepção', predio: 'Prédio 9' }],
    itens: [
      { id: 'u15', nome: 'Uno', patrimonio: 'U-15', categoria: 'Jogos', ponto: 'r15', ativo: true },
      { id: 'u9', nome: 'Uno', patrimonio: 'U-9', categoria: 'Jogos', ponto: 'r9', ativo: true },
    ],
    registros: [
      { item: 'u15', ponto: 'r15', retirada: '2026-03-02T13:00:00Z', devolucao: '2026-03-02T13:30:00Z', status: 'CONCLUIDO', ocorrencia: null },
      { item: 'u9', ponto: 'r9', retirada: '2026-03-03T13:00:00Z', devolucao: '2026-03-03T13:30:00Z', status: 'CONCLUIDO', ocorrencia: null },
    ],
    retiradasPorAluno: [1, 1],
  };
  const pdf = gerarPdfRelatorio(montarRelatorio(dados, periodo), {
    ...meta, titulo: 'Relatório de Empréstimos da Rede', predioNome: '', pontoNome: 'Todos os pontos liberados (2 prédios, 2 pontos)',
  }, { compress: false });
  const txt = conteudo(pdf);
  assert.ok(txt.includes('Relatório de Empréstimos da Rede'));
  assert.ok(txt.includes('Retiradas por prédio'));
  assert.ok(txt.includes('somando os prédios'));
  assert.ok(!txt.includes('Retiradas por ponto de empr'), 'um ponto por prédio: sem o bloco repetido');
});

test('PDF: período sem retiradas não quebra', () => {
  const pdf = gerarPdfRelatorio(montarRelatorio({ pontos: [], itens: [], registros: [] }, periodo), meta, { compress: false });
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(conteudo(pdf).includes('Nenhuma retirada registrada neste período.'));
});

test('PDF: texto fora do Latin-1 é trocado (as fontes padrão do PDF não têm esses caracteres)', () => {
  assert.equal(textoPdf('Ação – “ok” … Ştefan'), 'Ação - "ok" ... Stefan');
  assert.equal(textoPdf('😀'), '?');
  assert.equal(textoPdf(null), '');
});

test('PDF: eixo do gráfico com marcas inteiras e redondas', () => {
  assert.deepEqual(escalaEixo(10), { passo: 5, marcas: 2, teto: 10 });
  assert.deepEqual(escalaEixo(7), { passo: 2, marcas: 4, teto: 8 });
  assert.deepEqual(escalaEixo(183), { passo: 50, marcas: 4, teto: 200 });
  assert.deepEqual(escalaEixo(1), { passo: 1, marcas: 1, teto: 1 });
  assert.deepEqual(escalaEixo(0), { passo: 1, marcas: 1, teto: 1 });
});
