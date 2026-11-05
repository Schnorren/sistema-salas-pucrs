// Relatório de empréstimos: TODAS as contas da tela, do PDF e da planilha,
// a partir dos dados brutos de GET /api/emprestimos/relatorio (função
// emprestimo_relatorio, supabase/migrations/emprestimos_relatorio.sql).
// Puro (sem React/DOM), testado em tests/relatorioEmprestimos.test.js.
//
// Datas sempre no horário de Brasília. O período chega como no
// <input type="datetime-local">: "AAAA-MM-DDTHH:mm".
//
// ANÔNIMO: nome e matrícula de aluno não entram no relatório (dados
// confidenciais — decisão do usuário, 05/11/2026). A API manda só
// `retiradasPorAluno` (quantas retiradas cada um fez), sem identificar ninguém.

import { mediana, minutosEntre, formatarDuracao, partesSP, inputDataHoraSP } from '../../backend_core/utils/emprestimoRegras.js';
import { linhaCsv } from './csv.js';

const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']; // índice = dia ISO - 1
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIA_MS = 86400000;

// Horário em que o mapa de calor sempre aparece (abre para fora se houver retirada)
const HORA_INICIAL = 7;
const HORA_FINAL = 22;

export const SITUACOES = Object.freeze({
  aberto: 'Em aberto',
  devolvido: 'Devolvido',
  problema: 'Devolvido com problema',
  nao_devolvido: 'Não devolvido',
});

export const TITULO_SERIE = Object.freeze({
  hora: 'Retiradas por hora',
  dia: 'Retiradas por dia',
  semana: 'Retiradas por semana',
  mes: 'Retiradas por mês',
});

// Faixas de tempo de uso: [limite superior em minutos (exclusivo), rótulo]
const FAIXAS_DURACAO = [
  [15, 'Até 15 min'],
  [30, '15 a 30 min'],
  [60, '30 min a 1 h'],
  [120, '1 a 2 h'],
  [240, '2 a 4 h'],
  [Infinity, 'Mais de 4 h'],
];

// Quantas vezes cada aluno retirou: [mínimo, máximo, rótulo]
const FAIXAS_FREQUENCIA = [
  [1, 1, '1 vez'],
  [2, 3, '2 a 3 vezes'],
  [4, 9, '4 a 9 vezes'],
  [10, Infinity, '10 vezes ou mais'],
];

// --------------------------------------------------------------- datas
const pad = (n) => String(n).padStart(2, '0');
const RE_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "AAAA-MM-DDTHH:mm" → { dia: "AAAA-MM-DD", hora: 0..23 } (null se inválido)
const lerInput = (valor) => {
  const m = RE_INPUT.exec(String(valor || ''));
  return m ? { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: Number(m[4]) } : null;
};

// Dia de calendário ("AAAA-MM-DD") ↔ milissegundos UTC da meia-noite (só aritmética de dias)
const diaParaMs = (dia) => Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)));
const msParaDia = (ms) => new Date(ms).toISOString().slice(0, 10);
const somarDias = (dia, n) => msParaDia(diaParaMs(dia) + n * DIA_MS);
const diaIso = (dia) => ((new Date(diaParaMs(dia)).getUTCDay() + 6) % 7) + 1; // 1 = segunda … 7 = domingo
const segundaDaSemana = (dia) => somarDias(dia, 1 - diaIso(dia));
const diaBr = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const diaMesBr = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ISO do banco → { dia, hora, diaSemana, input } no horário de Brasília
const momentoSP = (iso) => {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const p = partesSP(d);
  const dia = `${p.ano}-${p.mes}-${p.dia}`;
  return { dia, hora: Number(p.hora), diaSemana: diaIso(dia), input: `${dia}T${p.hora}:${p.minuto}` };
};

// "2026-03-04T08:05" → "04/03/2026 08:05"
export const formatarInputBr = (valor) => {
  const m = RE_INPUT.exec(String(valor || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '--';
};

// ISO do banco → "04/03/2026 08:05" (Brasília)
export const formatarDataHora = (iso) => {
  if (!iso) return '--';
  const m = momentoSP(iso);
  return m ? formatarInputBr(m.input) : '--';
};

export const descreverPeriodo = (inicio, fim) => `${formatarInputBr(inicio)} a ${formatarInputBr(fim)}`;

// 1234.5 → "1.234,5" (casas fixas)
export const formatarNumero = (valor, casas = 0) =>
  Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Horas de uso para rótulos: 0,4 h · 12,5 h · 657 h
export const formatarHoras = (minutos) => {
  const h = (minutos || 0) / 60;
  return `${formatarNumero(h, h >= 100 ? 0 : 1)} h`;
};

// ------------------------------------------------- períodos predefinidos
export const PERIODOS_PREDEFINIDOS = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7dias', rotulo: 'Últimos 7 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: 'ano', rotulo: 'Este ano' },
];

