// Busca do diretório de contatos — client-side, sobre o payload já em cache.
// O diretório inteiro tem ~30 contatos e ~200 cursos, então filtrar em memória
// é instantâneo e dispensa endpoint de busca.
//
// Usado em dois lugares: a tela do módulo (MuralContatos) e a barra de busca
// global do Dashboard. Ao mudar a regra aqui, os dois acompanham.

// Ignora acentos e caixa: digitar "Radiofarmacia" precisa achar "Radiofarmácia".
export function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Achata a árvore (escolas -> unidades, locais -> serviços) numa lista só,
// cada item sabendo quem é seu pai — o que a busca precisa para dizer
// "Odontologia → Escola de Ciências da Saúde e da Vida".
export function achatarDiretorio(diretorio) {
    const raizes = [...(diretorio?.escolas || []), ...(diretorio?.locais || [])];
    const lista = [];

    for (const raiz of raizes) {
        lista.push({ contato: raiz, pai: null });
        for (const filho of raiz.filhos || []) {
            lista.push({ contato: filho, pai: raiz });
        }
    }

    return lista;
}

// Retorna resultados achatados e prontos para render:
//   { chave, tipo, contatoId, titulo, subtitulo, telefone }
// `tipo` é 'contato' ou 'curso'; em ambos, contatoId aponta para o card que
// deve ganhar foco ao clicar no resultado.
export function buscarNoDiretorio(diretorio, termo, limite = 20) {
    const alvo = normalizarTexto(termo);
    if (alvo.length < 2) return [];

    const resultados = [];
    const combina = (valor) => normalizarTexto(valor).includes(alvo);

    for (const { contato, pai } of achatarDiretorio(diretorio)) {
        const primeiroTelefone = (contato.telefones || [])[0] || (pai?.telefones || [])[0] || null;

        // O contato em si: nome, e-mails e telefones.
        if (combina(contato.nome) ||
            (contato.emails || []).some(combina) ||
            (contato.telefones || []).some(combina)) {
            resultados.push({
                chave: `contato-${contato.id}`,
                tipo: 'contato',
                // Foco vai para o card de nível 1 — é ele que é renderizado.
                contatoId: pai ? pai.id : contato.id,
                titulo: contato.nome,
                subtitulo: pai ? pai.nome : null,
                telefone: primeiroTelefone,
            });
        }

        // Os cursos daquele contato: o caso de uso central do módulo.
        for (const curso of contato.cursos || []) {
            if (!combina(curso.nome)) continue;
            resultados.push({
                chave: `curso-${curso.id}`,
                tipo: 'curso',
                contatoId: pai ? pai.id : contato.id,
                titulo: curso.nome,
                subtitulo: contato.nome,
                telefone: primeiroTelefone,
            });
        }
    }

    // Ranking: casamento no começo do título primeiro, depois no começo de
    // alguma palavra dele, e por fim o resto (meio de palavra, e-mail, telefone).
    // Empate vai para o título mais curto — o mais específico: quem digita
    // "Carreiras" quer "PUCRS Carreiras", não "Gestão de Pessoas: Carreiras...".
    const posicao = (titulo) => {
        const t = normalizarTexto(titulo);
        if (t.startsWith(alvo)) return 0;
        if (t.split(/[^a-z0-9]+/).some(palavra => palavra.startsWith(alvo))) return 1;
        return 2;
    };

    resultados.sort((a, b) => {
        const pa = posicao(a.titulo);
        const pb = posicao(b.titulo);
        if (pa !== pb) return pa - pb;
        if (a.titulo.length !== b.titulo.length) return a.titulo.length - b.titulo.length;
        return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });

    return resultados.slice(0, limite);
}
