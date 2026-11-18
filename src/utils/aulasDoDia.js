// Aulas do dia por sala e trocas de sala — regras compartilhadas pela Planta,
// Próximas aulas, busca do topo, formulário de autorização de chave e
// Linha do tempo.
//
// A regra de bloco é a MESMA da Timeline e de computarChavesDeBlocos() no
// timeHelpers: por dia, 1ª ocorrência vence no slot "sala|período"; períodos
// adjacentes no array PERIODS com mesmo nome e mesma disciplina formam um
// bloco; a chave do bloco é "<dia>-<sala>-<período inicial>" (= a
// aula_unique_key de trocas_sala). tests/aulasDoDia.test.js garante que as
// chaves daqui batem com as do timeHelpers — ao mudar uma regra, mude a outra.
//
// Imports com extensão .js: este arquivo também roda no `node --test`.
import { PERIODS, PERIOD_END_TIMES, extractPeriodCode, isInternalClass, separarCodigosPeriodo } from '../../backend_core/utils/timeHelpers.js';

export const IDX_PERIODO = Object.fromEntries(PERIODS.map((p, i) => [p.code, i]));

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// "97316-04/1 - BRANDED CONTENT" -> { codCred: '97316-04/1', nomeAula: 'BRANDED CONTENT' }
export const parsearNomeAula = (nomeBruto) => {
  if (!nomeBruto) return { codCred: '', nomeAula: nomeBruto || '' };
  const match = nomeBruto.match(/^([A-Z0-9]{3,}[-/][A-Z0-9/]+)\s+-\s+(.+)$/i);
  if (match) return { codCred: match[1].trim(), nomeAula: match[2].trim() };
  return { codCred: '', nomeAula: nomeBruto };
};

const numeroSala = (d) => d?.salas?.numero || d?.sala;

// Slots do dia: Map sala -> array (um item por período) com a aula ou null.
export function slotsDoDia(gradeBruta, dia) {
  const porSala = new Map();
  if (!Array.isArray(gradeBruta) || !dia) return porSala;
  const diaLower = dia.toLowerCase();
  for (const d of gradeBruta) {
    if (!d?.dia_semana?.toLowerCase().includes(diaLower)) continue;
    const sala = numeroSala(d);
    const i = IDX_PERIODO[extractPeriodCode(d?.periodo)];
    if (!sala || i === undefined) continue;
    if (!porSala.has(sala)) porSala.set(sala, new Array(PERIODS.length).fill(null));
    const slots = porSala.get(sala);
    if (!slots[i]) slots[i] = d; // 1ª ocorrência vence
  }
  return porSala;
}

// Blocos de aula de uma sala no dia, em ordem de período.
export function blocosDaSala(slots, dia, sala) {
  const blocos = [];
  if (!slots) return blocos;
  let atual = null;
  slots.forEach((aula, i) => {
    if (!aula) { atual = null; return; }
    const nome = aula.nome_aula || aula.disciplinas?.nome || '';
    const disciplinaId = aula.disciplina_id || aula.nome_aula || '';
    if (atual && atual.nome === nome && atual.disciplinaId === disciplinaId) {
      atual.periodos.push(PERIODS[i].code);
      atual.idxFim = i;
      atual.fim = PERIOD_END_TIMES[PERIODS[i].code];
      return;
    }
    const { codCred, nomeAula } = parsearNomeAula(nome);
    atual = {
      chave: `${dia}-${sala}-${PERIODS[i].code}`,
      sala, dia, nome, disciplinaId, codCred, nomeAula,
      tipo: aula.tipo || (isInternalClass(nome) ? 'Interno' : 'Regular'),
      periodos: [PERIODS[i].code],
      idxIni: i, idxFim: i,
      inicio: PERIODS[i].lb,
      fim: PERIOD_END_TIMES[PERIODS[i].code],
    };
    blocos.push(atual);
  });
  return blocos;
}

export const blocoNoPeriodo = (blocos, code) => {
  const i = IDX_PERIODO[code];
  return (blocos || []).find((b) => i >= b.idxIni && i <= b.idxFim) || null;
};

