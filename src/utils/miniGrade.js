// Linha do tempo no celular (mini-grade e agenda da sala) — regras puras,
// testadas em tests/miniGrade.test.js.
//
// Recebem os `slots` que a Timeline já monta para cada sala (16 períodos, com
// aulaUniqueKey, tipo, periodos e isAgora calculados lá), então a regra de
// blocos continua sendo uma só: a da Timeline / aulasDoDia.
//
// Imports com extensão .js: este arquivo também roda no `node --test`.
import { periodosAfetadosPelaTroca } from './aulasDoDia.js';

const trocaDoSlot = (slot, trocas) => {
  const registro = slot.ocupado ? trocas?.[slot.aulaUniqueKey] : null;
  if (!registro) return null;
  return periodosAfetadosPelaTroca(registro, slot.periodos || [slot.periodo]).includes(slot.periodo) ? registro : null;
};

// Segmentos da faixa de 16 períodos de uma sala. Cada aula vira um segmento
// (dividido onde a troca cobre só parte dela, como a célula vermelha da grade
// do computador) e cada período livre vira um segmento próprio.
// tipo: 'livre' | 'regular' | 'interno' | 'troca'
export function segmentosDaLinha(slots, trocas) {
  const segmentos = [];
  (slots || []).forEach((slot, i) => {
    const tipo = !slot.ocupado ? 'livre' : trocaDoSlot(slot, trocas) ? 'troca' : (slot.tipo === 'Interno' ? 'interno' : 'regular');
    const ultimo = segmentos[segmentos.length - 1];
    if (slot.ocupado && ultimo && ultimo.chave === slot.aulaUniqueKey && ultimo.tipo === tipo) {
      ultimo.fim = i;
      ultimo.agora = ultimo.agora || !!slot.isAgora;
      return;
    }
    segmentos.push({ ini: i, fim: i, tipo, chave: slot.ocupado ? slot.aulaUniqueKey : null, agora: !!slot.isAgora });
  });
  return segmentos;
}

// Itens da agenda de uma sala, na ordem do dia: cada aula é um item e cada
// sequência de períodos livres vira um item "livre".
export function itensDaAgenda(slots) {
  const itens = [];
  (slots || []).forEach((slot, i) => {
    const ultimo = itens[itens.length - 1];
    if (!slot.ocupado) {
      if (ultimo?.livre) ultimo.fim = i;
      else itens.push({ livre: true, ini: i, fim: i });
      return;
    }
    if (ultimo && !ultimo.livre && ultimo.chave === slot.aulaUniqueKey) {
      ultimo.fim = i;
      return;
    }
    itens.push({
      livre: false,
      chave: slot.aulaUniqueKey,
      ini: i,
      fim: i,
      nome: slot.aulaParseada?.nomeAula || slot.nome || '',
      codCred: slot.aulaParseada?.codCred || '',
      tipo: slot.tipo,
      periodos: slot.periodos || [slot.periodo],
    });
  });
  return itens;
}

// O que dizer embaixo da faixa de uma sala.
//   idxAgora: índice do período atual, ou -1 (outro dia / fora do horário)
//   inicios:  horário de início de cada um dos 16 períodos
// Resultado: { tipo: 'agora', bloco, troca } | { tipo: 'livre', bloco, inicio }
//          | { tipo: 'livreResto' } | { tipo: 'dia', bloco, inicio, total } | { tipo: 'vazia' }
export function resumoDaLinha(slots, trocas, idxAgora, inicios) {
  const blocos = itensDaAgenda(slots).filter((item) => !item.livre);
  if (!blocos.length) return { tipo: 'vazia' };
  if (idxAgora >= 0) {
    const atual = blocos.find((b) => idxAgora >= b.ini && idxAgora <= b.fim);
    if (atual) return { tipo: 'agora', bloco: atual, troca: trocaDoSlot(slots[idxAgora], trocas) };
    const proxima = blocos.find((b) => b.ini > idxAgora);
    return proxima ? { tipo: 'livre', bloco: proxima, inicio: inicios[proxima.ini] } : { tipo: 'livreResto' };
  }
  return { tipo: 'dia', bloco: blocos[0], inicio: inicios[blocos[0].ini], total: blocos.length };
}
