import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../supabase';

// Lê o corpo do erro da resposta HTTP e lança com a mensagem correta do servidor
async function parseResponse(res) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
}

export const useEmprestimos = (session, predioId, categoriaId) => {
    const queryClient = useQueryClient();
    const token = session?.access_token;
    const userId = session?.user?.id;

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    });

    // userId na queryKey evita colisão de cache entre usuários de prédios diferentes
    const { data: categorias = [], isLoading: loadCat } = useQuery({
        queryKey: ['categorias', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId
    });

    const { data: itensDisponiveis = [], isLoading: loadItens } = useQuery({
        queryKey: ['itens', predioId, categoriaId, userId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias/${categoriaId}/itens`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!categoriaId && !!userId
    });

    // loadAtivos e loadHist são independentes — o wizard não bloqueia enquanto o histórico carrega
    const { data: emprestimosAtivos = [], isLoading: loadAtivos } = useQuery({
        queryKey: ['emprestimosAtivos', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/ativos`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId
    });

    const { data: historico = [], isLoading: loadHist } = useQuery({
        queryKey: ['historico', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/historico`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId
    });

    // Granular: wizard pronto quando categorias e ativos carregaram; histórico pode chegar depois
    const loadingWizard = loadCat || loadAtivos;
    const loadingHistorico = loadHist;
    const loadingItens = loadItens;
    // Compatibilidade com código existente que usa `loading`
    const loading = loadingWizard || loadingHistorico;

    const retirarMutation = useMutation({
        mutationFn: async (dados) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST', headers: getHeaders(), body: JSON.stringify(dados)
            });
            return parseResponse(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimosAtivos', predioId, userId] });
            queryClient.invalidateQueries({ queryKey: ['historico', predioId, userId] });
            queryClient.invalidateQueries({ queryKey: ['itens', predioId, categoriaId, userId] });
        }
    });

    const devolverMutation = useMutation({
        mutationFn: async (emprestimoId) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/devolver/${emprestimoId}`, {
                method: 'POST', headers: getHeaders()
            });
            return parseResponse(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimosAtivos', predioId, userId] });
            queryClient.invalidateQueries({ queryKey: ['historico', predioId, userId] });
            queryClient.invalidateQueries({ queryKey: ['itens', predioId, categoriaId, userId] });
        }
    });

    const manutencaoMutation = useMutation({
        mutationFn: async ({ itemId, status, observacao }) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/itens/${itemId}/manutencao`, {
                method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status, observacoes: observacao })
            });
            return parseResponse(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['itens', predioId, categoriaId, userId] });
        }
    });

    const consultarAluno = async (matricula) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/aluno/${matricula}`, { headers: getHeaders() });
            return await parseResponse(res);
        } catch {
            return null;
        }
    };

    useEffect(() => {
        if (!predioId) return;

        const channel = supabase.channel(`emprestimos_${predioId}`);

        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimo_itens' }, () => {
            queryClient.invalidateQueries({ queryKey: ['itens', predioId] });
        });

        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'emprestimos_registro' }, () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimosAtivos', predioId] });
            queryClient.invalidateQueries({ queryKey: ['historico', predioId] });
        });

        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [predioId, queryClient]);

    return {
        categorias,
        itensDisponiveis,
        emprestimosAtivos,
        historico,
        loading,
        loadingWizard,
        loadingHistorico,
        loadingItens,
        consultarAluno,
        registrarRetirada: (dados) => retirarMutation.mutateAsync(dados),
        registrarDevolucao: (id) => devolverMutation.mutateAsync(id),
        alterarStatusManutencao: (itemId, status, obs) => manutencaoMutation.mutateAsync({ itemId, status, observacao: obs })
    };
};
