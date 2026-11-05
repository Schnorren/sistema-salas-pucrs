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
export const partesSP = (data) => {
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

// "Hoje" (YYYY-MM-DD) em Brasília — validade de bloqueio, comparação de datas
export const hojeSP = (data = new Date()) => inputDataHoraSP(data).slice(0, 10);

// ---------------------------------------------------------------------------
// Devolução, ocorrências e desfazer
// ---------------------------------------------------------------------------

export const RESULTADOS_DEVOLUCAO = Object.freeze({
  OK: 'OK',
  COM_PROBLEMA: 'COM_PROBLEMA',      // voltou, mas o item vai para manutenção
  NAO_DEVOLVIDO: 'NAO_DEVOLVIDO',    // não voltou: item fica PERDIDO
});

export const ROTULO_OCORRENCIA = Object.freeze({
  DEVOLVIDO_COM_PROBLEMA: 'Devolveu com problema',
  NAO_DEVOLVIDO: 'Não devolveu',
});

// Prazo para desfazer uma retirada ou devolução registrada por engano.
// ESPELHO de `interval '10 minutes'` em emprestimo_cancelar/emprestimo_reabrir
// (supabase/migrations/emprestimos_v2_rpcs.sql) — ao mudar um, mude o outro.
export const JANELA_DESFAZER_MIN = 10;

// Milissegundos que ainda restam para desfazer (0 = expirou)
export const restanteParaDesfazerMs = (iso, agora = new Date(), janelaMin = JANELA_DESFAZER_MIN) => {
  const d = paraData(iso);
  const a = paraData(agora);
  if (!d || !a) return 0;
  return Math.max(0, d.getTime() + janelaMin * 60000 - a.getTime());
};

export const podeDesfazer = (iso, agora = new Date(), janelaMin = JANELA_DESFAZER_MIN) =>
  restanteParaDesfazerMs(iso, agora, janelaMin) > 0;

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

const PARTICULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'di', 'du', 'del', 'della', 'van', 'von']);
const ROMANO = /^(i{1,3}|iv|vi{0,3}|ix|x)$/;

