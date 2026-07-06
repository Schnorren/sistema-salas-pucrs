import repository from '../repositories/emprestimos.repository.js';
import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';

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
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`
                id, matricula_aluno, nome_aluno, data_retirada, data_devolucao, resp_retirada, resp_devolucao,
                item:emprestimo_itens!inner (
                    nome_item, patrimonio,
                    categoria:emprestimo_categorias!inner (predio_id)
                )
            `)
            .eq('item.categoria.predio_id', predioId)
            .order('data_retirada', { ascending: false })
            .limit(50);

        if (error) throw error;

        return data.map(e => ({
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
        if (!matricula) throw new ErroPublico("Matrícula não informada.");

        const [aluno, ativos] = await Promise.all([
            repository.buscarAlunoCache(matricula),
            repository.getEmprestimosAtivos(predioId)
        ]);

        const emprestimoAtivo = ativos.find(e => e.matricula_aluno === matricula);

        return {
            matricula: matricula,
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
        if (!itemId || !matricula || !nomeAluno) {
            throw new ErroPublico("Dados obrigatórios faltando.");
        }

        await this._assertItemNoPredio(itemId, predioId);

        const resultado = await repository.criarRetiradaRpc({
            item_id: itemId,
            matricula_aluno: matricula,
            nome_aluno: nomeAluno,
            documento_retido: documento || null,
            resp_retirada: respRetirada
        });

        // Atualiza o cache de alunos em background — não bloqueia a resposta
        repository.upsertAlunoCache(matricula, nomeAluno).catch(() => {});

        return resultado;
    }

    async registrarDevolucao({ emprestimoId, respDevolucao, predioId }) {
        if (!emprestimoId) throw new ErroPublico("ID do empréstimo não informado.");

        const emprestimo = await repository.getEmprestimo(emprestimoId);

        if (!emprestimo) throw new ErroPublico("Registro de empréstimo não encontrado.");
        if (emprestimo.status !== 'ATIVO') throw new ErroPublico("Este empréstimo já foi concluído.");

        await this._assertItemNoPredio(emprestimo.item_id, predioId);

        return await repository.concluirDevolucao(emprestimoId, emprestimo.item_id, respDevolucao);
    }

    async alterarStatusItem(itemId, novoStatus, observacoes, predioId) {
        if (!itemId || !novoStatus) {
            throw new ErroPublico("ID do item e novo status são obrigatórios.");
        }

        await this._assertItemNoPredio(itemId, predioId);

        const { error } = await supabase
            .from('emprestimo_itens')
            .update({
                status: novoStatus,
                observacoes: observacoes || null
            })
            .eq('id', itemId);

        if (error) {
            console.error('[emprestimos] alterarStatusItem:', error.message);
            throw new Error("Erro ao atualizar status do item.");
        }

        return true;
    }
}

export default new EmprestimosService();
