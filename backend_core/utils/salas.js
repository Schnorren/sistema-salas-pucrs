// Visibilidade de salas por prédio (coluna salas.status).
//
// O PDF do Espaço Físico traz TUDO o que tem agendamento no prédio — inclusive
// espaços que não são sala de aula (auditório, evento, manutenção). Quem tem
// 'edicao_grade' escolhe quais salas aparecem no sistema:
//   Ativa    → aparece em todas as telas (padrão das salas que já existiam)
//   Oculta   → some de todas as telas, mesmo com agendamentos na agenda
//   Pendente → sala nova vinda de uma importação, ainda sem decisão: fica
//              oculta até alguém responder "exibir" ou "manter oculta"
// O filtro é aplicado na publicação do JSON estático (grade.service), então
// nenhuma tela do front precisa saber que salas ocultas existem.

export const STATUS_SALA = Object.freeze({ ATIVA: 'Ativa', OCULTA: 'Oculta', PENDENTE: 'Pendente' });

export const salaVisivel = (sala) =>
    !!sala && sala.status !== STATUS_SALA.OCULTA && sala.status !== STATUS_SALA.PENDENTE;

// Situação exposta pela API (o front não conhece os valores do banco)
export const situacaoDaSala = (sala) => (
    sala?.status === STATUS_SALA.OCULTA ? 'oculta'
        : sala?.status === STATUS_SALA.PENDENTE ? 'pendente'
            : 'visivel'
);

export const ordenarNumeros = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// Números de sala presentes na agenda que o prédio ainda não conhecia
export function separarSalasNovas(numerosNaAgenda, salasExistentes) {
    const conhecidas = new Set((salasExistentes || []).map(s => s.numero));
    return [...new Set(numerosNaAgenda || [])]
        .filter(n => n && !conhecidas.has(n))
        .sort(ordenarNumeros);
}

// Resumo da agenda da semana por sala, para ajudar a decidir sem abrir o PDF.
// `registros`: [{ sala, nome, tipo }] — um por período agendado.
export function resumirAgendaPorSala(registros) {
    const porSala = new Map();
    (registros || []).forEach(({ sala, nome, tipo }) => {
        if (!sala) return;
        if (!porSala.has(sala)) porSala.set(sala, { periodos: 0, regulares: 0, internos: 0, nomes: new Map() });
        const r = porSala.get(sala);
        r.periodos += 1;
        if (tipo === 'Interno') r.internos += 1; else r.regulares += 1;
        if (nome) r.nomes.set(nome, (r.nomes.get(nome) || 0) + 1);
    });

    const resumo = new Map();
    porSala.forEach((r, sala) => {
        // Exemplos: as atividades que mais ocupam a sala na semana
        const exemplos = [...r.nomes.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([nome]) => nome);
        resumo.set(sala, { periodos: r.periodos, regulares: r.regulares, internos: r.internos, exemplos });
    });
    return resumo;
}

export const RESUMO_VAZIO = Object.freeze({ periodos: 0, regulares: 0, internos: 0, exemplos: [] });

// Monta o conteúdo publicado no Storage: só salas visíveis e só os
// agendamentos delas. O `status` sai do JSON (o front não precisa dele).
export function filtrarPublicacao(salasDb, gradeBruta) {
    const salas = (salasDb || [])
        .filter(salaVisivel)
        .map(({ numero, andar }) => ({ numero, andar }));

    const grade = (gradeBruta || [])
        .filter(g => salaVisivel(g.salas))
        .map(g => ({ ...g, salas: { numero: g.salas.numero, andar: g.salas.andar } }));

    return { salas, grade };
}
