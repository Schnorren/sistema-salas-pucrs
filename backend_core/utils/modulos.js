// Fonte única dos módulos/permissões do sistema.
// IMPORTANTE: estes valores DEVEM ser iguais aos `id` (slug) da tabela
// `sistema_modulos` e às strings verificadas no withAuth/handlers.
// Ao adicionar um novo módulo no banco, adicione-o aqui também.

export const MODULOS = {
    ADMIN: 'admin',
    GRADE: 'grade',
    AVISOS: 'avisos',
    EMPRESTIMOS: 'emprestimos',
    RELATORIOS: 'relatorios',
    EDICAO_GRADE: 'edicao_grade',
    EQUIPE: 'equipe',
    EDICAO_CONTATOS: 'edicao_contatos',
    // Cadastro do acervo de empréstimos (pontos, categorias, itens), limite e bloqueios
    GESTAO_EMPRESTIMOS: 'gestao_emprestimos',
    // Relatório (anônimo) de pontos escolhidos de VÁRIOS prédios — ex.: a
    // coordenação da recepção. Os pontos ficam em emprestimo_relatorio_rede_pontos.
    RELATORIO_EMPRESTIMOS_REDE: 'relatorio_emprestimos_rede',
};

export const MODULOS_VALIDOS = Object.values(MODULOS);

// Módulos que valem fora do prédio do usuário: só um admin concede ou retira
// (Painel Admin). Um gestor de equipe de um prédio não libera dados de outros.
export const MODULOS_SO_ADMIN = [MODULOS.ADMIN, MODULOS.RELATORIO_EMPRESTIMOS_REDE];

// Normaliza uma lista de permissões vinda do cliente:
//   - descarta valores desconhecidos (evita gravar uuid/garbage) e repetidos;
//   - quem edita sem ser admin não concede nem retira os módulos do admin:
//     'admin' sai sempre e os outros ficam como estavam em `atuais` (a tela
//     do gestor nem mostra esses módulos, então a lista dele não os traz).
export function sanitizarPermissoes(lista, { permitirAdmin, atuais = [] }) {
    const arr = Array.isArray(lista) ? lista : [];
    const validas = arr.filter((p) => MODULOS_VALIDOS.includes(p));
    if (permitirAdmin) return [...new Set(validas)];
    const mantidas = (Array.isArray(atuais) ? atuais : [])
        .filter((p) => MODULOS_SO_ADMIN.includes(p) && p !== MODULOS.ADMIN);
    return [...new Set([...validas.filter((p) => !MODULOS_SO_ADMIN.includes(p)), ...mantidas])];
}
