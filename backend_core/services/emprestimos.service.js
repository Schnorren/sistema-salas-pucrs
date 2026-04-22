import repository from '../repositories/emprestimos.repository.js';
import supabase from '../config/supabase.js';

class EmprestimosService {
    async listarCategorias(predioId) {
        if (!predioId) throw new Error("Prédio não informado.");
        return await repository.getCategoriasPorPredio(predioId);
    }

    async listarItensDisponiveis(categoriaId) {
        if (!categoriaId) throw new Error("Categoria não informada.");
        return await repository.getItensDisponiveis(categoriaId);
    }

    async listarEmprestimosAtivos(predioId) {
        if (!predioId) throw new Error("Prédio não informado.");

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
                item:emprestimo_itens (nome_item, patrimonio, categoria:emprestimo_categorias(predio_id))
            `)
            .order('data_retirada', { ascending: false })
            .limit(50);

        if (error) throw error;

        return data.filter(e => e.item?.categoria?.predio_id === predioId).map(e => ({
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
        if (!matricula) throw new Error("Matrícula não informada.");

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

    async registrarRetirada({ predioId, itemId, matricula, nomeAluno, documento, respRetirada }) {
        if (!itemId || !matricula || !nomeAluno) {
            throw new Error("Dados obrigatórios faltando.");
        }

        return await repository.criarRetiradaRpc({
            item_id: itemId,
            matricula_aluno: matricula,
            nome_aluno: nomeAluno,
            documento_retido: documento || null,
            resp_retirada: respRetirada
        });
    }

    async registrarDevolucao({ emprestimoId, respDevolucao }) {
        if (!emprestimoId) throw new Error("ID do empréstimo não informado.");

        const emprestimo = await repository.getEmprestimo(emprestimoId);

        if (!emprestimo) throw new Error("Registro de empréstimo não encontrado.");
        if (emprestimo.status !== 'ATIVO') throw new Error("Este empréstimo já foi concluído.");

        return await repository.concluirDevolucao(emprestimoId, emprestimo.item_id, respDevolucao);
    }

    async alterarStatusItem(itemId, novoStatus, observacoes) {
        if (!itemId || !novoStatus) {
            throw new Error("ID do item e novo status são obrigatórios.");
        }

        const { error } = await supabase
            .from('emprestimo_itens')
            .update({
                status: novoStatus,
                observacoes: observacoes || null
            })
            .eq('id', itemId);

        if (error) {
            console.error("Erro ao atualizar status do item no banco:", error);
            throw new Error("Erro ao atualizar status do item.");
        }

        return true;
    }
}

export default new EmprestimosService();