import contatosRepository from '../repositories/contatos.repository.js';
import { ErroPublico } from '../utils/http.js';
import { registrarAuditoria } from '../utils/auditoria.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tipos e o pai que cada um exige. A árvore é sempre de 2 níveis:
// escola -> unidade, local -> servico.
const TIPOS = {
    escola:  { paiObrigatorio: false, tipoPai: null },
    local:   { paiObrigatorio: false, tipoPai: null },
    unidade: { paiObrigatorio: true,  tipoPai: 'escola' },
    servico: { paiObrigatorio: true,  tipoPai: 'local' },
};

function textoObrigatorio(valor, campo, max) {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!texto) throw new ErroPublico(`Preencha o campo "${campo}".`);
    if (texto.length > max) throw new ErroPublico(`O campo "${campo}" deve ter no máximo ${max} caracteres.`);
    return texto;
}

function textoOpcional(valor, campo, max) {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (!texto) return null;
    if (texto.length > max) throw new ErroPublico(`O campo "${campo}" deve ter no máximo ${max} caracteres.`);
    return texto;
}

// Descarta entradas vazias e limita o tamanho — o front manda linhas em branco
// quando o usuário adiciona um campo e não preenche.
function listaDeTextos(valor, campo, max, limite = 20) {
    if (valor == null) return [];
    if (!Array.isArray(valor)) throw new ErroPublico(`O campo "${campo}" deve ser uma lista.`);
    if (valor.length > limite) throw new ErroPublico(`O campo "${campo}" aceita no máximo ${limite} itens.`);
    return valor
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .map(v => {
            if (v.length > max) throw new ErroPublico(`Cada item de "${campo}" deve ter no máximo ${max} caracteres.`);
            return v;
        });
}

function assertUuid(id, mensagem = 'Contato não encontrado.') {
    if (!UUID_REGEX.test(id || '')) throw new ErroPublico(mensagem, 404);
}

function gerarSlugBase(nome) {
    const base = nome
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return base || 'contato';
}

class ContatosService {
    // Monta a árvore aninhada que o front consome numa chamada só.
    // O diretório inteiro tem ~30 contatos e ~200 cursos — pequeno o bastante
    // para ir completo no payload e a busca acontecer no cliente.
    async obterDiretorio() {
        const [contatos, cursos] = await Promise.all([
            contatosRepository.listarContatos(),
            contatosRepository.listarCursos(),
        ]);

        const cursosPorContato = new Map();
        for (const curso of cursos) {
            if (!cursosPorContato.has(curso.contato_id)) cursosPorContato.set(curso.contato_id, []);
            cursosPorContato.get(curso.contato_id).push({ id: curso.id, nome: curso.nome });
        }

        const filhosPorPai = new Map();
        for (const c of contatos) {
            if (!c.pai_id) continue;
            if (!filhosPorPai.has(c.pai_id)) filhosPorPai.set(c.pai_id, []);
            filhosPorPai.get(c.pai_id).push(c);
        }

        const montar = (contato) => ({
            ...contato,
            cursos: cursosPorContato.get(contato.id) || [],
            filhos: (filhosPorPai.get(contato.id) || []).map(montar),
        });

        const raizes = contatos.filter(c => !c.pai_id).map(montar);

        return {
            escolas: raizes.filter(c => c.tipo === 'escola'),
            locais: raizes.filter(c => c.tipo === 'local'),
        };
    }

    // Valida o pai e devolve o pai_id normalizado (null para nível 1).
    async _resolverPai(tipo, paiId) {
        const regra = TIPOS[tipo];

        if (!regra.paiObrigatorio) {
            if (paiId) throw new ErroPublico(`Um contato do tipo "${tipo}" não pode ter um contato pai.`);
            return null;
        }

        assertUuid(paiId, 'Selecione a qual contato este item pertence.');
        const pai = await contatosRepository.buscarPorId(paiId);
        if (!pai) throw new ErroPublico('O contato pai selecionado não existe.', 404);
        if (pai.tipo !== regra.tipoPai) {
            throw new ErroPublico(`Um contato do tipo "${tipo}" só pode pertencer a um contato do tipo "${regra.tipoPai}".`);
        }
        return pai.id;
    }

