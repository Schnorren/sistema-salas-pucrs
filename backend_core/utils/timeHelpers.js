
export const PERIODS = [
  { code: 'A', lb: '08:00', start: [8, 0], end: [8, 45] },
  { code: 'B', lb: '08:45', start: [8, 45], end: [9, 30] },
  { code: 'C', lb: '09:45', start: [9, 45], end: [10, 30] },
  { code: 'D', lb: '10:30', start: [10, 30], end: [11, 15] },
  { code: 'E', lb: '11:30', start: [11, 30], end: [12, 15] },
  { code: 'E1', lb: '12:15', start: [12, 15], end: [13, 0] },
  { code: 'F', lb: '14:00', start: [14, 0], end: [14, 45] },
  { code: 'G', lb: '14:45', start: [14, 45], end: [15, 30] },
  { code: 'H', lb: '15:45', start: [15, 45], end: [16, 30] },
  { code: 'I', lb: '16:30', start: [16, 30], end: [17, 15] },
  { code: 'J', lb: '17:30', start: [17, 30], end: [18, 15] },
  { code: 'K', lb: '18:15', start: [18, 15], end: [19, 0] },
  { code: 'L', lb: '19:15', start: [19, 15], end: [20, 0] },
  { code: 'M', lb: '20:00', start: [20, 0], end: [20, 45] },
  { code: 'N', lb: '21:00', start: [21, 0], end: [21, 45] },
  { code: 'P', lb: '21:45', start: [21, 45], end: [22, 30] },
];

// Data/hora atual no fuso da PUCRS (America/Sao_Paulo) — fonte única de "agora".
// Todo cálculo de dia/período/semana deve partir daqui, nunca do fuso do browser.
export const getDataSaoPaulo = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

// Retorna o nome do dia atual em português
export const getDiaAtual = () => {
  const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return DAYS[getDataSaoPaulo().getDay()] || 'Segunda';
};

// Segunda-feira (ISO) da semana atual como "YYYY-MM-DD", no fuso da PUCRS —
// mesma regra do default da coluna `semana` de trocas_sala e de
// limpar_trocas_antigas() no banco.
export const getSemanaAtual = () => {
  const d = getDataSaoPaulo();
  const dow = d.getDay();                 // 0=Dom .. 6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow;  // dias até a segunda-feira
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Array de horários de início dos períodos PUCRS (para comparação de relógio)
export const PERIOD_TIMES = PERIODS.map(p => p.lb);

// Array de { code, lb } — útil para selects e cabeçalhos
export const PERIOD_OPTIONS = PERIODS.map(p => ({ code: p.code, lb: p.lb }));

// Mapa de código → horário de fim — derivado do array PERIODS (fonte única)
export const PERIOD_END_TIMES = PERIODS.reduce((acc, p) => {
  const [h, m] = p.end;
  acc[p.code] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return acc;
}, {});

const pad = (n) => String(n).padStart(2, '0');

export const extractPeriodCode = (s) => (s || '').split(' ')[0];

export const isInternalClass = (n) => /^interno/i.test((n || '').trim());

export const getCurrentPeriod = () => {
  const now = getDataSaoPaulo();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    const startMinutes = p.start[0] * 60 + p.start[1];
    let endMinutes = p.end[0] * 60 + p.end[1];

    if (i < PERIODS.length - 1) {
      const nextStartMinutes = PERIODS[i + 1].start[0] * 60 + PERIODS[i + 1].start[1];
      const gap = nextStartMinutes - endMinutes;
      if (gap > 0 && gap <= 30) {
        endMinutes = nextStartMinutes;
      }
    }

    if (totalMinutes >= startMinutes && totalMinutes < endMinutes) return p.code;
  }
  return null;
};

