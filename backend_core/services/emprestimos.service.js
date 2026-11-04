import repository from '../repositories/emprestimos.repository.js';
import { ErroPublico } from '../utils/http.js';

// Status que a secretaria pode definir manualmente. EMPRESTADO é exclusivo do
// fluxo de retirada/devolução (RPCs) — nunca setado direto pela API de status.
const STATUS_EDITAVEIS = ['DISPONIVEL', 'MANUTENCAO'];

// Normaliza entrada de texto vinda do cliente (trim + limite de tamanho).
const limparTexto = (valor, max) => String(valor ?? '').trim().slice(0, max);

class EmprestimosService {
    // Garante que o item pertence ao prédio do usuário antes de qualquer operação por ID.
    async _assertItemNoPredio(itemId, predioId) {
        if (!predioId) throw new ErroPublico("Prédio não informado.");
        const item = await repository.getItem(itemId);
        if (!item || item.categoria?.predio_id !== predioId) {
            throw new ErroPublico("Item não pertence a este prédio.");
        }
        return item;
    }

    async _assertCategoriaNoPredio(categoriaId, predioId) {
        if (!predioId) throw new ErroPublico("Prédio não informado.");
        const cat = await repository.getCategoria(categoriaId);
        if (!cat || cat.predio_id !== predioId) {
            throw new ErroPublico("Categoria não pertence a este prédio.");
        }
        return cat;
    }

    async listarCategorias(predioId) {
        if (!predioId) throw new ErroPublico("Prédio não informado.");
        return await repository.getCategoriasPorPredio(predioId);
    }

    async listarItensDisponiveis(categoriaId, predioId) {
        if (!categoriaId) throw new ErroPublico("Categoria não informada.");
        await this._assertCategoriaNoPredio(categoriaId, predioId);
        return await repository.getItensDisponiveis(categoriaId);
    }

    async listarEmprestimosAtivos(predioId) {
        if (!predioId) throw new ErroPublico("Prédio não informado.");

        const ativos = await repository.getEmprestimosAtivos(predioId);

        return ativos.map(e => ({
            id: e.id,
            itemId: e.item_id,
            nomeItem: e.item.nome_item,
            patrimonio: e.item.patrimonio,
            matricula: e.matricula_aluno,
            nomeAluno: e.nome_aluno,
            documento: e.documento_retido,
            dataRetirada: e.data_retirada,
            responsavel: e.resp_retirada
        }));
    }

    async listarHistorico(predioId) {
        if (!predioId) throw new ErroPublico("Prédio não informado.");

        const registros = await repository.getHistorico(predioId);

        return registros.map(e => ({
            id: e.id,
            nomeItem: e.item.nome_item,
            patrimonio: e.item.patrimonio,
            matricula: e.matricula_aluno,
            nomeAluno: e.nome_aluno,
            dataRetirada: e.data_retirada,
            dataDevolucao: e.data_devolucao,
            responsavel: e.resp_devolucao
        }));
    }

    async consultarMatricula(matricula, predioId) {
        const mat = limparTexto(matricula, 40);
        if (!mat) throw new ErroPublico("Matrícula não informada.");
        if (!predioId) throw new ErroPublico("Prédio não informado.");

        const [aluno, emprestimoAtivo] = await Promise.all([
            repository.buscarAlunoCache(mat),
            repository.getEmprestimoAtivoPorMatricula(mat, predioId)
        ]);

        return {
            matricula: mat,
            nomeCadastrado: aluno ? aluno.nome : null,
            emprestimoAtivo: emprestimoAtivo ? {
                id: emprestimoAtivo.id,
                itemId: emprestimoAtivo.item_id,
                nomeItem: emprestimoAtivo.item.nome_item,
                dataRetirada: emprestimoAtivo.data_retirada
            } : null
        };
    }

    async registrarRetirada({ itemId, matricula, nomeAluno, documento, respRetirada, predioId }) {
        const mat = limparTexto(matricula, 40);
        const nome = limparTexto(nomeAluno, 120);
        const doc = limparTexto(documento, 120);

        if (!itemId || !mat || !nome) {
            throw new ErroPublico("Dados obrigatórios faltando.");
        }

        await this._assertItemNoPredio(itemId, predioId);

        // A RPC valida atomicamente: item DISPONIVEL (com trava) e máximo de
        // 1 empréstimo ativo por matrícula no prédio.
        const resultado = await repository.criarRetiradaRpc({
            item_id: itemId,
            matricula_aluno: mat,
            nome_aluno: nome,
            documento_retido: doc || null,
            resp_retirada: respRetirada
        });

        // Atualiza o cache de alunos em background — não bloqueia a resposta
        repository.upsertAlunoCache(mat, nome).catch(() => {});

        return resultado;
    }

    async registrarDevolucao({ emprestimoId, respDevolucao, predioId }) {
        if (!emprestimoId) throw new ErroPublico("ID do empréstimo não informado.");

        const emprestimo = await repository.getEmprestimo(emprestimoId);

        if (!emprestimo) throw new ErroPublico("Registro de empréstimo não encontrado.");
        if (emprestimo.status !== 'ATIVO') throw new ErroPublico("Este empréstimo já foi concluído.");

        await this._assertItemNoPredio(emprestimo.item_id, predioId);

        return await repository.concluirDevolucao(emprestimoId, respDevolucao);
    }

    async alterarStatusItem(itemId, novoStatus, observacoes, predioId) {
        if (!itemId || !novoStatus) {
            throw new ErroPublico("ID do item e novo status são obrigatórios.");
        }
        if (!STATUS_EDITAVEIS.includes(novoStatus)) {
            throw new ErroPublico("Status inválido. Use DISPONIVEL ou MANUTENCAO.");
        }

        await this._assertItemNoPredio(itemId, predioId);

        // Item com empréstimo em aberto não muda de status por aqui — a devolução
        // (RPC concluir_devolucao) é quem o libera. Checa o registro ativo, e não o
        // status do item, para permitir corrigir itens órfãos (EMPRESTADO sem registro).
        const emprestimoAberto = await repository.getEmprestimoAtivoPorItem(itemId);
        if (emprestimoAberto) {
            throw new ErroPublico("Item está emprestado. Registre a devolução antes de alterar o status.");
        }

        await repository.atualizarStatusItem(itemId, novoStatus, limparTexto(observacoes, 500) || null);
        return true;
    }
}

export default new EmprestimosService();