// Situação de uma sala num dia: os blocos de aula, o bloco no `periodo`, a
// troca que vale nele e a próxima aula. Usada pela busca do topo e pelo painel
// da sala da Planta no celular. Sem período (fora do horário de aula), a
// próxima é a primeira que começa depois de `minutoAgora` (minutos desde
// 00:00); sem `minutoAgora` (outro dia), é a primeira do dia.
export function situacaoDaSala(gradeBruta, trocas, dia, sala, periodo, minutoAgora = null) {
  const blocos = blocosDaSala(slotsDoDia(gradeBruta, dia).get(sala), dia, sala);
  const atual = periodo ? blocoNoPeriodo(blocos, periodo) : null;
  const emMinutos = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
  let proxima;
  if (periodo) proxima = blocos.find((b) => b.idxIni > IDX_PERIODO[periodo]);
  else if (minutoAgora == null) proxima = blocos[0];
  else proxima = blocos.find((b) => emMinutos(b.inicio) > minutoAgora);
  return { blocos, atual, troca: atual ? trocaNoPeriodo(trocas, atual, periodo) : null, proxima: proxima || null };
}

// Um registro de troca vale para o bloco, mas pode cobrir só parte dos
// períodos (periodos_str "L,M" de um bloco LMNP). Registros antigos gravavam o
// bloco inteiro concatenado sem vírgula ("LMNP"); nesse formato nenhuma parte
// bate com um código e o fallback é o bloco inteiro.
export const periodosAfetadosPelaTroca = (registro, periodosDoBloco) => {
  if (!registro?.periodos_str) return periodosDoBloco;
  const validos = registro.periodos_str.split(',').map((s) => s.trim()).filter((p) => periodosDoBloco.includes(p));
  return validos.length ? validos : periodosDoBloco;
};

// Trocas que valem agora, como mapa aula_unique_key -> registro. Uma troca é
// de UMA data: o dia (prefixo da chave "<dia>-<sala>-<período>") na `semana`
// do registro. Para cada dia, vale só o registro da próxima ocorrência dele
// (hoje incluso) — `proximosDias` é o getProximosSeteDias() do timeHelpers.
// Assim, troca de dia que já passou some na hora, e troca registrada com
// antecedência para a semana seguinte aparece no dia certo.
export const trocasVigentes = (registros, proximosDias) => {
  const semanaDoDia = Object.fromEntries((proximosDias || []).map((d) => [d.dia, d.semana]));
  const vigentes = {};
  for (const registro of registros || []) {
    const chave = String(registro?.aula_unique_key || '');
    const semana = semanaDoDia[chave.split('-')[0]];
    if (semana && String(registro.semana).slice(0, 10) === semana) vigentes[chave] = registro;
  }
  return vigentes;
};

// Uma aula (bloco LMNP) pode ter VÁRIAS trocas, uma por grupo de períodos
// (LM para uma sala, NP para outra). Cada registro usa como chave a do bloco
// ("<dia>-<sala>-<período inicial>") ou a de qualquer outro período do mesmo
// bloco ("<dia>-<sala>-N"): o bloco é dono de todas essas chaves.
export const chavesDoBloco = (chave, periodos) => {
  const c = desmontarChave(chave);
  if (!c) return [chave];
  return (periodos || []).map((p) => `${c.dia}-${c.sala}-${p}`);
};

// Registros de troca do bloco: [{ chave, registro, afetados }], na ordem dos períodos.
export const registrosDoBloco = (trocas, chave, periodos) =>
  chavesDoBloco(chave, periodos)
    .filter((k) => trocas?.[k])
    .map((k) => ({ chave: k, registro: trocas[k], afetados: periodosAfetadosPelaTroca(trocas[k], periodos) }));

// Troca do bloco que afeta o período `code` (ou null).
export const registroNoPeriodo = (trocas, chave, periodos, code) =>
  registrosDoBloco(trocas, chave, periodos).find((r) => r.afetados.includes(code))?.registro || null;

// Troca que afeta o bloco no período `code` (ou null).
export const trocaNoPeriodo = (trocas, bloco, code) =>
  bloco ? registroNoPeriodo(trocas, bloco.chave, bloco.periodos, code) : null;

// A chave de uma troca existe na grade? `chavesGrade` = computarChavesDeBlocos()
// (só inícios de bloco): chave de período no meio do bloco vale se o bloco
// começa antes, na mesma sala e dia.
export const chaveNaGrade = (chavesGrade, chave) => {
  if (chavesGrade.has(chave)) return true;
  const c = desmontarChave(chave);
  const idx = c ? IDX_PERIODO[c.periodo] : undefined;
  if (idx === undefined) return false;
  for (let i = idx - 1; i >= 0; i--) {
    if (chavesGrade.has(`${c.dia}-${c.sala}-${PERIODS[i].code}`)) return true;
  }
  return false;
};

