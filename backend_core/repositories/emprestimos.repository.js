import supabase from '../config/supabase.js';
import { ErroPublico } from '../utils/http.js';

// Erros de regra de negócio levantados pelas RPCs (RAISE EXCEPTION → código P0001)
// carregam mensagem segura para o usuário; qualquer outro erro é interno.
function traduzirErroRpc(error, mensagemPadrao) {
    if (error?.code === 'P0001') return new ErroPublico(error.message);
    if (error?.code === '22P02') return new ErroPublico('Registro não encontrado.');
    return new Error(error?.message || mensagemPadrao);
}

// UUID malformado (22P02) em filtro por id = registro inexistente, não erro interno.
function ignorarIdInvalido(error) {
    if (error?.code === '22P02') return null;
    throw error;
}

const CAMPOS_REGISTRO = `
    id, item_id, matricula_aluno, nome_aluno, documento_retido,
    data_retirada, resp_retirada, balcao_retirada,
    data_devolucao, resp_devolucao, balcao_devolucao,
    status, ocorrencia, obs_devolucao, encerrado_em, encerrado_por,
    predio_id, ponto_id, transferido_de
`;

async function rpc(nome, params, mensagemPadrao) {
    const { data, error } = await supabase.rpc(nome, params);
    if (error) throw traduzirErroRpc(error, mensagemPadrao);
    return data;
}

class EmprestimosRepository {
    // ------------------------------------------------------------------ pontos
    async getPontosDoPredio(predioId) {
        const { data, error } = await supabase
            .from('emprestimo_pontos')
            .select('id, predio_id, nome, limite_por_aluno, ativo')
            .eq('predio_id', predioId)
            .order('nome');
        if (error) return ignorarIdInvalido(error) || [];
        return data || [];
    }

    async getPontoIdsDoUsuario(userId, predioId) {
        const { data, error } = await supabase
            .from('emprestimo_ponto_usuarios')
            .select('ponto_id, ponto:emprestimo_pontos!inner (predio_id)')
            .eq('user_id', userId)
            .eq('ponto.predio_id', predioId);
        if (error) return ignorarIdInvalido(error) || [];
        return (data || []).map(r => r.ponto_id);
    }

    // ------------------------------------------------------- relatório da rede
    // Pontos de todos os prédios, com o nome do prédio (Painel Admin e o
    // relatório da rede do admin).
    async getTodosOsPontos() {
        const { data, error } = await supabase
            .from('emprestimo_pontos')
            .select('id, predio_id, nome, ativo, predio:predios (nome)')
            .order('nome');
        if (error) throw new Error(error.message || 'Erro ao listar os pontos de empréstimo.');
        return data || [];
    }

    // Pontos liberados para um login no relatório da rede
    async getPontosDaRedeDoUsuario(userId) {
        const { data, error } = await supabase
            .from('emprestimo_relatorio_rede_pontos')
            .select('ponto:emprestimo_pontos!inner (id, predio_id, nome, ativo, predio:predios (nome))')
            .eq('user_id', userId);
        if (error) throw new Error(error.message || 'Erro ao listar os pontos do relatório da rede.');
        return (data || []).map(r => r.ponto).filter(Boolean);
    }

    // Todos os vínculos (Painel Admin): [{ user_id, ponto_id }]
    async getVinculosDaRede() {
        const { data, error } = await supabase
            .from('emprestimo_relatorio_rede_pontos')
            .select('user_id, ponto_id');
        if (error) throw new Error(error.message || 'Erro ao listar os pontos do relatório da rede.');
        return data || [];
    }

    // Troca a lista do login pela nova: só apaga o que saiu e insere o que entrou
    // (um delete+insert deixaria o login sem nada se o insert falhasse).
    async definirPontosDaRede(userId, pontoIds) {
        const { data: atuais, error } = await supabase
            .from('emprestimo_relatorio_rede_pontos')
            .select('ponto_id')
            .eq('user_id', userId);
        if (error) throw new Error(error.message || 'Erro ao ler os pontos do relatório da rede.');
        const antes = new Set((atuais || []).map(r => r.ponto_id));
        const depois = new Set(pontoIds);
        const sair = [...antes].filter(id => !depois.has(id));
        const entrar = [...depois].filter(id => !antes.has(id));
        if (sair.length) {
            const { error: e } = await supabase.from('emprestimo_relatorio_rede_pontos')
                .delete().eq('user_id', userId).in('ponto_id', sair);
            if (e) throw new Error(e.message || 'Erro ao remover pontos do relatório da rede.');
        }
        if (entrar.length) {
            const { error: e } = await supabase.from('emprestimo_relatorio_rede_pontos')
                .insert(entrar.map(ponto_id => ({ user_id: userId, ponto_id })));
            if (e) throw new Error(e.message || 'Erro ao liberar pontos do relatório da rede.');
        }
    }

