// Comparação entre a grade que estava no banco e a que acabou de ser
// importada — o resumo aparece na tela de sucesso da importação e vai para a
// auditoria. Serve para notar na hora um PDF da semana errada ou de outro
// prédio (quase tudo muda) ou uma reimportação sem efeito (nada muda).
// Puro, sem dependências: testado em tests/gradeComparacao.test.js.
//
// Cada grade: [{ sala, dia, periodo, nome }] — um item por período agendado.
// Um mesmo slot (sala + dia + período) pode ter mais de uma atividade.

const MAX_SALAS_LISTADAS = 12;

const chaveDoSlot = (a) => `${a.sala}|${a.dia}|${a.periodo}`;

function porSlot(grade) {
  const mapa = new Map();
  for (const aula of grade || []) {
    if (!aula?.sala || !aula?.dia || !aula?.periodo) continue;
    const chave = chaveDoSlot(aula);
    if (!mapa.has(chave)) mapa.set(chave, { sala: String(aula.sala), nomes: new Set() });
    mapa.get(chave).nomes.add(String(aula.nome ?? '').trim());
  }
  return mapa;
}

const mesmosNomes = (a, b) => a.size === b.size && [...a].every(n => b.has(n));

export function compararGrades(antes, depois) {
  const velha = porSlot(antes);
  const nova = porSlot(depois);
  let novos = 0;
  let removidos = 0;
  let alterados = 0;
  const salas = new Set();

  for (const [chave, slot] of nova) {
    const anterior = velha.get(chave);
    if (!anterior) { novos++; salas.add(slot.sala); }
    else if (!mesmosNomes(anterior.nomes, slot.nomes)) { alterados++; salas.add(slot.sala); }
  }
  for (const [chave, slot] of velha) {
    if (!nova.has(chave)) { removidos++; salas.add(slot.sala); }
  }

  const salasAfetadas = [...salas].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    antes: velha.size,
    depois: nova.size,
    novos,
    removidos,
    alterados,
    iguais: novos === 0 && removidos === 0 && alterados === 0,
    totalSalasAfetadas: salasAfetadas.length,
    salasAfetadas: salasAfetadas.slice(0, MAX_SALAS_LISTADAS),
  };
}
