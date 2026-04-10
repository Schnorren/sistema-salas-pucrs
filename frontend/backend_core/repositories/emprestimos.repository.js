import supabase from '../config/supabase.js';

class EmprestimosRepository {
    async getCategoriasPorPredio(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_categorias')
            .select('*')
            .eq('predio_id', predioId)
            .eq('ativo', true);

        if (error) throw error;
        return data;
    }

    async getItensDisponiveis(categoriaId) {
        console.log(`🔎 Buscando itens para a categoria: ${categoriaId}`);
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('*')
            .eq('categoria_id', categoriaId)
            .in('status', ['DISPONIVEL', 'MANUTENCAO'])
        console.log(`📦 Itens encontrados:`, data);
        return data || [];
    }

    async criarRetiradaRpc(payload) {
        const { data, error } = await supabase.rpc('realizar_emprestimo', {
            p_item_id: payload.item_id,
            p_matricula: payload.matricula_aluno,
            p_nome_aluno: payload.nome_aluno,
            p_documento: payload.documento_retido,
            p_resp: payload.resp_retirada
        });

        if (error) throw new Error(error.message || "Erro interno ao processar empréstimo.");
        return data;
    }

    async getEmprestimosAtivos(predioId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`
                *,
                item:emprestimo_itens (
                    id, nome_item, patrimonio,
                    categoria:emprestimo_categorias (predio_id)
                )
            `)
            .eq('status', 'ATIVO');

        if (error) throw error;

        return data.filter(e => e.item?.categoria?.predio_id === predioId);
    }

    async getItem(itemId) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('*, categoria:emprestimo_categorias(predio_id)')
            .eq('id', itemId)
            .single();

        if (error) throw error;
        return data;
    }

    async getEmprestimo(emprestimoId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('*')
            .eq('id', emprestimoId)
            .single();

        if (error) throw error;
        return data;
    }

    async criarRetirada(payload) {
        const { error: errItem } = await supabase
            .from('emprestimo_itens')
            .update({ status: 'EMPRESTADO' })
            .eq('id', payload.item_id);

        if (errItem) throw errItem;

        const { data, error: errReg } = await supabase
            .from('emprestimos_registro')
            .insert([payload])
            .select()
            .single();

        if (errReg) {
            await supabase.from('emprestimo_itens').update({ status: 'DISPONIVEL' }).eq('id', payload.item_id);
            throw errReg;
        }

        return data;
    }

    async concluirDevolucao(emprestimoId, itemId, emailResponsavel) {
        const { error: errItem } = await supabase
            .from('emprestimo_itens')
            .update({ status: 'DISPONIVEL' })
            .eq('id', itemId);

        if (errItem) throw errItem;

        const { data, error: errReg } = await supabase
            .from('emprestimos_registro')
            .update({
                status: 'CONCLUIDO',
                data_devolucao: new Date().toISOString(),
                resp_devolucao: emailResponsavel
            })
            .eq('id', emprestimoId)
            .select()
            .single();

        if (errReg) throw errReg;
        return data;
    }

    async buscarAlunoCache(matricula) {
        const { data, error } = await supabase
            .from('alunos_cache')
            .select('nome')
            .eq('matricula', matricula)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        return data;
    }

    async upsertAlunoCache(matricula, nome) {
        const { error } = await supabase.from('alunos_cache').upsert(
            { matricula: matricula, nome: nome, ultimo_acesso: new Date().toISOString() },
            { onConflict: 'matricula' }
        );
        if (error) throw error;
    }
}

export default new EmprestimosRepository();