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
import { PERIODS, PERIOD_END_TIMES, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers.js';

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

// Troca que afeta o bloco no período `code` (ou null).
export const trocaNoPeriodo = (trocas, bloco, code) => {
  const registro = bloco ? trocas?.[bloco.chave] : null;
  if (!registro) return null;
  return periodosAfetadosPelaTroca(registro, bloco.periodos).includes(code) ? registro : null;
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
  return blocos.find((b) => b.chave === chave) || null;
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
