export const STATUS_ITEM = {
    DISPONIVEL: 'DISPONIVEL',
    MANUTENCAO: 'MANUTENCAO',
    EMPRESTADO: 'EMPRESTADO',
    PERDIDO: 'PERDIDO'           // "não devolveu": fora da lista até ser encontrado
};

export const STATUS_EMPRESTIMO = {
    ATIVO: 'ATIVO',
    CONCLUIDO: 'CONCLUIDO',
    CANCELADO: 'CANCELADO',      // retirada desfeita (fora das estatísticas)
    EXTRAVIADO: 'EXTRAVIADO',    // não devolvido
    TRANSFERIDO: 'TRANSFERIDO'   // troca de titular: o item passou para outro aluno
};
