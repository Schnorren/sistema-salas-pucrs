// Textos e agrupamentos da escolha de salas visíveis (tela "Salas do Prédio" e
// pergunta pós-importação). A regra de visibilidade em si vive no backend
// (backend_core/utils/salas.js); aqui só chega `situacao` + resumo da agenda.

// Mesmo critério de andar da Planta (LiveMap): coluna andar ou 1º dígito do número
export const andarDaSala = (sala) => {
  if (sala.andar) return String(sala.andar);
  const m = String(sala.numero).match(/\d/);
  return m ? m[0] : '0';
};

export const rotuloAndar = (andar) => (andar === '0' ? 'Térreo / Outros' : `${andar}º andar`);

export function agruparPorAndar(salas) {
  const grupos = new Map();
  salas.forEach(s => {
    const a = andarDaSala(s);
    if (!grupos.has(a)) grupos.set(a, []);
    grupos.get(a).push(s);
  });
  return [...grupos.entries()]
    .sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true }))
    .map(([andar, lista]) => ({ andar, rotulo: rotuloAndar(andar), salas: lista }));
}

export const semAulaRegular = (sala) => !sala.regulares;

export function descreverAgenda(sala) {
  if (!sala.periodos) return 'Nenhum agendamento na agenda atual';
  const total = `${sala.periodos} ${sala.periodos === 1 ? 'período agendado' : 'períodos agendados'} na semana`;
  if (!sala.regulares) return `${total} · só eventos internos`;
  if (sala.internos) return `${total} · ${sala.internos} de eventos internos`;
  return `${total} · todos de aula regular`;
}

// Escolha inicial da caixa de marcar: visível/oculta seguem o que está salvo;
// pendente (sala nova sem decisão) vem com a sugestão — marcada se tem aula regular.
export const marcadaPorPadrao = (sala) =>
  sala.situacao === 'visivel' || (sala.situacao === 'pendente' && !semAulaRegular(sala));

// O que mandar para PUT /api/grade/salas a partir da escolha na tela.
// Pendentes vão sempre (é a decisão que faltava); as demais só se mudaram.
export function montarAlteracoes(salas, escolha) {
  const exibir = [];
  const ocultar = [];
  salas.forEach(s => {
    const marcada = escolha[s.numero] ?? marcadaPorPadrao(s);
    const mudou = s.situacao === 'pendente' || marcada !== (s.situacao === 'visivel');
    if (!mudou) return;
    (marcada ? exibir : ocultar).push(s.numero);
  });
  return { exibir, ocultar };
}
