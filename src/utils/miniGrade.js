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

// Blocos da mini-grade com nome: cada segmento da faixa (segmentosDaLinha)
// com o que é preciso para desenhar a aula dentro dele — os períodos (letras),
// qual deles é o atual, o nome da disciplina e a troca de sala que vale nele.
// `continua` = mesmo bloco de aula do segmento anterior (troca que cobre só
// parte da aula divide o bloco em dois).
export function blocosDaFaixa(slots, trocas) {
  let chaveAnterior = null;
  return segmentosDaLinha(slots, trocas).map((seg) => {
    const continua = !!seg.chave && seg.chave === chaveAnterior;
    chaveAnterior = seg.chave;
    if (seg.tipo === 'livre') return { ...seg, livre: true, periodo: slots[seg.ini].periodo };
    const doBloco = slots.slice(seg.ini, seg.fim + 1);
    const primeiro = doBloco[0];
    return {
      ...seg,
      livre: false,
      continua,
      periodos: doBloco.map((s) => s.periodo),
      idxAgora: doBloco.findIndex((s) => s.isAgora),
      nome: primeiro.aulaParseada?.nomeAula || primeiro.nome || '',
      troca: seg.tipo === 'troca' ? trocas?.[seg.chave] || null : null,
    };
  });
}
