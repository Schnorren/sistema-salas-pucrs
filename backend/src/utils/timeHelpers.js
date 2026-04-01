const PERIODS = [
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

const pad = (n) => String(n).padStart(2, '0');
const extractPeriodCode = (s) => (s || '').split(' ')[0];
const isInternalClass = (n) => /^interno/i.test((n || '').trim());

const getCurrentPeriod = () => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
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

const groupConsecutiveClasses = (classes) => {
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
    periodosFormatados: g.periodos.join(''),
    quantidadePeriodos: g.periodos.length,
    horarioInicio: g.inicio || '--:--',
    horarioFim: g.fim ? `${pad(g.fim[0])}:${pad(g.fim[1])}` : '--:--'
  }));
};

module.exports = {
  PERIODS,
  extractPeriodCode,
  isInternalClass,
  getCurrentPeriod,
  groupConsecutiveClasses
};