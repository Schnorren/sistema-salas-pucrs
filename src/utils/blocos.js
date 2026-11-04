// Blocos de aula da grade — fonte única da montagem usada pelas telas do
// redesign (Planta, Linha do tempo, Próximas aulas, Salas livres, Ocupação,
// busca global e autorização de chave).
//
// A regra de bloco é a MESMA de computarChavesDeBlocos() no timeHelpers:
// por dia, 1ª ocorrência vence no slot "sala|período"; períodos adjacentes no
// array PERIODS, com mesmo nome e mesma disciplina, formam um bloco; a chave é
// "<dia>-<sala>-<período inicial>" (a mesma de trocas_sala.aula_unique_key).
// Se mudar a regra aqui, mude lá junto (e vice-versa).
import { PERIODS, PERIOD_END_TIMES, extractPeriodCode, isInternalClass } from '../../backend_core/utils/timeHelpers';

export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DIA_CURTO = { Segunda: 'Seg', Terça: 'Ter', Quarta: 'Qua', Quinta: 'Qui', Sexta: 'Sex', Sábado: 'Sáb', Domingo: 'Dom' };
export const IDX_PERIODO = Object.fromEntries(PERIODS.map((p, i) => [p.code, i]));
export const TURNO_DO_PERIODO = (i) => (i <= 5 ? 'manha' : i <= 11 ? 'tarde' : 'noite');

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const minutos = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + m;
};

// "97316-04/1 - BRANDED CONTENT" -> { codCred: '97316-04/1', nomeAula: 'BRANDED CONTENT' }
export const parsearNomeAula = (nomeBruto) => {
  if (!nomeBruto) return { codCred: '', nomeAula: nomeBruto || '' };
  const match = nomeBruto.match(/^([A-Z0-9]{3,}[-/][A-Z0-9/]+)\s+-\s+(.+)$/i);
  if (match) return { codCred: match[1].trim(), nomeAula: match[2].trim() };
  return { codCred: '', nomeAula: nomeBruto };
};

// A grade chega em CAIXA ALTA do PDF; para leitura no balcão vira "Branded
// Content". Siglas e numerais romanos ficam em maiúsculas.
const SIGLAS = /^(tv|tcc|ux|ui|ti|ia|2d|3d|ead|rh|abnt|sql|api|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'a', 'o', 'na', 'no', 'nas', 'nos', 'com', 'ao', 'aos']);
export const tituloLegivel = (texto) => {
  const t = String(texto || '').replace(/^interno\s*[-–:]\s*/i, '').trim();
  if (!t || t !== t.toUpperCase()) return t; // já veio com caixa mista: respeita
  return t.toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    if (!w.trim() || w === '-' || w === '/') return w;
    if (SIGLAS.test(w)) return w.toUpperCase();
    if (i > 0 && MINUSCULAS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
};

export const numeroSala = (d) => d?.salas?.numero || d?.sala;

// Andar: usa o campo do banco; senão deriva do código (C.xx.xx.andar.sala) ou
// do 1º dígito do número curto — mesma regra da Planta antiga.
export const andarDaSala = (s) => {
  if (s?.andar !== undefined && s?.andar !== null && s?.andar !== '') return String(s.andar);
  const numero = String(s?.numero ?? '');
  const partes = numero.split('.');
  if (partes.length >= 4 && partes[0] === 'C') return String(parseInt(partes[3], 10));
  const m = numero.match(/\d/);
  return m ? m[0] : '0';
};
export const rotuloAndar = (a) => (a === '0' ? 'Térreo / outros' : `${a}º andar`);

export const ordenarSalas = (salas) =>
  [...(salas || [])].filter((s) => s?.numero).sort((a, b) => String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true }));