const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1..12

// { inicio, fim } no formato do input (Brasília); null se a chave não existe
export const periodoPredefinido = (chave, agora = new Date()) => {
  const hoje = inputDataHoraSP(agora).slice(0, 10);
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const intervalo = (de, ate) => ({ inicio: `${de}T00:00`, fim: `${ate}T23:59` });
  switch (chave) {
    case 'hoje': return intervalo(hoje, hoje);
    case '7dias': return intervalo(somarDias(hoje, -6), hoje);
    case 'mes': return intervalo(`${ano}-${pad(mes)}-01`, `${ano}-${pad(mes)}-${pad(ultimoDiaDoMes(ano, mes))}`);
    case 'mes_passado': {
      const a = mes === 1 ? ano - 1 : ano;
      const m = mes === 1 ? 12 : mes - 1;
      return intervalo(`${a}-${pad(m)}-01`, `${a}-${pad(m)}-${pad(ultimoDiaDoMes(a, m))}`);
    }
    case 'ano': return intervalo(`${ano}-01-01`, `${ano}-12-31`);
    default: return null;
  }
};

// Qual predefinição corresponde a { inicio, fim } (para destacar o botão)
export const periodoAtivo = (inicio, fim, agora = new Date()) =>
  PERIODOS_PREDEFINIDOS.find(p => {
    const r = periodoPredefinido(p.chave, agora);
    return r.inicio === inicio && r.fim === fim;
  })?.chave || null;

// ------------------------------------------------------ série no tempo
// Até 1 dia: por hora · até 62 dias: por dia · até 182: por semana · acima: por mês
export const escolherGranularidade = (inicio, fim) => {
  const a = lerInput(inicio);
  const b = lerInput(fim);
  if (!a || !b) return 'dia';
  const dias = Math.round((diaParaMs(b.dia) - diaParaMs(a.dia)) / DIA_MS) + 1;
  if (dias <= 1) return 'hora';
  if (dias <= 62) return 'dia';
  if (dias <= 182) return 'semana';
  return 'mes';
};

