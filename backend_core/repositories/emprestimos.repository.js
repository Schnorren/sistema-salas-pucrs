import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';

// Erros de regra de negócio levantados pelas RPCs (RAISE EXCEPTION → código P0001)
// carregam mensagem segura para o usuário; qualquer outro erro é interno.
function traduzirErroRpc(error, mensagemPadrao) {
    if (error?.code === 'P0001') return new ErroPublico(error.message);
    return new Error(error?.message || mensagemPadrao);
}

// UUID malformado (22P02) em filtro por id = registro inexistente, não erro interno.
function ignorarIdInvalido(error) {
    if (error?.code === '22P02') return null;
    throw error;
}

class EmprestimosRepository {
    async getCategoriasPorPredio(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_categorias')
            .select('*')
            .eq('predio_id', predioId)
            .eq('ativo', true)
            .order('nome');

        if (error) throw error;
        return data;
    }

    async getItensDisponiveis(categoriaId) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('*')
            .eq('categoria_id', categoriaId)
            .in('status', ['DISPONIVEL', 'MANUTENCAO'])
            .order('nome_item');

        if (error) throw error;
        return data || [];
    }

    // Item do prédio em QUALQUER categoria: código exato (maiúsc./minúsc.
    // indiferentes) e, se não achar, parte do nome. Curingas do usuário são
    // escapados para o ILIKE não virar busca ampla.
    async buscarItemNoPredio(termo, predioId) {
        const seguro = termo.replace(/[\\%_]/g, (c) => `\\${c}`);
        const base = () => supabase
            .from('emprestimo_itens')
            .select('*, categoria:emprestimo_categorias!inner (predio_id, nome)')
            .eq('categoria.predio_id', predioId);

        const porCodigo = await base().ilike('patrimonio', seguro).limit(1);
        if (porCodigo.error) throw porCodigo.error;
        if (porCodigo.data?.length) return porCodigo.data[0];

        // Por nome só quando UM item casa: com dois parecidos ("Bola 1", "Bola 2")
        // a escolha fica com o atendente (clicando), nunca com a ordem da consulta.
        const porNome = await base().ilike('nome_item', `%${seguro}%`).limit(2);
        if (porNome.error) throw porNome.error;
        const lista = porNome.data || [];
        return lista.length === 1 ? lista[0] : null;
    }

    async criarRetiradaRpc(payload) {
        const { data, error } = await supabase.rpc('realizar_emprestimo', {
            p_item_id: payload.item_id,
            p_matricula: payload.matricula_aluno,
            p_nome_aluno: payload.nome_aluno,
            p_documento: payload.documento_retido,
            p_resp: payload.resp_retirada
        });

        if (error) throw traduzirErroRpc(error, 'Erro interno ao processar empréstimo.');
        return data;
    }

    async getEmprestimosAtivos(predioId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`
                *,
                item:emprestimo_itens!inner (
                    id, nome_item, patrimonio,
                    categoria:emprestimo_categorias!inner (predio_id)
                )
            `)
            .eq('status', 'ATIVO')
            .eq('item.categoria.predio_id', predioId);

        if (error) throw error;
        return data;
    }

    async getEmprestimoAtivoPorMatricula(matricula, predioId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`
                id, item_id, matricula_aluno, data_retirada,
                item:emprestimo_itens!inner (
                    nome_item,
                    categoria:emprestimo_categorias!inner (predio_id)
                )
            `)
            .eq('status', 'ATIVO')
            .eq('matricula_aluno', matricula)
            .eq('item.categoria.predio_id', predioId)
            .limit(1);

        if (error) throw error;
        return data?.[0] || null;
    }

    async getHistorico(predioId, limite = 50) {
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
            .limit(limite);

        if (error) throw error;
        return data;
    }

    async getItem(itemId) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('*, categoria:emprestimo_categorias(predio_id)')
            .eq('id', itemId)
            .maybeSingle();

        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async getCategoria(categoriaId) {
        const { data, error } = await supabase
            .from('emprestimo_categorias')
            .select('id, predio_id')
            .eq('id', categoriaId)
            .maybeSingle();

        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async getEmprestimo(emprestimoId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('*')
            .eq('id', emprestimoId)
            .maybeSingle();

        if (error) return ignorarIdInvalido(error);
        return data;
    }

    // Atômico no banco: trava o item, valida o prédio e recusa item com
    // empréstimo ATIVO (ver supabase/migrations/emprestimo_status_item_rpc.sql).
    async alterarStatusItemRpc({ predioId, itemId, status, observacoes }) {
        const { data, error } = await supabase.rpc('emprestimo_status_item', {
            p_predio_id: predioId,
            p_item_id: itemId,
            p_status: status,
            p_obs: observacoes
        });

        if (error) {
            if (error.code === '22P02') throw new ErroPublico('Item não encontrado.');
            throw traduzirErroRpc(error, 'Erro ao alterar o status do item.');
        }
        return data;
    }

    async concluirDevolucao(emprestimoId, emailResponsavel) {
        // Usa RPC atômica — item e registro são atualizados na mesma transação.
        // Se qualquer update falhar, o Postgres reverte tudo.
        const { data, error } = await supabase.rpc('concluir_devolucao', {
            p_emprestimo_id: emprestimoId,
            p_resp_devolucao: emailResponsavel
        });

        if (error) throw traduzirErroRpc(error, 'Erro ao concluir devolução.');
        return data;
    }

    async buscarAlunoCache(matricula) {
        const { data, error } = await supabase
            .from('alunos_cache')
            .select('nome')
            .eq('matricula', matricula)
            .maybeSingle();

        if (error) throw error;
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
