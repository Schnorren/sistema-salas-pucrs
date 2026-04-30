import { useQuery, useMutation, useQueryClient, useCallback } from '@tanstack/react-query';

async function parseResponse(res) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
}

export const useEquipe = (session, predioId) => {
    const queryClient = useQueryClient();
    const token = session?.access_token;
    const userId = session?.user?.id;

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    });

    const base = import.meta.env.VITE_API_URL;

    const { data: equipe = [], isLoading: loadEquipe, error: errorEquipe } = useQuery({
        queryKey: ['equipe', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${base}/api/equipe`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId
    });

    const { data: perfis = [], isLoading: loadPerfis } = useQuery({
        queryKey: ['equipe_perfis', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${base}/api/equipe/perfis`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId,
        staleTime: 5 * 60 * 1000 // perfis mudam raramente — cache de 5min
    });

    const { data: modulos = [], isLoading: loadModulos } = useQuery({
        queryKey: ['equipe_modulos', predioId, userId],
        queryFn: async () => {
            const res = await fetch(`${base}/api/equipe/modulos`, { headers: getHeaders() });
            return parseResponse(res);
        },
        enabled: !!predioId && !!userId,
        staleTime: 10 * 60 * 1000 // módulos raramente mudam — cache de 10min
    });

    const loading = loadEquipe || loadPerfis || loadModulos;
    const error = errorEquipe?.message || null;

    const invalidarEquipe = useCallback(
        () => queryClient.invalidateQueries({ queryKey: ['equipe', predioId] }),
        [queryClient, predioId]
    );

    const atualizarMutation = useMutation({
        mutationFn: async (dados) => {
            const res = await fetch(`${base}/api/equipe/membro`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });
            return parseResponse(res);
        },
        onSuccess: invalidarEquipe
    });

    const convidarMutation = useMutation({
        mutationFn: async (dados) => {
            const res = await fetch(`${base}/api/equipe/convidar`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(dados)
            });
            return parseResponse(res);
        },
        onSuccess: invalidarEquipe
    });

    return {
        equipe,
        perfis,
        modulos,
        loading,
        error,
        carregarDados: invalidarEquipe,
        // Mutações relançam erro — o componente trata via toast
        atualizarMembro: (dados) => atualizarMutation.mutateAsync(dados),
        convidarMembro:  (dados) => convidarMutation.mutateAsync(dados),
    };
};