// A sala de uma autorização de chave é texto livre ("302", "Lab 4", "sala
// 205"): compara por palavra para não confundir 205 com 2050.
export const salaCoincide = (textoSala, numero) => {
  const alvo = normalizar(numero);
  if (!alvo) return false;
  return normalizar(textoSala).split(/[^a-z0-9.]+/).includes(alvo);
};

// Dia da semana ("Quarta") de uma data "AAAA-MM-DD", sem passar por fuso.
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const diaDaData = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// Ordena códigos de período pela ordem da PUCRS (E1 depois de E).
export const ordenarPeriodos = (codigos) => [...codigos].sort((a, b) => (IDX_PERIODO[a] ?? 99) - (IDX_PERIODO[b] ?? 99));

// ------------------------------------------------------------ trocas de sala
// Chave da troca "<dia>-<sala>-<período inicial>" desmontada. A sala pode ter
// hífen ("LAB-2"); o dia e o período não têm.
export const desmontarChave = (chave) => {
  const partes = String(chave || '').split('-');
  if (partes.length < 3) return null;
  return { dia: partes[0], sala: partes.slice(1, -1).join('-'), periodo: partes[partes.length - 1] };
};

// Bloco de aula da grade que a chave de uma troca aponta (null se a grade mudou
// depois da troca — re-import moveu/removeu a aula).
export const blocoDaChave = (gradeBruta, chave) => {
  const c = desmontarChave(chave);
  if (!c) return null;
  const blocos = blocosDaSala(slotsDoDia(gradeBruta, c.dia).get(c.sala), c.dia, c.sala);
  return blocos.find((b) => b.chave === chave) || blocos.find((b) => chavesDoBloco(b.chave, b.periodos).includes(chave)) || null;
};

// "19:15 às 20:45" de uma lista de períodos (do primeiro ao fim do último).
export const horarioDosPeriodos = (codigos) => {
  const ordenados = ordenarPeriodos(codigos || []).filter((p) => p in IDX_PERIODO);
  if (!ordenados.length) return '';
  return `${PERIODS[IDX_PERIODO[ordenados[0]]].lb} às ${PERIOD_END_TIMES[ordenados[ordenados.length - 1]]}`;
};

const DIA_EXTENSO = { Segunda: 'segunda-feira', 'Terça': 'terça-feira', Quarta: 'quarta-feira', Quinta: 'quinta-feira', Sexta: 'sexta-feira', 'Sábado': 'sábado', Domingo: 'domingo' };
// Datas "AAAA-MM-DD" formatadas sem passar por fuso: "09/11" e "segunda-feira, 09/11/2026".
export const dataCurta = (iso) => { const [, m, d] = String(iso || '').split('-'); return d && m ? `${d}/${m}` : ''; };
export const dataPorExtenso = (dia, iso) => {
  const [a, m, d] = String(iso || '').split('-');
  return `${DIA_EXTENSO[dia] || dia}${d && m && a ? `, ${d}/${m}/${a}` : ''}`;
};

// Lista "Trocas de sala": uma linha por troca vigente (ver trocasVigentes), em
// ordem de data, período e sala. `bloco` é null quando a aula não está mais na
// grade (a troca ainda pode ser reimpressa ou desfeita).
export const listarTrocas = (trocas, gradeBruta, proximosDias) => {
  const ocorrencia = Object.fromEntries((proximosDias || []).map((d) => [d.dia, d]));
  return Object.entries(trocas || {})
    .map(([chave, registro]) => {
      const c = desmontarChave(chave);
      const dia = c && ocorrencia[c.dia];
      if (!dia) return null;
      const bloco = blocoDaChave(gradeBruta, chave);
      const afetados = bloco
        ? periodosAfetadosPelaTroca(registro, bloco.periodos)
        : ordenarPeriodos(String(registro?.periodos_str || '').split(',').map((s) => s.trim()).filter((p) => p in IDX_PERIODO));
      return { chave, registro, bloco, dia: c.dia, sala: c.sala, data: dia.data, semana: dia.semana, emDias: dia.emDias, afetados };
    })
    .filter(Boolean)
    .sort((a, b) =>
      a.emDias - b.emDias ||
      (IDX_PERIODO[a.afetados[0]] ?? 99) - (IDX_PERIODO[b.afetados[0]] ?? 99) ||
      a.sala.localeCompare(b.sala, undefined, { numeric: true }));
};

