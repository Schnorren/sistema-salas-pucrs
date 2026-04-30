import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePredio } from '../contexts/PredioContext';
import { supabase } from '../supabase';

async function parseResponse(res) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
}

export const useAvisos = (session, acesso) => {
    const queryClient = useQueryClient();
    const { predioAtivo } = usePredio();
    const token = session?.access_token;
    const userId = session?.user?.id;
    const predioId = predioAtivo || acesso?.predioId || '';

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId
    });

    const { data: avisos = { chaves: [], gerais: [] }, isLoading: loading, error } = useQuery({
        queryKey: ['avisos', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId
    });

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['avisos', predioId, userId] });

    // Realtime — qualquer alteração na tabela avisos atualiza o mural automaticamente
    useEffect(() => {
        if (!predioId) return;

        const channel = supabase
            .channel(`avisos_${predioId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos', filter: `predio_id=eq.${predioId}` }, () => {
                // Invalida com queryKey completa (predioId + userId) para bater exatamente com a query registrada
                queryClient.invalidateQueries({ queryKey: ['avisos', predioId, userId] });
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [predioId, userId, queryClient]);

    const criarMutation = useMutation({
        mutationFn: async (dadosAviso) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos`, {
                method: 'POST', headers: getHeaders(), body: JSON.stringify(dadosAviso)
            });
            return parseResponse(res);
        },
        onSuccess: invalidar
    });

    const concluirMutation = useMutation({
        mutationFn: async ({ id, observacao }) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/concluir`, {
                method: 'PUT', headers: getHeaders(), body: JSON.stringify({ obs: observacao })
            });
            return parseResponse(res);
        },
        onSuccess: invalidar
    });

    const comentarMutation = useMutation({
        mutationFn: async ({ id, descricao_atual, nota, userEmail }) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}/comentar`, {
                method: 'PATCH', headers: getHeaders(),
                body: JSON.stringify({ descricao_atual, nota, user_email: userEmail })
            });
            return parseResponse(res);
        },
        onSuccess: invalidar
    });

    const excluirMutation = useMutation({
        mutationFn: async (id) => {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/avisos/${id}`, {
                method: 'DELETE', headers: getHeaders()
            });
            return parseResponse(res);
        },
        onSuccess: invalidar
    });

    return {
        avisos,
        loading,
        error: error?.message || null,
        // Mutações relançam erro — o componente trata via toast
        criarAviso:         (dados) => criarMutation.mutateAsync(dados),
        concluirAviso:      (id, observacao) => concluirMutation.mutateAsync({ id, observacao }),
        adicionarComentario:(id, descricao_atual, nota, userEmail) => comentarMutation.mutateAsync({ id, descricao_atual, nota, userEmail }),
        excluirAviso:       (id) => excluirMutation.mutateAsync(id),
    };
};
