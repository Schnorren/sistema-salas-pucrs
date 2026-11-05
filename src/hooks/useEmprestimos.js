import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { lerBalcao } from '../utils/balcao';
import { lerResposta as parseResponse } from '../utils/api';


const API = `${import.meta.env.VITE_API_URL}/api/emprestimos`;

// Pontos de empréstimo que este login vê. uso = 'balcao' (os que opera) ou
// 'relatorio' (os do relatório — quem tem Relatórios/Gestão vê o prédio todo).
export const usePontosEmprestimo = (session, predioId, uso = 'balcao') => {
    const token = session?.access_token;
    const userId = session?.user?.id;
    const query = useQuery({
        queryKey: ['emprestimos', 'pontos', predioId, userId, uso],
        queryFn: async () => parseResponse(await fetch(`${API}/pontos${uso === 'relatorio' ? '?uso=relatorio' : ''}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'x-predio-id': predioId || '' }
        })),
        enabled: !!predioId && !!userId
    });
    return { pontos: query.data || [], carregando: query.isLoading, erro: query.error?.message || null };
};

// Pontos do relatório da rede (vários prédios): os liberados no Painel Admin
// para este login; admin vê todos. Não depende do prédio ativo.
// [{ id, nome, ativo, predioId, predioNome }], ordenados por prédio e nome.
export const usePontosDaRede = (session, ativo = true) => {
    const token = session?.access_token;
    const userId = session?.user?.id;
    const query = useQuery({
        queryKey: ['emprestimos', 'rede', 'pontos', userId],
        queryFn: async () => parseResponse(await fetch(`${API}/rede/pontos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })),
        enabled: ativo && !!userId
    });
    return { pontos: query.data || [], carregando: query.isLoading, erro: query.error?.message || null };
};