    // Monta o payload só com campos permitidos — nunca repasse req.body cru ao banco.
    async _montarCampos(body) {
        const dados = body || {};

        const tipo = String(dados.tipo || '').trim();
        if (!TIPOS[tipo]) throw new ErroPublico('Tipo de contato inválido.');

        const emails = listaDeTextos(dados.emails, 'E-mails', 160);
        const invalido = emails.find(e => !EMAIL_REGEX.test(e));
        if (invalido) throw new ErroPublico(`E-mail inválido: ${invalido}`);

        return {
            tipo,
            pai_id: await this._resolverPai(tipo, dados.pai_id),
            nome: textoObrigatorio(dados.nome, 'Nome', 200),
            descricao: textoOpcional(dados.descricao, 'Descrição', 2000),
            referencia: textoOpcional(dados.referencia, 'Referência', 40),
            endereco: textoOpcional(dados.endereco, 'Endereço', 300),
            telefones: listaDeTextos(dados.telefones, 'Telefones', 40),
            emails,
            whatsapp: textoOpcional(dados.whatsapp, 'WhatsApp', 40),
            horarios: textoOpcional(dados.horarios, 'Horários', 500),
            ordem: Number.isFinite(Number(dados.ordem)) ? Math.trunc(Number(dados.ordem)) : 0,
            ativo: dados.ativo !== false,
        };
    }

    // O slug só existe para dar idempotência ao seed; para contatos criados pela
    // tela, deriva do nome e ganha um sufixo se já estiver em uso.
    async _slugDisponivel(nome) {
        const base = gerarSlugBase(nome);
        if (!await contatosRepository.buscarPorSlug(base)) return base;
        for (let i = 2; i <= 50; i++) {
            const tentativa = `${base}-${i}`;
            if (!await contatosRepository.buscarPorSlug(tentativa)) return tentativa;
        }
        return `${base}-${Date.now().toString(36)}`;
    }

    async criarContato(body, user) {
        const campos = await this._montarCampos(body);
        const criado = await contatosRepository.inserir({
            ...campos,
            slug: await this._slugDisponivel(campos.nome),
            atualizado_em: new Date().toISOString(),
            atualizado_por: user.id,
        });

        registrarAuditoria({
            user,
            acao: 'contatos.criar',
            entidade: 'contatos',
            entidadeId: criado.id,
            detalhes: { nome: criado.nome, tipo: criado.tipo },
        });

        return criado;
    }

    async atualizarContato(id, body, user) {
        assertUuid(id);
        const campos = await this._montarCampos(body);

        if (campos.pai_id === id) throw new ErroPublico('Um contato não pode ser pai de si mesmo.');

        const atualizado = await contatosRepository.atualizar(id, {
            ...campos,
            atualizado_em: new Date().toISOString(),
            atualizado_por: user.id,
        });
        if (!atualizado) throw new ErroPublico('Contato não encontrado.', 404);

        registrarAuditoria({
            user,
            acao: 'contatos.atualizar',
            entidade: 'contatos',
            entidadeId: id,
            detalhes: { nome: atualizado.nome, tipo: atualizado.tipo },
        });

        return atualizado;
    }

    async excluirContato(id, user) {
        assertUuid(id);
        const removido = await contatosRepository.deletar(id);
        if (!removido) throw new ErroPublico('Contato não encontrado.', 404);

        // Exclusão leva junto unidades/serviços filhos e os cursos (ON DELETE
        // CASCADE) — o log de auditoria é o único rastro que sobra.
        registrarAuditoria({
            user,
            acao: 'contatos.excluir',
            entidade: 'contatos',
            entidadeId: id,
            detalhes: { nome: removido.nome, tipo: removido.tipo, slug: removido.slug },
        });
    }

    async adicionarCurso(contatoId, nomeCurso, user) {
        assertUuid(contatoId);
        const nome = textoObrigatorio(nomeCurso, 'Nome do curso', 200);

        const contato = await contatosRepository.buscarPorId(contatoId);
        if (!contato) throw new ErroPublico('Contato não encontrado.', 404);

        let curso;
        try {
            curso = await contatosRepository.inserirCurso(contatoId, nome);
        } catch (err) {
            // 23505 = unique (contato_id, nome): o curso já está nessa Escola.
            if (err?.code === '23505') throw new ErroPublico('Esse curso já está cadastrado neste contato.');
            throw err;
        }

        registrarAuditoria({
            user,
            acao: 'contatos.curso_adicionar',
            entidade: 'contato_cursos',
            entidadeId: curso.id,
            detalhes: { curso: nome, contato: contato.nome },
        });

        return curso;
    }

    async removerCurso(cursoId, user) {
        assertUuid(cursoId, 'Curso não encontrado.');
        const removido = await contatosRepository.deletarCurso(cursoId);
        if (!removido) throw new ErroPublico('Curso não encontrado.', 404);

        registrarAuditoria({
            user,
            acao: 'contatos.curso_remover',
            entidade: 'contato_cursos',
            entidadeId: cursoId,
            detalhes: { curso: removido.nome, contato_id: removido.contato_id },
        });
    }
}

export default new ContatosService();