// Conjunto de chaves "<dia>-<sala>-<período inicial>" de todos os blocos de
// aula da grade — espelha a regra de bloco do dataProcessed da Timeline
// (períodos adjacentes no array PERIODS, mesmo nome e mesma disciplina;
// 1ª ocorrência vence no slot). Serve para validar trocas de sala: após um
// re-import, trocas cuja chave não existe mais na grade ficam invisíveis na
// Timeline e não devem ser contadas como ativas. Se mudar a regra de bloco
// lá, mude aqui junto.
export const computarChavesDeBlocos = (gradeBruta) => {
  const chaves = new Set();
  if (!Array.isArray(gradeBruta)) return chaves;

  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  for (const dia of DIAS) {
    const diaLower = dia.toLowerCase();
    const porSlot = new Map();
    const salas = new Set();
    for (const d of gradeBruta) {
      if (!d?.dia_semana?.toLowerCase().includes(diaLower)) continue;
      const sala = d?.salas?.numero || d?.sala;
      const code = extractPeriodCode(d?.periodo);
      const chave = `${sala}|${code}`;
      if (sala && code && !porSlot.has(chave)) {
        porSlot.set(chave, d);
        salas.add(sala);
      }
    }
    for (const sala of salas) {
      let anterior = null;
      for (const p of PERIODS) {
        const aula = porSlot.get(`${sala}|${p.code}`);
        if (!aula) { anterior = null; continue; }
        const nome = aula.nome_aula || aula.disciplinas?.nome || '';
        const disciplinaId = aula.disciplina_id || aula.nome_aula || '';
        if (!anterior || anterior.nome !== nome || anterior.disciplinaId !== disciplinaId) {
          chaves.add(`${dia}-${sala}-${p.code}`);
        }
        anterior = { nome, disciplinaId };
      }
    }
  }
  return chaves;
};

export const groupConsecutiveClasses = (classes) => {
  if (!classes || !classes.length) return [];

  const sorted = [...classes].sort((a, b) => {
    const aSala = a.salas?.numero || '?';
    const bSala = b.salas?.numero || '?';
    if (aSala !== bSala) return aSala.localeCompare(bSala, undefined, { numeric: true });

    const aCode = extractPeriodCode(a.periodo);
    const bCode = extractPeriodCode(b.periodo);
    return PERIODS.findIndex(p => p.code === aCode) - PERIODS.findIndex(p => p.code === bCode);
  });

  const grouped = [];

  sorted.forEach(item => {
    const pCode = extractPeriodCode(item.periodo);
    const pIdx = PERIODS.findIndex(p => p.code === pCode);

    if (pIdx === -1) return;

    const sala = item.salas?.numero || '?';
    const nomeAula = item.nome_aula || (item.disciplinas ? item.disciplinas.nome : '');

    const lastGroup = grouped.length > 0 ? grouped[grouped.length - 1] : null;

    if (
      lastGroup &&
      lastGroup.sala === sala &&
      lastGroup.nome === nomeAula &&
      lastGroup.pIdxs[lastGroup.pIdxs.length - 1] === pIdx - 1
    ) {
      lastGroup.periodos.push(pCode);
      lastGroup.pIdxs.push(pIdx);
      lastGroup.fim = PERIODS[pIdx].end;
    } else {
      grouped.push({
        id: item.id,
        sala,
        nome: nomeAula,
        tipo: item.tipo || (isInternalClass(nomeAula) ? 'Interno' : 'Regular'),
        periodos: [pCode],
        pIdxs: [pIdx],
        inicio: PERIODS[pIdx].lb,
        fim: PERIODS[pIdx].end
      });
    }
  });

  return grouped.map(g => ({
    id: g.id,
    sala: g.sala,
    nome: g.nome,
    tipo: g.tipo,
    periodos: [...g.periodos],
    periodosFormatados: g.periodos.join(''),
    quantidadePeriodos: g.periodos.length,
    horarioInicio: g.inicio || '--:--',
    horarioFim: g.fim ? `${pad(g.fim[0])}:${pad(g.fim[1])}` : '--:--'
  }));
};