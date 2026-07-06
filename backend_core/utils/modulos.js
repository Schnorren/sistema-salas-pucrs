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
};

export const MODULOS_VALIDOS = Object.values(MODULOS);

// Normaliza uma lista de permissões vinda do cliente:
//   - descarta valores desconhecidos (evita gravar uuid/garbage);
//   - remove 'admin' quando quem edita não é admin (anti-escalonamento).
export function sanitizarPermissoes(lista, { permitirAdmin }) {
    const arr = Array.isArray(lista) ? lista : [];
    return arr.filter(
        (p) => MODULOS_VALIDOS.includes(p) && (permitirAdmin || p !== MODULOS.ADMIN)
    );
}