    // ------------------------------------------------------------------ painel
    // Acervo ativo do ponto (itens de baixa e categorias inativas ficam de fora)
    async getItensDoPonto(pontoId) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select(`
                id, nome_item, patrimonio, status, observacoes, ativo, categoria_id,
                categoria:emprestimo_categorias!inner (id, nome, ativo, ponto_id)
            `)
            .eq('categoria.ponto_id', pontoId)
            .eq('ativo', true)
            .order('nome_item');
        if (error) return ignorarIdInvalido(error) || [];
        return (data || []).filter(i => i.categoria?.ativo !== false);
    }

    async getAtivosDoPonto(pontoId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`${CAMPOS_REGISTRO}, item:emprestimo_itens (nome_item, patrimonio)`)
            .eq('ponto_id', pontoId)
            .eq('status', 'ATIVO')
            .order('data_retirada', { ascending: false });
        if (error) return ignorarIdInvalido(error) || [];
        return data || [];
    }

    // Devoluções mais recentes dos itens (base da previsão de volta)
    async getDuracoesRecentes(itemIds, limite = 1500) {
        if (!itemIds?.length) return [];
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('item_id, data_retirada, data_devolucao')
            .in('item_id', itemIds)
            .eq('status', 'CONCLUIDO')
            .not('data_devolucao', 'is', null)
            .order('data_retirada', { ascending: false })
            .limit(limite);
        if (error) throw error;
        return data || [];
    }

    // ------------------------------------------------------------------ por id
    async getItem(itemId) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('*, categoria:emprestimo_categorias (id, predio_id, ponto_id, ativo, nome)')
            .eq('id', itemId)
            .maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    async getEmprestimo(emprestimoId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select(`${CAMPOS_REGISTRO}, item:emprestimo_itens (nome_item, patrimonio)`)
            .eq('id', emprestimoId)
            .maybeSingle();
        if (error) return ignorarIdInvalido(error);
        return data;
    }

    // ------------------------------------------------------------------ aluno
    async buscarAlunoCache(matricula) {
        const { data, error } = await supabase
            .from('alunos_cache')
            .select('nome')
            .eq('matricula', matricula)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async getAtivosDoAluno(matricula, predioId) {
        const { data, error } = await supabase
            .from('emprestimos_registro')
            .select('id, item_id, ponto_id, data_retirada, item:emprestimo_itens (nome_item, patrimonio)')
            .eq('predio_id', predioId)
            .eq('matricula_aluno', matricula)
            .eq('status', 'ATIVO')
            .order('data_retirada', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    // Ocorrências do aluno no prédio (contam as de qualquer ponto)
    async getOcorrenciasDoAluno(matricula, predioId, limite = 3) {
        const { data, error, count } = await supabase
            .from('emprestimos_registro')
            .select('id, ocorrencia, obs_devolucao, data_retirada, data_devolucao, encerrado_em, item:emprestimo_itens (nome_item)', { count: 'exact' })
            .eq('predio_id', predioId)
            .eq('matricula_aluno', matricula)
            .not('ocorrencia', 'is', null)
            .order('data_retirada', { ascending: false })
            .limit(limite);
        if (error) throw error;
        return { total: count ?? (data || []).length, ultimas: data || [] };
    }

    async getBloqueioAtivo(matricula, predioId, hoje) {
        const { data, error } = await supabase
            .from('emprestimo_bloqueios')
            .select('id, motivo, ate, criado_em, criado_por')
            .eq('predio_id', predioId)
            .eq('matricula', matricula)
            .is('removido_em', null)
            .or(`ate.is.null,ate.gte.${hoje}`)
            .order('criado_em', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data?.[0] || null;
    }

    // Corrige o nome (global) e os empréstimos em andamento do aluno no prédio.
    // Os encerrados guardam o nome da época; o relatório usa o do alunos_cache.
    async atualizarNomeAluno(matricula, nome, predioId) {
        const { error: errCache } = await supabase.from('alunos_cache').upsert(
            { matricula, nome, ultimo_acesso: new Date().toISOString() },
            { onConflict: 'matricula' }
        );
        if (errCache) throw errCache;
        const { error } = await supabase
            .from('emprestimos_registro')
            .update({ nome_aluno: nome })
            .eq('predio_id', predioId)
            .eq('matricula_aluno', matricula)
            .eq('status', 'ATIVO');
        if (error) throw error;
    }

    // ------------------------------------------------------------------ histórico
    // Paginação por data (keyset): `antes` = data_retirada do último da página anterior.
    // `termo` já chega saneado pelo service (só letras, números, espaço e hífen).
    async getHistorico({ pontoIds, antes, termo, itemIdsDoTermo, limite = 30 }) {
        let q = supabase
            .from('emprestimos_registro')
            .select(`${CAMPOS_REGISTRO}, item:emprestimo_itens (nome_item, patrimonio)`)
            .in('ponto_id', pontoIds)
            .order('data_retirada', { ascending: false })
            .limit(limite + 1);
        if (antes) q = q.lt('data_retirada', antes);
        if (termo) {
            const filtros = [`nome_aluno.ilike.%${termo}%`, `matricula_aluno.ilike.%${termo}%`];
            if (itemIdsDoTermo?.length) filtros.push(`item_id.in.(${itemIdsDoTermo.join(',')})`);
            q = q.or(filtros.join(','));
        }
        const { data, error } = await q;
        if (error) throw error;
        const lista = data || [];
        return { registros: lista.slice(0, limite), temMais: lista.length > limite };
    }

    // Troca de titular: quem estava com o item antes (registros que os de
    // `ids` substituíram) e quem ficou com ele depois (sem as trocas desfeitas).
    // Devolve { anteriores: Map(id → nome), seguintes: Map(id do anterior → nome) }.
    async getNomesDasTrocas({ anteriores = [], transferidos = [] } = {}) {
        const vazio = { data: [], error: null };
        const [antes, depois] = await Promise.all([
            anteriores.length
                ? supabase.from('emprestimos_registro').select('id, nome_aluno').in('id', anteriores)
                : vazio,
            transferidos.length
                ? supabase.from('emprestimos_registro').select('transferido_de, nome_aluno, status').in('transferido_de', transferidos)
                : vazio,
        ]);
        if (antes.error) throw antes.error;
        if (depois.error) throw depois.error;
        return {
            anteriores: new Map((antes.data || []).map(r => [r.id, r.nome_aluno])),
            seguintes: new Map((depois.data || []).filter(r => r.status !== 'CANCELADO').map(r => [r.transferido_de, r.nome_aluno])),
        };
    }

    async getItemIdsPorNome(pontoIds, termo) {
        const { data, error } = await supabase
            .from('emprestimo_itens')
            .select('id, categoria:emprestimo_categorias!inner (ponto_id)')
            .in('categoria.ponto_id', pontoIds)
            .or(`nome_item.ilike.%${termo}%,patrimonio.ilike.%${termo}%`)
            .limit(50);
        if (error) throw error;
        return (data || []).map(i => i.id);
    }

    // ------------------------------------------------------------------ RPCs
    retirarRpc({ predioId, itemId, matricula, nome, resp, balcao }) {
        return rpc('emprestimo_retirar', {
            p_predio_id: predioId, p_item_id: itemId, p_matricula: matricula,
            p_nome: nome, p_resp: resp, p_balcao: balcao || null
        }, 'Erro ao registrar o empréstimo.');
    }

    // Troca de titular numa transação (ver emprestimo_transferir em
    // supabase/migrations/emprestimos_v2_rpcs.sql)
    transferirRpc({ predioId, emprestimoId, matricula, nome, resp, balcao }) {
        return rpc('emprestimo_transferir', {
            p_predio_id: predioId, p_emprestimo_id: emprestimoId, p_matricula: matricula,
            p_nome: nome, p_resp: resp, p_balcao: balcao || null
        }, 'Erro ao trocar o titular do empréstimo.');
    }

    devolverRpc({ predioId, emprestimoId, resultado, obs, resp, balcao }) {
        return rpc('emprestimo_devolver', {
            p_predio_id: predioId, p_emprestimo_id: emprestimoId, p_resultado: resultado,
            p_obs: obs || null, p_resp: resp, p_balcao: balcao || null
        }, 'Erro ao registrar a devolução.');
    }

    cancelarRpc({ predioId, emprestimoId, resp, motivo }) {
        return rpc('emprestimo_cancelar', {
            p_predio_id: predioId, p_emprestimo_id: emprestimoId, p_resp: resp, p_motivo: motivo || null
        }, 'Erro ao desfazer o empréstimo.');
    }

    reabrirRpc({ predioId, emprestimoId }) {
        return rpc('emprestimo_reabrir', { p_predio_id: predioId, p_emprestimo_id: emprestimoId },
            'Erro ao desfazer a devolução.');
    }

    // Atômico no banco: trava o item, valida o prédio e recusa item com
    // empréstimo ATIVO (ver supabase/migrations/emprestimo_status_item_rpc.sql).
    alterarStatusItemRpc({ predioId, itemId, status, observacoes }) {
        return rpc('emprestimo_status_item', {
            p_predio_id: predioId, p_item_id: itemId, p_status: status, p_obs: observacoes
        }, 'Erro ao alterar o status do item.');
    }

    // Dados brutos do relatório (retiradas, acervo e pontos do período); as
    // contas ficam em src/utils/relatorioEmprestimos.js
    // (ver supabase/migrations/emprestimos_relatorio.sql).
    relatorioRpc({ predioId, pontoIds, inicio, fim }) {
        return rpc('emprestimo_relatorio', {
            p_predio_id: predioId, p_pontos: pontoIds, p_inicio: inicio, p_fim: fim
        }, 'Erro ao montar o relatório.');
    }

    // Mesmo formato, pela lista de pontos (vários prédios) e com o prédio de
    // cada ponto (ver supabase/migrations/emprestimos_relatorio_rede.sql).
    relatorioRedeRpc({ pontoIds, inicio, fim }) {
        return rpc('emprestimo_relatorio_rede', {
            p_pontos: pontoIds, p_inicio: inicio, p_fim: fim
        }, 'Erro ao montar o relatório da rede.');
    }
}

export default new EmprestimosRepository();
