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

// Um registro de troca vale para o bloco, mas pode cobrir só parte dos
// períodos (periodos_str "L,M" de um bloco LMNP). Registros antigos gravavam o
// bloco inteiro concatenado sem vírgula ("LMNP"); nesse formato nenhuma parte
// bate com um código e o fallback é o bloco inteiro.
export const periodosAfetadosPelaTroca = (registro, periodosDoBloco) => {
  if (!registro?.periodos_str) return periodosDoBloco;
  const validos = registro.periodos_str.split(',').map((s) => s.trim()).filter((p) => periodosDoBloco.includes(p));
  return validos.length ? validos : periodosDoBloco;
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
