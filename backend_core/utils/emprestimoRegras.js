// Regras puras do módulo de empréstimos, compartilhadas front + back.
// Como o timeHelpers, o front importa por caminho relativo
// (../../backend_core/utils/emprestimoRegras). Sem dependências e sem I/O:
// testado com node --test (tests/emprestimoRegras.test.js).
//
// Datas exibidas e "hoje" são sempre no fuso de Brasília, nunca no do navegador.

const FUSO = 'America/Sao_Paulo';

const formatadorSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// { ano, mes, dia, hora, minuto } (strings com zero à esquerda) no fuso de Brasília
const partesSP = (data) => {
  const p = Object.fromEntries(formatadorSP.formatToParts(data).map(x => [x.type, x.value]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute };
};

const paraData = (valor) => {
  if (valor == null || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isFinite(d.getTime()) ? d : null;
};

// Minutos inteiros entre duas datas (nunca negativo); null se alguma for inválida
export const minutosEntre = (inicio, fim = new Date()) => {
  const a = paraData(inicio);
  const b = paraData(fim);
  if (!a || !b) return null;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
};

// 45 → "45 min" · 65 → "1h 5m" · 120 → "2h"
export const formatarDuracao = (minutos) => {
  if (minutos == null || !Number.isFinite(minutos)) return '--';
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

// Hora de um registro para listas: "14:05" se foi hoje (Brasília),
// "03/11 14:05" em outro dia do ano, "03/11/2025 14:05" em outro ano.
export const rotuloDataHora = (iso, agora = new Date()) => {
  const d = paraData(iso);
  if (!d) return '--';
  const p = partesSP(d);
  const h = partesSP(agora);
  const hora = `${p.hora}:${p.minuto}`;
  if (p.ano === h.ano && p.mes === h.mes && p.dia === h.dia) return hora;
  if (p.ano === h.ano) return `${p.dia}/${p.mes} ${hora}`;
  return `${p.dia}/${p.mes}/${p.ano} ${hora}`;
};

// Valor para <input type="datetime-local"> no horário de Brasília
export const inputDataHoraSP = (data = new Date()) => {
  const p = partesSP(data);
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}`;
};

// Início do dia (00:00) de Brasília, no mesmo formato
export const inputInicioDoDiaSP = (data = new Date()) => `${inputDataHoraSP(data).slice(0, 10)}T00:00`;

const semAcento = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Bipagem/busca do item: código EXATO primeiro (em toda a lista); por nome só
// quando um único item casa. Antes, o primeiro item cujo nome *contivesse* o
// termo ganhava do item com aquele código — e parte de um nome + Enter
// emprestava o 1º que casasse.
// Retorna { item } quando resolvido, ou { item: null, ambiguos: [...] }.
export const resolverItemPorTermo = (itens, termo) => {
  const t = semAcento(termo);
  if (!t) return { item: null, ambiguos: [] };
  const lista = Array.isArray(itens) ? itens : [];
  const porCodigo = lista.find(i => semAcento(i?.patrimonio) === t);
  if (porCodigo) return { item: porCodigo, ambiguos: [] };
  const porNome = lista.filter(i => semAcento(i?.nome_item).includes(t));
  if (porNome.length === 1) return { item: porNome[0], ambiguos: [] };
  return { item: null, ambiguos: porNome };
};