// Barras da série com os zeros preenchidos. O fim é limitado a "agora": o
// relatório de "Este ano" não desenha os meses que ainda não chegaram.
const montarSerie = (momentos, inicio, fim, agora) => {
  const granularidade = escolherGranularidade(inicio, fim);
  const ini = lerInput(inicio);
  const agoraInput = inputDataHoraSP(agora);
  const fimEfetivo = (agoraInput >= inicio && agoraInput < fim) ? agoraInput : fim;
  const fimL = lerInput(fimEfetivo);
  if (!ini || !fimL) return { granularidade, titulo: TITULO_SERIE[granularidade], barras: [] };

  const contagem = new Map();
  const chaveDe = (m) => {
    if (granularidade === 'hora') return m.hora;
    if (granularidade === 'dia') return m.dia;
    if (granularidade === 'semana') return segundaDaSemana(m.dia);
    return m.dia.slice(0, 7);
  };
  for (const m of momentos) contagem.set(chaveDe(m), (contagem.get(chaveDe(m)) || 0) + 1);

  const barras = [];
  const empurrar = (chave, rotulo, rotuloLongo) => barras.push({ chave, rotulo, rotuloLongo, quantidade: contagem.get(chave) || 0 });

  if (granularidade === 'hora') {
    const horasComDados = momentos.map(m => m.hora);
    const de = Math.max(ini.hora, Math.min(HORA_INICIAL, ...horasComDados));
    const ate = Math.min(fimL.hora, Math.max(HORA_FINAL, ...horasComDados));
    for (let h = de; h <= ate; h++) empurrar(h, `${pad(h)}h`, `${pad(h)}:00 às ${pad(h)}:59`);
  } else if (granularidade === 'dia') {
    for (let d = ini.dia; d <= fimL.dia; d = somarDias(d, 1)) {
      empurrar(d, diaMesBr(d), `${DIAS_CURTOS[diaIso(d) - 1]}, ${diaBr(d)}`);
    }
  } else if (granularidade === 'semana') {
    for (let s = segundaDaSemana(ini.dia); s <= fimL.dia; s = somarDias(s, 7)) {
      const de = s < ini.dia ? ini.dia : s;
      const domingo = somarDias(s, 6);
      const ate = domingo > fimL.dia ? fimL.dia : domingo;
      empurrar(s, diaMesBr(de), `${diaBr(de)} a ${diaBr(ate)}`);
    }
  } else {
    let [a, m] = [Number(ini.dia.slice(0, 4)), Number(ini.dia.slice(5, 7))];
    const fimChave = fimL.dia.slice(0, 7);
    for (let chave = `${a}-${pad(m)}`; chave <= fimChave; chave = `${a}-${pad(m)}`) {
      empurrar(chave, `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`, `${MESES_LONGOS[m - 1]} de ${a}`);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  }
  return { granularidade, titulo: TITULO_SERIE[granularidade], barras };
};

// ---------------------------------------------------------- relatório
const situacaoDe = (r) => {
  if (r.status === 'EXTRAVIADO' || r.ocorrencia === 'NAO_DEVOLVIDO') return 'nao_devolvido';
  if (!r.devolucao) return 'aberto';
  return r.ocorrencia === 'DEVOLVIDO_COM_PROBLEMA' ? 'problema' : 'devolvido';
};

const porQuantidadeDepoisNome = (a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR');

// dados: { pontos, itens, registros, retiradasPorAluno } da API · periodo: { inicio, fim }
export const montarRelatorio = (dados, { inicio, fim, agora = new Date() } = {}) => {
  const pontos = dados?.pontos || [];
  const itens = dados?.itens || [];
  const brutos = dados?.registros || [];
  const porAluno = (dados?.retiradasPorAluno || []).filter(n => Number.isFinite(n) && n > 0);

  const nomePonto = new Map(pontos.map(p => [p.id, p.nome]));
  const itemPorId = new Map(itens.map(i => [i.id, i]));
  // Itens de mesmo nome ("Bola de Pebolim" ×2) levam o patrimônio no rótulo
  const vezesDoNome = new Map();
  for (const i of itens) vezesDoNome.set(i.nome, (vezesDoNome.get(i.nome) || 0) + 1);
  const rotuloItem = (item) => {
    if (!item) return 'Item removido';
    return vezesDoNome.get(item.nome) > 1 && item.patrimonio ? `${item.nome} (${item.patrimonio})` : item.nome;
  };

  // Retiradas normalizadas, da mais nova para a mais antiga
  const registros = brutos
    .map(r => {
      const momento = momentoSP(r.retirada);
      if (!momento) return null;
      const item = itemPorId.get(r.item);
      const situacao = situacaoDe(r);
      const duracaoMin = situacao === 'devolvido' || situacao === 'problema' ? minutosEntre(r.retirada, r.devolucao) : null;
      return {
        retirada: r.retirada,
        devolucao: r.devolucao || null,
        momento,
        duracaoMin,
        situacao,
        itemId: r.item,
        item: rotuloItem(item),
        patrimonio: item?.patrimonio || '',
        categoria: item?.categoria || 'Sem categoria',
        pontoId: r.ponto,
        ponto: nomePonto.get(r.ponto) || '--',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.retirada < b.retirada ? 1 : a.retirada > b.retirada ? -1 : 0));

  const duracoes = registros.filter(r => r.duracaoMin != null).map(r => r.duracaoMin);
  const minutosTotais = duracoes.reduce((s, m) => s + m, 0);

  // ---- itens
  const usoPorItem = new Map();
  for (const r of registros) {
    const u = usoPorItem.get(r.itemId) || { id: r.itemId, nome: r.item, categoria: r.categoria, quantidade: 0, minutos: 0 };
    u.quantidade += 1;
    u.minutos += r.duracaoMin || 0;
    usoPorItem.set(r.itemId, u);
  }
  const usos = [...usoPorItem.values()];
  const itensMaisRetirados = [...usos].sort(porQuantidadeDepoisNome).slice(0, 10);
  const itensMaisTempo = usos
    .filter(u => u.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 10)
    .map(u => ({ ...u, horas: Math.round((u.minutos / 60) * 10) / 10 }));

  // Acervo do relatório: itens dos pontos escolhidos, ativos e já cadastrados no fim do período
  const pontosDoRelatorio = new Set(pontos.map(p => p.id));
  const acervo = itens.filter(i => pontosDoRelatorio.has(i.ponto) && i.ativo !== false
    && (!i.criadoEm || (momentoSP(i.criadoEm)?.input || '') <= fim));
  const itensSemUso = acervo
    .filter(i => !usoPorItem.has(i.id))
    .map(i => ({ id: i.id, nome: rotuloItem(i), categoria: i.categoria || 'Sem categoria', ponto: nomePonto.get(i.ponto) || '--' }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  // ---- agrupamentos
  const contar = (chaveDe) => {
    const m = new Map();
    for (const r of registros) { const k = chaveDe(r); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const porPontoMap = contar(r => r.pontoId);
  const porPonto = pontos.map(p => ({ id: p.id, nome: p.nome, quantidade: porPontoMap.get(p.id) || 0 })).sort(porQuantidadeDepoisNome);
  const porCategoria = [...contar(r => r.categoria)].map(([nome, quantidade]) => ({ nome, quantidade })).sort(porQuantidadeDepoisNome);

  const faixasDuracao = FAIXAS_DURACAO.map(([, rotulo]) => ({ rotulo, quantidade: 0 }));
  for (const m of duracoes) faixasDuracao[FAIXAS_DURACAO.findIndex(([limite]) => m < limite)].quantidade += 1;

  const frequenciaAlunos = FAIXAS_FREQUENCIA.map(([min, max, rotulo]) => ({
    rotulo, quantidade: porAluno.filter(n => n >= min && n <= max).length,
  }));

  // ---- mapa de calor: dia da semana × hora da retirada
  const horasDados = registros.map(r => r.momento.hora);
  const horaDe = Math.min(HORA_INICIAL, ...horasDados);
  const horaAte = Math.max(HORA_FINAL, ...horasDados);
  const horas = [];
  for (let h = horaDe; h <= horaAte; h++) horas.push(h);
  const temDia = new Set(registros.map(r => r.momento.diaSemana));
  const diasMapa = [1, 2, 3, 4, 5, 6, 7].filter(d => d <= 5 || temDia.has(d)); // fim de semana só se houver retirada
  const celulas = new Map();
  for (const r of registros) {
    const k = `${r.momento.diaSemana}-${r.momento.hora}`;
    celulas.set(k, (celulas.get(k) || 0) + 1);
  }
  const mapaCalor = {
    horas,
    dias: diasMapa.map(d => ({ dia: DIAS_CURTOS[d - 1], valores: horas.map(h => celulas.get(`${d}-${h}`) || 0) })),
    maximo: Math.max(0, ...celulas.values()),
  };
  const pico = [...celulas].sort((a, b) => b[1] - a[1])[0];
  const picoTexto = pico
    ? (() => { const [d, h] = pico[0].split('-').map(Number); return `${DIAS_CURTOS[d - 1]}, ${pad(h)}h (${pico[1]})`; })()
    : null;

  const retiradas = registros.length;
  const totalAlunos = porAluno.length;

  return {
    periodo: { inicio, fim, texto: descreverPeriodo(inicio, fim) },
    variosPontos: pontos.length > 1,
    resumo: {
      retiradas,
      alunos: totalAlunos,
      mediaPorAluno: totalAlunos ? retiradas / totalAlunos : 0,
      alunosRecorrentes: porAluno.filter(n => n > 1).length,
      devolvidas: duracoes.length,
      duracaoMediana: mediana(duracoes),
      minutosTotais,
      comProblema: registros.filter(r => r.situacao === 'problema').length,
      itensUsados: usoPorItem.size,
      itensNoAcervo: acervo.length,
      pico: picoTexto,
    },
    serie: montarSerie(registros.map(r => r.momento), inicio, fim, agora),
    porPonto,
    porCategoria,
    itensMaisRetirados,
    itensMaisTempo,
    mapaCalor,
    faixasDuracao,
    frequenciaAlunos,
    itensSemUso,
    registros,
  };
};

// Duração ou situação, como aparece na tabela e na planilha
export const descreverRetirada = (r) => {
  if (r.situacao === 'aberto' || r.situacao === 'nao_devolvido') return SITUACOES[r.situacao];
  return formatarDuracao(r.duracaoMin);
};

// ------------------------------------------------------------ arquivos
const paraArquivo = (texto) => String(texto || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Emprestimos_Predio-15_2026-01-01_a_2026-12-31[_Recepcao].pdf
export const nomeArquivoRelatorio = ({ predioNome, pontoNome, inicio, fim, extensao = 'pdf' }) => {
  const partes = ['Emprestimos', paraArquivo(predioNome), `${String(inicio).slice(0, 10)}_a_${String(fim).slice(0, 10)}`, paraArquivo(pontoNome)];
  return `${partes.filter(Boolean).join('_')}.${extensao}`;
};

// Planilha com uma linha por retirada (o registro completo, sem corte; sem aluno)
export const linhasCsvRelatorio = (relatorio) => [
  linhaCsv(['Retirada', 'Devolução', 'Duração (min)', 'Situação', 'Ponto', 'Categoria', 'Item', 'Patrimônio']),
  ...relatorio.registros.map(r => linhaCsv([
    formatarDataHora(r.retirada),
    r.devolucao ? formatarDataHora(r.devolucao) : '',
    r.duracaoMin ?? '',
    SITUACOES[r.situacao],
    r.ponto,
    r.categoria,
    r.item,
    r.patrimonio,
  ])),
];