// Monta os blocos de um dia: { [sala]: bloco[] } em ordem de período.
export function blocosDoDia(gradeBruta, dia) {
  const porSala = {};
  if (!Array.isArray(gradeBruta) || !dia) return porSala;
  const diaLower = dia.toLowerCase();
  const porSlot = new Map();
  for (const d of gradeBruta) {
    if (!d?.dia_semana?.toLowerCase().includes(diaLower)) continue;
    const sala = numeroSala(d);
    const code = extractPeriodCode(d?.periodo);
    if (!sala || IDX_PERIODO[code] === undefined) continue;
    const k = `${sala}|${code}`;
    if (!porSlot.has(k)) porSlot.set(k, d);
  }
  const salas = new Set([...porSlot.keys()].map((k) => k.split('|')[0]));
  for (const sala of salas) {
    const lista = [];
    let atual = null;
    PERIODS.forEach((p, i) => {
      const aula = porSlot.get(`${sala}|${p.code}`);
      if (!aula) { atual = null; return; }
      const nome = aula.nome_aula || aula.disciplinas?.nome || '';
      const disciplinaId = aula.disciplina_id || aula.nome_aula || '';
      if (atual && atual.nome === nome && atual.disciplinaId === disciplinaId) {
        atual.periodos.push(p.code);
        atual.idxFim = i;
        atual.fim = PERIOD_END_TIMES[p.code];
        return;
      }
      const { codCred, nomeAula } = parsearNomeAula(nome);
      const interno = (aula.tipo || (isInternalClass(nome) ? 'Interno' : 'Regular')) === 'Interno';
      atual = {
        chave: `${dia}-${sala}-${p.code}`,
        dia, sala, nome, disciplinaId,
        codCred, nomeAula,
        titulo: tituloLegivel(nomeAula) || (interno ? 'Uso interno' : 'Aula'),
        interno,
        periodos: [p.code],
        idxIni: i, idxFim: i,
        inicio: p.lb,
        fim: PERIOD_END_TIMES[p.code],
      };
      lista.push(atual);
    });
    lista.forEach((b) => { b.periodosStr = b.periodos.join(''); b.faixa = b.periodos.length > 1 ? `${b.periodos[0]}–${b.periodos[b.periodos.length - 1]}` : b.periodos[0]; });
    porSala[sala] = lista;
  }
  return porSala;
}

export const blocoNoPeriodo = (blocosDaSala, code) => {
  const i = IDX_PERIODO[code];
  return (blocosDaSala || []).find((b) => i >= b.idxIni && i <= b.idxFim) || null;
};

// Um registro de troca vale para o bloco, mas pode cobrir só parte dos períodos
// (periodos_str "L,M" de um bloco LMNP). Registros antigos gravavam o bloco
// inteiro concatenado sem vírgula ("LMNP"); nesse formato nenhuma parte bate
// com um código e o fallback é o bloco inteiro.
export const periodosAfetadosPelaTroca = (registro, periodosDoBloco) => {
  if (!registro?.periodos_str) return periodosDoBloco;
  const validos = registro.periodos_str.split(',').map((s) => s.trim()).filter((p) => periodosDoBloco.includes(p));
  return validos.length ? validos : periodosDoBloco;
};

// Estado de uma sala num período: livre / ocupada / interno / trocada.
export function estadoDaSala(blocosDaSala, code, trocas) {
  const b = blocoNoPeriodo(blocosDaSala, code);
  if (!b) {
    const i = IDX_PERIODO[code];
    const prox = (blocosDaSala || []).find((x) => x.idxIni > i) || null;
    return { tipo: 'livre', prox };
  }
  const t = trocas?.[b.chave];
  if (t && periodosAfetadosPelaTroca(t, b.periodos).includes(code)) return { tipo: 'trocada', bloco: b, troca: t };
  return { tipo: b.interno ? 'interno' : 'ocupada', bloco: b };
}

// Faixas livres do dia (em índices de período) — para "Livre 14:00–17:15".
export function janelasLivres(blocosDaSala) {
  const ocupado = new Array(PERIODS.length).fill(false);
  (blocosDaSala || []).forEach((b) => { for (let i = b.idxIni; i <= b.idxFim; i++) ocupado[i] = true; });
  const janelas = [];
  let i = 0;
  while (i < PERIODS.length) {
    if (ocupado[i]) { i++; continue; }
    let j = i;
    while (j < PERIODS.length && !ocupado[j]) j++;
    janelas.push({ ini: i, fim: j - 1, inicio: PERIODS[i].lb, termino: PERIOD_END_TIMES[PERIODS[j - 1].code] });
    i = j;
  }
  return janelas;
}

// A sala citada numa autorização de chave é texto livre ("302", "Lab 4",
// "sala 205"): compara por token para não confundir 205 com 2050.
export const salaCoincide = (textoSala, numero) => {
  const alvo = normalizar(numero);
  if (!alvo) return false;
  return normalizar(textoSala).split(/[^a-z0-9.]+/).includes(alvo);
};