// ------------------------------------------------- autorização de chave x aula
const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Distância de edição (Levenshtein) entre duas palavras curtas.
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Cada palavra do termo precisa aparecer no texto (sem acento, sem maiúscula,
// em qualquer ordem); palavra de 4+ letras tolera 1 erro de digitação (8+ letras, 2) — compara
// com o começo de cada palavra do texto, então "prevenssao" acha "prevenção" e
// "prev" também acha.
function textoCasa(textoNorm, tokens) {
  const palavras = textoNorm.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every((t) =>
    textoNorm.includes(t) ||
    (t.length >= 4 && palavras.some((p) => {
      const tolera = t.length >= 8 ? 2 : 1;
      return distancia(t, p.slice(0, t.length)) <= tolera || distancia(t, p) <= tolera;
    })));
}

// Todas as aulas (blocos) da grade cujo nome, código de crédito ou sala casam
// com o termo (ver textoCasa). Uma linha por ocorrência: sala + dia + períodos.
// `dias` = nomes de dia usados na chave ("Segunda"…); a grade grava "Segunda-feira".
export function buscarAulasPorNome(gradeBruta, termo, dias = DIAS_ORDEM) {
  const tokens = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!tokens.length || !Array.isArray(gradeBruta)) return [];
  const achadas = [];
  for (const dia of dias) {
    for (const [sala, slots] of slotsDoDia(gradeBruta, dia)) {
      for (const b of blocosDaSala(slots, dia, sala)) {
        if (textoCasa(normalizar(`${b.nomeAula} ${b.codCred} ${b.sala}`), tokens)) achadas.push(b);
      }
    }
  }
  return achadas.sort((a, b) =>
    a.nomeAula.localeCompare(b.nomeAula, 'pt-BR') ||
    DIAS_ORDEM.indexOf(a.dia) - DIAS_ORDEM.indexOf(b.dia) ||
    a.idxIni - b.idxIni ||
    a.sala.localeCompare(b.sala, undefined, { numeric: true }));
}

// A autorização de chave `aviso` vale para o bloco `bloco` na data `dataISO`?
// Com `aula_chave`: mesma aula e data dentro da vigência (não recorrente = só
// data_prevista; recorrente = toda semana, data_fim vazio = sem fim). Sem
// `aula_chave` (avisos antigos, sala/disciplina em texto livre): mesma sala,
// data_prevista igual e períodos que se cruzam.
export function avisoVale(aviso, bloco, dataISO) {
  if (!aviso || !bloco || !ISO.test(String(dataISO || ''))) return false;
  const inicio = String(aviso.data_prevista || '');
  if (aviso.aula_chave) {
    if (aviso.aula_chave !== bloco.chave || !ISO.test(inicio)) return false;
    if (!aviso.recorrente) return dataISO === inicio;
    return dataISO >= inicio && (!aviso.data_fim || dataISO <= aviso.data_fim);
  }
  if (inicio !== dataISO || !salaCoincide(aviso.sala_id, bloco.sala)) return false;
  const codigos = separarCodigosPeriodo(aviso.periodo);
  return !!codigos && codigos.some((c) => bloco.periodos.includes(c));
}

// Autorizações ATIVAS (lista `chaves` do mural) que valem para o bloco na data.
export const chavesDaAula = (avisos, bloco, dataISO) =>
  (avisos || []).filter((a) => avisoVale(a, bloco, dataISO));

// "Toda terça · até 12/12" / "Toda terça · por tempo indeterminado" / "18/11"
export function vigenciaDoAviso(aviso) {
  const c = desmontarChave(aviso?.aula_chave);
  if (!aviso?.aula_chave || !aviso.recorrente || !c) return aviso?.data_prevista ? dataBR(aviso.data_prevista) : '';
  const dia = `Toda ${c.dia.toLowerCase()}`;
  const desde = aviso.data_prevista ? ` · desde ${dataCurta(aviso.data_prevista)}` : '';
  return `${dia}${desde} · ${aviso.data_fim ? `até ${dataBR(aviso.data_fim)}` : 'por tempo indeterminado'}`;
}
const dataBR = (iso) => String(iso).split('-').reverse().join('/');