// Balcão de um PONTO de empréstimo. Todas as queries ficam sob ['emprestimos', …]
// para o Realtime invalidar tudo do prédio por prefixo.
export const useEmprestimos = (session, predioId, pontoId, buscaHistorico = '') => {
    const queryClient = useQueryClient();
    const token = session?.access_token;
    const userId = session?.user?.id;

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || '',
        // Nome deste computador (login compartilhado na recepção) — ver utils/balcao.js
        'x-balcao': encodeURIComponent(lerBalcao())
    });
    const get = async (caminho) => parseResponse(await fetch(`${API}${caminho}`, { headers: getHeaders() }));
    const enviar = async (metodo, caminho, corpo) => parseResponse(await fetch(`${API}${caminho}`, {
        method: metodo, headers: getHeaders(), body: corpo ? JSON.stringify(corpo) : undefined
    }));

    const habilitado = !!predioId && !!userId;

    // Acervo do ponto + empréstimos em andamento + duração típica de cada item.
    // Além do Realtime, refaz a cada minuto: os PCs da recepção ficam o dia todo
    // abertos e o websocket pode cair sem avisar.
    const painelQuery = useQuery({
        queryKey: ['emprestimos', 'painel', predioId, pontoId, userId],
        queryFn: () => get(`/painel?ponto=${encodeURIComponent(pontoId)}`),
        enabled: habilitado && !!pontoId,
        refetchInterval: 60 * 1000
    });

    const historicoQuery = useInfiniteQuery({
        queryKey: ['emprestimos', 'historico', predioId, pontoId, userId, buscaHistorico],
        queryFn: ({ pageParam }) => {
            const params = new URLSearchParams({ ponto: pontoId });
            if (buscaHistorico) params.set('busca', buscaHistorico);
            if (pageParam) params.set('antes', pageParam);
            return get(`/historico?${params}`);
        },
        initialPageParam: '',
        getNextPageParam: (ultima) => ultima?.proximo || undefined,
        enabled: habilitado && !!pontoId
    });

    const invalidar = () => {
        queryClient.invalidateQueries({ queryKey: ['emprestimos', 'painel', predioId] });
        queryClient.invalidateQueries({ queryKey: ['emprestimos', 'historico', predioId] });
    };

    const retirarMutation = useMutation({
        mutationFn: (dados) => enviar('POST', '/retirar', dados),
        onSuccess: invalidar
    });
    const devolverMutation = useMutation({
        mutationFn: ({ id, resultado = 'OK', obs = null }) => enviar('POST', `/devolver/${id}`, { resultado, obs }),
        onSuccess: invalidar
    });
    // Troca de titular: o item passa para outro aluno sem voltar ao balcão
    const transferirMutation = useMutation({
        mutationFn: ({ id, matricula, nomeAluno }) => enviar('POST', `/transferir/${id}`, { matricula, nomeAluno }),
        onSuccess: invalidar
    });
    const cancelarMutation = useMutation({
        mutationFn: ({ id, motivo = null }) => enviar('POST', `/cancelar/${id}`, { motivo }),
        onSuccess: invalidar
    });
    const reabrirMutation = useMutation({
        mutationFn: (id) => enviar('POST', `/reabrir/${id}`),
        onSuccess: invalidar
    });
    const statusMutation = useMutation({
        mutationFn: ({ itemId, status, observacoes = null }) =>
            enviar('PUT', `/itens/${itemId}/manutencao`, { status, observacoes }),
        onSuccess: invalidar
    });
    const nomeMutation = useMutation({
        mutationFn: ({ matricula, nome }) => enviar('PUT', `/aluno/${encodeURIComponent(matricula)}`, { nome }),
        onSuccess: invalidar
    });

    // Propaga o erro: quem chama precisa distinguir "aluno sem cadastro" de
    // "consulta falhou" (senão uma queda de rede vira 'aluno novo' silenciosamente)
    const consultarAluno = (matricula) =>
        get(`/aluno/${encodeURIComponent(matricula)}?ponto=${encodeURIComponent(pontoId)}`);

    // Realtime: o outro PC registrou algo → refaz painel e histórico deste prédio.
    // Registros filtram por prédio (coluna predio_id); a RLS ainda corta os de
    // pontos que este login não opera. Itens não têm predio_id: a RLS filtra.
    useEffect(() => {
        if (!predioId) return;
        const channel = supabase.channel(`emprestimos_${predioId}`);
        channel.on('postgres_changes',
            { event: '*', schema: 'public', table: 'emprestimos_registro', filter: `predio_id=eq.${predioId}` },
            () => {
                queryClient.invalidateQueries({ queryKey: ['emprestimos', 'painel', predioId] });
                queryClient.invalidateQueries({ queryKey: ['emprestimos', 'historico', predioId] });
            });
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimo_itens' }, () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimos', 'painel', predioId] });
        });
        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [predioId, queryClient]);

    const historico = useMemo(
        () => (historicoQuery.data?.pages || []).flatMap(p => p.itens || []),
        [historicoQuery.data]
    );

    return {
        ponto: painelQuery.data?.ponto || null,
        itens: painelQuery.data?.itens || [],
        ativos: painelQuery.data?.ativos || [],
        carregandoPainel: painelQuery.isLoading,
        erroPainel: painelQuery.error?.message || null,
        historico,
        carregandoHistorico: historicoQuery.isLoading,
        historicoTemMais: !!historicoQuery.hasNextPage,
        carregandoMaisHistorico: historicoQuery.isFetchingNextPage,
        carregarMaisHistorico: () => historicoQuery.fetchNextPage(),
        consultarAluno,
        // Flags de mutação pendente — usadas para desabilitar botões e barrar double-submit
        retirando: retirarMutation.isPending,
        devolvendo: devolverMutation.isPending,
        transferindo: transferirMutation.isPending,
        cancelando: cancelarMutation.isPending,
        reabrindo: reabrirMutation.isPending,
        alterandoStatus: statusMutation.isPending,
        corrigindoNome: nomeMutation.isPending,
        retirar: (dados) => retirarMutation.mutateAsync(dados),
        devolver: (dados) => devolverMutation.mutateAsync(dados),
        transferir: (dados) => transferirMutation.mutateAsync(dados),
        cancelar: (dados) => cancelarMutation.mutateAsync(dados),
        reabrir: (id) => reabrirMutation.mutateAsync(id),
        alterarStatus: (dados) => statusMutation.mutateAsync(dados),
        corrigirNome: (dados) => nomeMutation.mutateAsync(dados),
    };
};
