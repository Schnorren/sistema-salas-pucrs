import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarRelatorio, escolherGranularidade, periodoPredefinido, periodoAtivo,
  nomeArquivoRelatorio, linhasCsvRelatorio, descreverPeriodo, descreverRetirada, formatarDataHora,
  agruparPontosPorPredio, selecaoDaRede,
} from '../src/utils/relatorioEmprestimos.js';

const RECEPCAO = 'p-recepcao';
const SECRETARIA = 'p-secretaria';
const pontos = [{ id: RECEPCAO, nome: 'Recepção' }, { id: SECRETARIA, nome: 'Secretaria' }];
const itens = [
  { id: 'peb1', nome: 'Bola de Pebolim', patrimonio: 'PEB-1', categoria: 'Jogos', ponto: RECEPCAO, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' },
  { id: 'peb2', nome: 'Bola de Pebolim', patrimonio: 'PEB-2', categoria: 'Jogos', ponto: RECEPCAO, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' },
  { id: 'ping', nome: 'Kit Ping Pong', patrimonio: 'PP-1', categoria: 'Jogos', ponto: RECEPCAO, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' },
  { id: 'car', nome: 'Carregador USB-C', patrimonio: 'CAR-1', categoria: 'Carregadores', ponto: SECRETARIA, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' },
  // não contam como "sem retirada": baixado, cadastrado depois do período, de outro ponto
  { id: 'velho', nome: 'Dama', patrimonio: 'DM-1', categoria: 'Jogos', ponto: RECEPCAO, ativo: false, criadoEm: '2026-01-01T03:00:00+00:00' },
  { id: 'novo', nome: 'Xadrez', patrimonio: 'XD-1', categoria: 'Jogos', ponto: RECEPCAO, ativo: true, criadoEm: '2026-04-10T15:00:00+00:00' },
  { id: 'alheio', nome: 'Cabo HDMI', patrimonio: 'HD-1', categoria: 'Cabos', ponto: 'p-outro', ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' },
];
// Horários em UTC; Brasília = UTC-3. Sem aluno: a API não manda nome nem matrícula.
const reg = (item, ponto, retirada, devolucao, extra = {}) =>
  ({ item, ponto, retirada, devolucao, status: devolucao ? 'CONCLUIDO' : 'ATIVO', ocorrencia: null, ...extra });
const registros = [
  reg('peb1', RECEPCAO, '2026-03-02T13:00:00+00:00', '2026-03-02T13:10:00+00:00'), // seg 10:00, 10 min
  reg('peb1', RECEPCAO, '2026-03-04T11:00:00+00:00', '2026-03-04T11:40:00+00:00'), // qua 08:00, 40 min
  reg('peb2', RECEPCAO, '2026-03-04T11:30:00+00:00', '2026-03-04T14:30:00+00:00'), // qua 08:30, 3 h
  reg('car', SECRETARIA, '2026-03-10T21:00:00+00:00', null), // ter 18:00, em aberto
  reg('peb2', RECEPCAO, '2026-03-03T02:59:30+00:00', null, { status: 'EXTRAVIADO', ocorrencia: 'NAO_DEVOLVIDO' }), // seg 02/03 23:59
  reg('peb1', RECEPCAO, '2026-03-05T12:00:00+00:00', '2026-03-05T12:20:00+00:00', { ocorrencia: 'DEVOLVIDO_COM_PROBLEMA' }), // qui 09:00, 20 min
];
const retiradasPorAluno = [3, 2, 1]; // três alunos: um com 3, um com 2, um com 1
const periodo = { inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59', agora: new Date('2026-11-05T15:00:00Z') };

test('relatório: totais, situações e duração típica', () => {
  const r = montarRelatorio({ pontos, itens, registros, retiradasPorAluno }, periodo);
  assert.equal(r.resumo.retiradas, 6);
  assert.equal(r.resumo.alunos, 3);
  assert.equal(r.resumo.mediaPorAluno, 2);
  assert.equal(r.resumo.alunosRecorrentes, 2); // Ana 3, Bruno 2, Caio 1
  assert.equal(r.resumo.comProblema, 1);
  assert.equal(r.resumo.devolvidas, 4); // 10, 40, 180, 20 (o não devolvido não entra)
  assert.equal(r.resumo.duracaoMediana, 30);
  assert.equal(r.resumo.minutosTotais, 250);
  assert.equal(r.resumo.itensUsados, 3);
  assert.equal(r.resumo.itensNoAcervo, 4); // peb1, peb2, ping, car
  assert.ok(r.variosPontos);
  assert.equal(r.periodo.texto, '01/03/2026 00:00 a 31/03/2026 23:59');
});

test('relatório: itens de mesmo nome levam o patrimônio; acervo sem uso respeita ponto, baixa e cadastro', () => {
  const r = montarRelatorio({ pontos, itens, registros, retiradasPorAluno }, periodo);
  assert.deepEqual(r.itensMaisRetirados.map(i => [i.nome, i.quantidade]), [
    ['Bola de Pebolim (PEB-1)', 3], ['Bola de Pebolim (PEB-2)', 2], ['Carregador USB-C', 1],
  ]);
  assert.deepEqual(r.itensMaisTempo.map(i => [i.nome, i.horas]), [['Bola de Pebolim (PEB-2)', 3], ['Bola de Pebolim (PEB-1)', 1.2]]);
  assert.deepEqual(r.itensSemUso.map(i => i.nome), ['Kit Ping Pong']);
  assert.deepEqual(r.porPonto.map(p => [p.nome, p.quantidade]), [['Recepção', 5], ['Secretaria', 1]]);
  assert.deepEqual(r.porCategoria.map(c => [c.nome, c.quantidade]), [['Jogos', 5], ['Carregadores', 1]]);
});

test('relatório: anônimo, faixas de duração e frequência dos alunos', () => {
  const r = montarRelatorio({ pontos, itens, registros, retiradasPorAluno }, periodo);
  assert.equal(r.alunos, undefined);
  for (const linha of r.registros) assert.ok(!('aluno' in linha) && !('matricula' in linha));
  assert.deepEqual(r.faixasDuracao.map(f => f.quantidade), [1, 1, 1, 0, 1, 0]); // 10 | 20 | 40 | - | 180 | -
  assert.deepEqual(r.frequenciaAlunos.map(f => f.quantidade), [1, 2, 0, 0]);
});

test('relatório: mapa de calor e registro no horário de Brasília (não no UTC)', () => {
  const r = montarRelatorio({ pontos, itens, registros, retiradasPorAluno }, periodo);
  const { horas, dias, maximo } = r.mapaCalor;
  assert.equal(horas[0], 7);
  assert.equal(horas.at(-1), 23); // a retirada das 23:59 abre a faixa até 23h
  assert.deepEqual(dias.map(d => d.dia), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']);
  const valor = (dia, hora) => dias.find(d => d.dia === dia).valores[horas.indexOf(hora)];
  assert.equal(valor('Qua', 8), 2);
  assert.equal(valor('Seg', 23), 1);
  assert.equal(valor('Ter', 18), 1);
  assert.equal(maximo, 2);
  assert.equal(r.resumo.pico, 'Qua, 08h (2)');
  assert.equal(formatarDataHora(registros[4].retirada), '02/03/2026 23:59');
  assert.equal(r.registros[0].item, 'Carregador USB-C'); // mais nova primeiro
  assert.equal(descreverRetirada(r.registros.find(x => x.situacao === 'nao_devolvido')), 'Não devolvido');
  assert.equal(descreverRetirada(r.registros.find(x => x.itemId === 'peb2' && x.duracaoMin)), '3h');
});

test('série: granularidade pelo tamanho do período, zeros preenchidos e fim limitado a agora', () => {
  assert.equal(escolherGranularidade('2026-03-04T00:00', '2026-03-04T23:59'), 'hora');
  assert.equal(escolherGranularidade('2026-03-01T00:00', '2026-03-31T23:59'), 'dia');
  assert.equal(escolherGranularidade('2026-01-01T00:00', '2026-03-31T23:59'), 'semana');
  assert.equal(escolherGranularidade('2026-01-01T00:00', '2026-12-31T23:59'), 'mes');

  const mes = montarRelatorio({ pontos, itens, registros, retiradasPorAluno }, periodo).serie;
  assert.equal(mes.titulo, 'Retiradas por dia');
  assert.equal(mes.barras.length, 31);
  assert.deepEqual(mes.barras.slice(0, 5).map(b => [b.rotulo, b.quantidade]), [['01/03', 0], ['02/03', 2], ['03/03', 0], ['04/03', 2], ['05/03', 1]]);
  assert.equal(mes.barras[1].rotuloLongo, 'Seg, 02/03/2026');

  // "Este ano" visto em 05/11: só até novembro
  const ano = montarRelatorio({ pontos, itens, registros }, { inicio: '2026-01-01T00:00', fim: '2026-12-31T23:59', agora: new Date('2026-11-05T15:00:00Z') }).serie;
  assert.deepEqual(ano.barras.map(b => b.rotulo), ['jan/26', 'fev/26', 'mar/26', 'abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26', 'nov/26']);
  assert.equal(ano.barras[2].quantidade, 6);
  assert.equal(ano.barras[2].rotuloLongo, 'março de 2026');

  // Semanas começam na segunda; a primeira barra mostra o início do período
  const tri = montarRelatorio({ pontos, itens, registros }, { inicio: '2026-02-01T00:00', fim: '2026-04-30T23:59', agora: periodo.agora }).serie;
  assert.equal(tri.barras[0].rotulo, '01/02');
  assert.equal(tri.barras[0].rotuloLongo, '01/02/2026 a 01/02/2026'); // domingo
  assert.equal(tri.barras[1].rotulo, '02/02');
  const semana2Mar = tri.barras.find(b => b.chave === '2026-03-02');
  assert.equal(semana2Mar.quantidade, 5); // seg 02 (2, uma às 23:59), qua 04 (2), qui 05 (1)
});

test('série por hora: dia de hoje vai das 7h até a hora atual', () => {
  const hoje = [reg('peb1', RECEPCAO, '2026-11-05T11:15:00+00:00', null)]; // 08:15
  const s = montarRelatorio({ pontos, itens, registros: hoje }, { inicio: '2026-11-05T00:00', fim: '2026-11-05T23:59', agora: new Date('2026-11-05T13:30:00Z') }).serie;
  assert.equal(s.granularidade, 'hora');
  assert.deepEqual(s.barras.map(b => b.rotulo), ['07h', '08h', '09h', '10h']);
  assert.equal(s.barras[1].quantidade, 1);
});

test('relatório vazio não quebra', () => {
  const r = montarRelatorio({ pontos: [], itens: [], registros: [] }, periodo);
  assert.equal(r.resumo.retiradas, 0);
  assert.equal(r.resumo.mediaPorAluno, 0);
  assert.equal(r.resumo.duracaoMediana, null);
  assert.equal(r.resumo.pico, null);
  assert.equal(r.mapaCalor.maximo, 0);
  assert.equal(r.serie.barras.length, 31);
  assert.equal(r.variosPontos, false);
  assert.equal(montarRelatorio(null, periodo).resumo.retiradas, 0);
});

test('períodos predefinidos no horário de Brasília', () => {
  const agora = new Date('2026-01-01T02:00:00Z'); // ainda 31/12/2025 23:00 em Brasília
  assert.deepEqual(periodoPredefinido('hoje', agora), { inicio: '2025-12-31T00:00', fim: '2025-12-31T23:59' });
  assert.deepEqual(periodoPredefinido('7dias', agora), { inicio: '2025-12-25T00:00', fim: '2025-12-31T23:59' });
  assert.deepEqual(periodoPredefinido('mes', agora), { inicio: '2025-12-01T00:00', fim: '2025-12-31T23:59' });
  assert.deepEqual(periodoPredefinido('mes_passado', agora), { inicio: '2025-11-01T00:00', fim: '2025-11-30T23:59' });
  assert.deepEqual(periodoPredefinido('ano', agora), { inicio: '2025-01-01T00:00', fim: '2025-12-31T23:59' });
  const janeiro = new Date('2026-01-15T15:00:00Z');
  assert.deepEqual(periodoPredefinido('mes_passado', janeiro), { inicio: '2025-12-01T00:00', fim: '2025-12-31T23:59' });
  assert.deepEqual(periodoPredefinido('mes', new Date('2028-02-10T15:00:00Z')).fim, '2028-02-29T23:59');
  assert.equal(periodoAtivo('2025-12-01T00:00', '2025-12-31T23:59', agora), 'mes');
  assert.equal(periodoAtivo('2025-12-01T00:00', '2025-12-30T23:59', agora), null);
  assert.equal(periodoPredefinido('outra', agora), null);
});

test('arquivo: nome com prédio, período e ponto; planilha com o registro completo', () => {
  assert.equal(nomeArquivoRelatorio({ predioNome: 'Prédio 15', inicio: '2026-01-01T00:00', fim: '2026-12-31T23:59' }),
    'Emprestimos_Predio-15_2026-01-01_a_2026-12-31.pdf');
  assert.equal(nomeArquivoRelatorio({ predioNome: 'Prédio 15', pontoNome: 'Recepção / Térreo', inicio: '2026-01-01T00:00', fim: '2026-01-31T23:59', extensao: 'csv' }),
    'Emprestimos_Predio-15_2026-01-01_a_2026-01-31_Recepcao-Terreo.csv');

  // Nome de item vindo da tela de gestão começando com "=" não vira fórmula no Excel
  const itensComFormula = [...itens, { id: 'f', nome: '=HYPERLINK("x")', patrimonio: 'F-1', categoria: 'Jogos', ponto: RECEPCAO, ativo: true }];
  const comFormula = [...registros, reg('f', RECEPCAO, '2026-03-20T13:00:00+00:00', '2026-03-20T13:05:00+00:00')];
  const linhas = linhasCsvRelatorio(montarRelatorio({ pontos, itens: itensComFormula, registros: comFormula, retiradasPorAluno }, periodo));
  assert.equal(linhas.length, 8);
  assert.equal(linhas[0], 'Retirada,Devolução,Duração (min),Situação,Ponto,Categoria,Item,Patrimônio');
  assert.equal(linhas[1], '20/03/2026 10:00,20/03/2026 10:05,5,Devolvido,Recepção,Jogos,"\'=HYPERLINK(""x"")",F-1');
  assert.ok(linhas.some(l => l.startsWith('02/03/2026 23:59,,,Não devolvido,')));
  assert.equal(descreverPeriodo('2026-01-01T00:00', '2026-12-31T23:59'), '01/01/2026 00:00 a 31/12/2026 23:59');
});

// ------------------------------------------------- relatório da rede
// Recepções de três prédios (cada ponto traz o prédio) e uma Secretaria no 15.
const R15 = 'r15'; const R9 = 'r9'; const R32 = 'r32'; const S15 = 's15';
const pontosRede = [
  { id: R15, nome: 'Recepção', predioId: 'p15', predio: 'Prédio 15' },
  { id: R9, nome: 'Recepção', predioId: 'p9', predio: 'Prédio 9' },
  { id: R32, nome: 'Recepção', predioId: 'p32', predio: 'Prédio 32' },
];
const itemRede = (id, nome, ponto, patrimonio) => ({ id, nome, patrimonio, categoria: 'Jogos', ponto, ativo: true, criadoEm: '2026-01-01T03:00:00+00:00' });
const itensRede = [
  itemRede('uno15', 'Uno', R15, 'U-15'), itemRede('uno9', 'UNO ', R9, 'U-9'), itemRede('dom32', 'Dominó', R32, 'D-32'),
  itemRede('xad9', 'Xadrez', R9, 'X-9'), itemRede('car15', 'Carregador', S15, 'C-15'),
];
const registrosRede = [
  reg('uno15', R15, '2026-03-02T13:00:00+00:00', '2026-03-02T13:30:00+00:00'),
  reg('uno15', R15, '2026-03-03T13:00:00+00:00', '2026-03-03T13:30:00+00:00'),
  reg('uno9', R9, '2026-03-04T13:00:00+00:00', '2026-03-04T14:00:00+00:00'),
  reg('dom32', R32, '2026-03-05T13:00:00+00:00', null),
];

test('rede: retiradas por prédio, ponto com o prédio no nome e ranking somando o mesmo jogo', () => {
  const r = montarRelatorio({ pontos: pontosRede, itens: itensRede, registros: registrosRede, retiradasPorAluno: [2, 1, 1] }, periodo);
  assert.equal(r.temPredio, true);
  assert.equal(r.variosPredios, true);
  assert.equal(r.totalPredios, 3);
  assert.deepEqual(r.porPredio, [{ nome: 'Prédio 15', quantidade: 2 }, { nome: 'Prédio 32', quantidade: 1 }, { nome: 'Prédio 9', quantidade: 1 }]);
  assert.equal(r.mostrarPorPonto, false, 'um ponto por prédio: "por ponto" repetiria "por prédio"');
  assert.equal(r.registros[0].ponto, 'Prédio 32 · Recepção');
  // "Uno" e "UNO " são o mesmo jogo: 3 retiradas somando os prédios
  assert.equal(r.itensAgrupadosPorNome, true);
  assert.deepEqual(r.itensMaisRetirados.map(i => [i.nome, i.quantidade]), [['Uno', 3], ['Dominó', 1]]);
  assert.deepEqual(r.itensMaisTempo.map(i => [i.nome, i.minutos]), [['Uno', 120]]);
  // "Itens usados" continua contando exemplares do acervo (4 nas recepções; a Secretaria não entrou)
  assert.equal(r.resumo.itensUsados, 3);
  assert.equal(r.resumo.itensNoAcervo, 4);
  assert.deepEqual(r.itensSemUso.map(i => `${i.nome} · ${i.ponto}`), ['Xadrez · Prédio 9 · Recepção']);
});

test('rede: "por ponto" aparece quando um prédio tem mais de um ponto; um prédio só não muda nada', () => {
  const comSecretaria = [...pontosRede, { id: S15, nome: 'Secretaria', predioId: 'p15', predio: 'Prédio 15' }];
  const r = montarRelatorio({ pontos: comSecretaria, itens: itensRede, registros: registrosRede, retiradasPorAluno: [1] }, periodo);
  assert.equal(r.mostrarPorPonto, true);
  assert.ok(r.porPonto.some(p => p.nome === 'Prédio 15 · Secretaria' && p.quantidade === 0));

  const soUm = montarRelatorio({ pontos: [pontosRede[0]], itens: itensRede, registros: registrosRede.slice(0, 2), retiradasPorAluno: [2] }, periodo);
  assert.equal(soUm.variosPredios, false);
  assert.equal(soUm.itensAgrupadosPorNome, false);
  assert.equal(soUm.registros[0].ponto, 'Recepção');
});

test('rede: planilha com a coluna Prédio e o ponto sem o prédio no nome (tabela dinâmica)', () => {
  const r = montarRelatorio({ pontos: pontosRede, itens: itensRede, registros: registrosRede, retiradasPorAluno: [1] }, periodo);
  const linhas = linhasCsvRelatorio(r);
  assert.equal(linhas[0], 'Retirada,Devolução,Duração (min),Situação,Prédio,Ponto,Categoria,Item,Patrimônio');
  assert.equal(linhas[1], '05/03/2026 10:00,,,Em aberto,Prédio 32,Recepção,Jogos,Dominó,D-32');
  assert.equal(nomeArquivoRelatorio({ predioNome: 'Rede', pontoNome: 'Prédio 9', inicio: '2026-03-01T00:00', fim: '2026-03-31T23:59', extensao: 'csv' }),
    'Emprestimos_Rede_2026-03-01_a_2026-03-31_Predio-9.csv');
});

test('rede: filtro por prédio ou por ponto vira a lista de ids da API', () => {
  const liberados = [
    { id: 'a', nome: 'Recepção', predioId: 'p9', predioNome: 'Prédio 9' },
    { id: 'b', nome: 'Recepção', predioId: 'p15', predioNome: 'Prédio 15' },
    { id: 'c', nome: 'Secretaria', predioId: 'p15', predioNome: 'Prédio 15' },
  ];
  assert.deepEqual(agruparPontosPorPredio(liberados).map(g => [g.predioNome, g.pontos.length]), [['Prédio 9', 1], ['Prédio 15', 2]]);
  assert.deepEqual(selecaoDaRede(liberados, ''), { pontoIds: [], descricao: 'Todos os pontos liberados (2 prédios, 3 pontos)', arquivo: '' });
  assert.deepEqual(selecaoDaRede(liberados, 'predio:p15'), { pontoIds: ['b', 'c'], descricao: 'Prédio 15 · todos os pontos', arquivo: 'Prédio 15' });
  assert.deepEqual(selecaoDaRede(liberados, 'predio:p9').descricao, 'Prédio 9 · Recepção');
  assert.deepEqual(selecaoDaRede(liberados, 'ponto:c'), { pontoIds: ['c'], descricao: 'Prédio 15 · Secretaria', arquivo: 'Prédio 15 Secretaria' });
  // escolha que não existe mais (ponto removido da lista) volta para "todos"
  assert.deepEqual(selecaoDaRede(liberados, 'ponto:zzz').pontoIds, []);
  assert.equal(selecaoDaRede([], '').descricao, 'Todos os pontos liberados (0 prédios, 0 pontos)');
});
