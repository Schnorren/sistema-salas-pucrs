import supabase from '../config/supabase.js';

// Acesso a dados da tela de Gestão de Empréstimos (acervo, bloqueios, vínculos
// usuário ↔ ponto). Regras ficam no service (emprestimosGestao.service.js).

function ignorarIdInvalido(error) {
    if (error?.code === '22P02') return null;
    throw error;
}

class EmprestimosGestaoRepository {
    // ------------------------------------------------------------- acervo
    async getPontos(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_pontos')
            .select('id, predio_id, nome, limite_por_aluno, ativo, created_at')
            .eq('predio_id', predioId)
            .order('nome');
        if (error) throw error;
        return data || [];
    }

    async getPonto(id) {
        const { data, error } = await supabase
            .from('emprestimo_pontos').select('id, predio_id, nome, limite_por_aluno, ativo').eq('id', id).maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async getCategorias(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_categorias')
            .select('id, nome, ativo, ponto_id, predio_id')
            .eq('predio_id', predioId)
            .order('nome');
        if (error) throw error;
        return data || [];
    }

    async getCategoria(id) {
        const { data, error } = await supabase
            .from('emprestimo_categorias').select('id, nome, ativo, ponto_id, predio_id').eq('id', id).maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async getItensDasCategorias(categoriaIds) {
        if (!categoriaIds.length) return [];
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('id, nome_item, patrimonio, status, observacoes, ativo, categoria_id, created_at')
            .in('categoria_id', categoriaIds)
            .order('nome_item');
        if (error) throw error;
        return data || [];
    }

    async getItem(id) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('id, nome_item, patrimonio, status, ativo, categoria_id, categoria:emprestimo_categorias (predio_id, ponto_id)')
            .eq('id', id)
            .maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    // Itens emprestados agora dentro de um ponto ou de uma categoria
    async contarEmprestados({ pontoId, categoriaId }) {
        let q = supabase
            .from('emprestimo_itens')
            .select('id, categoria:emprestimo_categorias!inner (ponto_id)', { count: 'exact', head: true })
            .eq('status', 'EMPRESTADO');
        if (pontoId) q = q.eq('categoria.ponto_id', pontoId);
        if (categoriaId) q = q.eq('categoria_id', categoriaId);
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
    }

    async getUsoItens(predioId) {
        const { data, error } = await supabase.rpc('emprestimo_uso_itens', { p_predio_id: predioId });
        if (error) throw error;
        return data || [];
    }

    async getAtivosDoPredio(predioId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('id, item_id, matricula_aluno, nome_aluno, data_retirada')
            .eq('predio_id', predioId)
            .eq('status', 'ATIVO');
        if (error) throw error;
        return data || [];
    }

    async inserir(tabela, linha, campos) {
        const { data, error } = await supabase.from(tabela).insert(linha).select(campos).single();
        if (error) throw error;
        return data;
    }

    async atualizar(tabela, id, campos, retorno) {
        const { data, error } = await supabase.from(tabela).update(campos).eq('id', id).select(retorno).single();
        if (error) throw error;
        return data;
    }

    // ------------------------------------------------------------- bloqueios
    async getBloqueiosAtivos(predioId, hoje) {
        const { data, error } = await supabase
            .from('emprestimo_bloqueios')
            .select('id, matricula, motivo, ate, criado_por, criado_em')
            .eq('predio_id', predioId)
            .is('removido_em', null)
            .or(`ate.is.null,ate.gte.${hoje}`)
            .order('criado_em', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getBloqueio(id) {
        const { data, error } = await supabase
            .from('emprestimo_bloqueios').select('id, predio_id, matricula, removido_em').eq('id', id).maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async removerBloqueio(id, por) {
        const { error } = await supabase
            .from('emprestimo_bloqueios')
            .update({ removido_em: new Date().toISOString(), removido_por: por })
            .eq('id', id)
            .is('removido_em', null);
        if (error) throw error;
    }

    async getNomes(matriculas) {
        if (!matriculas.length) return new Map();
        const { data, error } = await supabase
            .from('alunos_cache').select('matricula, nome').in('matricula', matriculas);
        if (error) throw error;
        return new Map((data || []).map(a => [a.matricula, a.nome]));
    }

    // ------------------------------------------------------------- ocorrências
    async getOcorrencias(predioId, limite = 100) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('id, matricula_aluno, nome_aluno, ocorrencia, obs_devolucao, data_retirada, data_devolucao, encerrado_em, ponto_id, item:emprestimo_itens (nome_item)')
            .eq('predio_id', predioId)
            .not('ocorrencia', 'is', null)
            .order('data_retirada', { ascending: false })
            .limit(limite);
        if (error) throw error;
        return data || [];
    }

    // ------------------------------------------------------------- vínculos
    async getVinculosDoPredio(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_ponto_usuarios')
            .select('ponto_id, user_id, ponto:emprestimo_pontos!inner (predio_id)')
            .eq('ponto.predio_id', predioId);
        if (error) throw error;
        return data || [];
    }

    // Substitui os pontos do usuário NESTE prédio (vínculos de outros prédios ficam)
    async definirVinculos(userId, pontoIdsDoPredio, pontoIds) {
        if (pontoIdsDoPredio.length) {
            const { error } = await supabase
                .from('emprestimo_ponto_usuarios')
                .delete()
                .eq('user_id', userId)
                .in('ponto_id', pontoIdsDoPredio);
            if (error) throw error;
        }
        if (pontoIds.length) {
            const { error } = await supabase
                .from('emprestimo_ponto_usuarios')
                .insert(pontoIds.map(ponto_id => ({ ponto_id, user_id: userId })));
            if (error) throw error;
        }
    }
}

export default new EmprestimosGestaoRepository();
