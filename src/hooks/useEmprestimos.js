import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../supabase';

export const useEmprestimos = (session, predioId, categoriaId) => {
    const queryClient = useQueryClient();
    const token = session?.access_token;

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    });

    const { data: categorias = [], isLoading: loadCat } = useQuery({
        queryKey: ['categorias', predioId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao carregar categorias');
            return res.json();
        },
        enabled: !!predioId
    });

    const { data: itensDisponiveis = [], isLoading: loadItens } = useQuery({
        queryKey: ['itens', predioId, categoriaId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/categorias/${categoriaId}/itens`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao carregar itens');
            return res.json();
        },
        enabled: !!predioId && !!categoriaId
    });

    const { data: emprestimosAtivos = [], isLoading: loadAtivos } = useQuery({
        queryKey: ['emprestimosAtivos', predioId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/ativos`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao carregar ativos');
            return res.json();
        },
        enabled: !!predioId
    });

    const { data: historico = [], isLoading: loadHist } = useQuery({
        queryKey: ['historico', predioId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/historico`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Erro ao carregar historico');
            return res.json();
        },
        enabled: !!predioId
    });

    const loading = loadCat || loadItens || loadAtivos || loadHist;


    const retirarMutation = useMutation({
        mutationFn: async (dados) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/retirar`, {
                method: 'POST', headers: getHeaders(), body: JSON.stringify(dados)
            });
            if (!res.ok) throw new Error('Falha no Servidor');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimosAtivos', predioId] });
            queryClient.invalidateQueries({ queryKey: ['historico', predioId] });
            queryClient.invalidateQueries({ queryKey: ['itens', predioId] });
        }
    });

    const devolverMutation = useMutation({
        mutationFn: async (emprestimoId) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/devolver/${emprestimoId}`, {
                method: 'POST', headers: getHeaders()
            });
            if (!res.ok) throw new Error('Falha no Servidor');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emprestimosAtivos', predioId] });
            queryClient.invalidateQueries({ queryKey: ['historico', predioId] });
            queryClient.invalidateQueries({ queryKey: ['itens', predioId] });
        }
    });

    const manutencaoMutation = useMutation({
        mutationFn: async ({ itemId, status, observacao }) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/itens/${itemId}/manutencao`, {
                method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status, observacoes: observacao })
            });
            if (!res.ok) throw new Error('Falha ao atualizar status do item');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['itens', predioId] });
        }
    });

    const consultarAluno = async (matricula) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/emprestimos/aluno/${matricula}`, { headers: getHeaders() });
            if (!res.ok) throw new Error('Falha ao consultar aluno');
            return await res.json();
        } catch (err) {
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
        consultarAluno,
        registrarRetirada: (dados) => retirarMutation.mutateAsync(dados),
        registrarDevolucao: (id) => devolverMutation.mutateAsync(id),
        alterarStatusManutencao: (itemId, status, obs) => manutencaoMutation.mutateAsync({ itemId, status, observacao: obs })
    };
};