// "  joão   DA silva ii " → "João da Silva II" · "maria-clara d'ávila" → "Maria-Clara D'Ávila"
export const normalizarNome = (nome) => {
  const limpo = String(nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!limpo) return '';
  return limpo.toLocaleLowerCase('pt-BR').split(' ').map((palavra, i) => {
    if (i > 0 && PARTICULAS.has(palavra)) return palavra;
    if (i > 0 && ROMANO.test(palavra)) return palavra.toLocaleUpperCase('pt-BR');
    return palavra.replace(/(^|[-'’])(\p{L})/gu, (_m, sep, letra) => sep + letra.toLocaleUpperCase('pt-BR'));
  }).join(' ');
};

// Matrícula/código do crachá: sem espaços (o leitor às vezes manda um no fim)
export const normalizarMatricula = (valor) => String(valor ?? '').replace(/\s+/g, '').slice(0, 50);

// ---------------------------------------------------------------------------
// Disponibilidade com previsão ("costuma voltar em ~15 min")
// ---------------------------------------------------------------------------

export const mediana = (valores) => {
  const v = (valores || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Limites da previsão de volta. O repository passa porItem/minMin/maxMin à RPC
// emprestimo_duracoes_recentes, que já recorta no banco — por isso ficam aqui,
// num lugar só, e não repetidos no SQL.
//   porItem: últimas N devoluções do item · minimo: amostras para confiar na
//   mediana · [minMin, maxMin]: fora disso é desfeito na hora / esquecido no sistema
export const PREVISAO_VOLTA = Object.freeze({ porItem: 30, minimo: 5, minMin: 2, maxMin: 720 });

// Durações (min) de um registro, do mais novo ao mais antigo: as que a RPC
// emprestimo_duracoes_recentes já calculou ({ item_id, minutos: [...] }) ou a
// de um registro bruto ({ item_id, data_retirada, data_devolucao }).
const duracoesDoRegistro = (r) => {
  if (Array.isArray(r?.minutos)) return r.minutos.map(Number);
  const ini = paraData(r?.data_retirada);
  const fim = paraData(r?.data_devolucao);
  return ini && fim ? [(fim.getTime() - ini.getTime()) / 60000] : [];
};

// Duração típica de cada item, pelas devoluções mais recentes.
//   registros: do mais novo ao mais antigo — [{ item_id, minutos: [...] }] (RPC,
//              o que o painel usa) ou [{ item_id, data_retirada, data_devolucao }]
//   itens:     [{ id, categoria_id }]
// Ignora durações fora de [2 min, 12 h] (desfeito na hora / esquecido no
// sistema). Usa as últimas `porItem` do item; com menos de `minimo` amostras,
// cai para a mediana da categoria (itens iguais: "Bola 1", "Bola 2").
// Retorna Map itemId → { mediana (min), amostras, fonte: 'item' | 'categoria' }.
export const calcularMedianas = (registros, itens, opcoes = {}) => {
  const { porItem, minimo, minMin, maxMin } = { ...PREVISAO_VOLTA, ...opcoes };
  const duracoesPorItem = new Map();
  for (const r of registros || []) {
    const lista = duracoesPorItem.get(r?.item_id) || [];
    for (const minutos of duracoesDoRegistro(r)) {
      if (lista.length >= porItem) break;
      if (minutos >= minMin && minutos <= maxMin) lista.push(minutos);
    }
    if (lista.length) duracoesPorItem.set(r.item_id, lista);
  }

  const catDoItem = new Map((itens || []).map(i => [i.id, i.categoria_id]));
  const duracoesPorCategoria = new Map();
  for (const [itemId, lista] of duracoesPorItem) {
    const cat = catDoItem.get(itemId);
    if (cat == null) continue;
    duracoesPorCategoria.set(cat, (duracoesPorCategoria.get(cat) || []).concat(lista));
  }

  const resultado = new Map();
  for (const item of itens || []) {
    const doItem = duracoesPorItem.get(item.id) || [];
    if (doItem.length >= minimo) {
      resultado.set(item.id, { mediana: Math.round(mediana(doItem)), amostras: doItem.length, fonte: 'item' });
      continue;
    }
    const daCategoria = duracoesPorCategoria.get(item.categoria_id) || [];
    if (daCategoria.length >= minimo) {
      resultado.set(item.id, { mediana: Math.round(mediana(daCategoria)), amostras: daCategoria.length, fonte: 'categoria' });
    }
  }
  return resultado;
};

// "~15 min" fica mais honesto que "~13 min": arredonda para 5 a partir de 10
const aproximar = (min) => (min < 10 ? Math.max(1, Math.round(min)) : Math.round(min / 5) * 5);

// Previsão de volta de um item emprestado.
//   { desde: data da retirada, medianaMin } → { estado, decorrido, restante, texto }
//   estado: 'no_tempo' | 'passou' | 'sem_historico'
export const preverDevolucao = ({ desde, medianaMin } = {}, agora = new Date()) => {
  const decorrido = minutosEntre(desde, agora);
  if (decorrido == null) return null;
  if (!Number.isFinite(medianaMin) || medianaMin <= 0) {
    return { estado: 'sem_historico', decorrido, restante: null, texto: null };
  }
  const restante = medianaMin - decorrido;
  if (restante > 0) {
    return { estado: 'no_tempo', decorrido, restante, texto: `costuma voltar em ~${formatarDuracao(aproximar(restante))}` };
  }
  return { estado: 'passou', decorrido, restante: 0, texto: `passou do tempo habitual (~${formatarDuracao(aproximar(medianaMin))})` };
};

// Categoria sem nenhum item livre: quando deve voltar o próximo?
//   itens: [{ status, mediana_min, emprestimo: { dataRetirada } | null }]
// → { restante, texto } ou null (há item livre, ou nenhum emprestado tem histórico)
export const previsaoDaCategoria = (itens, agora = new Date()) => {
  const lista = itens || [];
  if (!lista.length || lista.some(i => i.status === 'DISPONIVEL')) return null;
  let menor = null;
  for (const i of lista) {
    if (i.status !== 'EMPRESTADO' || !i.emprestimo) continue;
    const p = preverDevolucao({ desde: i.emprestimo.dataRetirada, medianaMin: i.mediana_min }, agora);
    if (p?.estado === 'no_tempo' && (menor == null || p.restante < menor)) menor = p.restante;
  }
  if (menor == null) return null;
  return { restante: menor, texto: `próxima volta prevista em ~${formatarDuracao(aproximar(menor))}` };
};
