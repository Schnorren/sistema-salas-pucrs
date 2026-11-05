import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePredio } from '../contexts/PredioContext';
import { lerResposta as parseResponse } from '../utils/api';


const VAZIO = { escolas: [], locais: [] };

// Diretório de contatos. Diferente dos outros hooks do sistema, a queryKey NÃO
// tem predioId: os dados são institucionais e globais (ver api/contatos/index.js).
// Sem Realtime — o diretório muda raramente; invalidar após mutação basta.
export const useContatos = (session, acesso) => {
    const queryClient = useQueryClient();
    const { predioAtivo } = usePredio();
    const token = session?.access_token;

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        // Sem efeito neste módulo (dados globais), mas mantido por consistência
        // com o restante das chamadas autenticadas.
        'x-predio-id': predioAtivo || acesso?.predioId || ''
    });

    const base = `${import.meta.env.VITE_API_URL}/api/contatos`;

    const { data: diretorio = VAZIO, isLoading: loading, error } = useQuery({
        queryKey: ['contatos'],
        queryFn: async () => parseResponse(await fetch(base, { headers: getHeaders() })),
        enabled: !!token,
        staleTime: 10 * 60 * 1000 // diretório muda raramente
    });

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['contatos'] });

    const criarMutation = useMutation({
        mutationFn: async (dados) => parseResponse(await fetch(base, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify(dados)
        })),
        onSuccess: invalidar
    });

    const atualizarMutation = useMutation({
        mutationFn: async ({ id, dados }) => parseResponse(await fetch(`${base}/${id}`, {
            method: 'PUT', headers: getHeaders(), body: JSON.stringify(dados)
        })),
        onSuccess: invalidar
    });

    const excluirMutation = useMutation({
        mutationFn: async (id) => parseResponse(await fetch(`${base}/${id}`, {
            method: 'DELETE', headers: getHeaders()
        })),
        onSuccess: invalidar
    });

    const adicionarCursoMutation = useMutation({
        mutationFn: async ({ contatoId, nome }) => parseResponse(await fetch(`${base}/${contatoId}/cursos`, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify({ nome })
        })),
        onSuccess: invalidar
    });

    const removerCursoMutation = useMutation({
        mutationFn: async (cursoId) => parseResponse(await fetch(`${base}/cursos/${cursoId}`, {
            method: 'DELETE', headers: getHeaders()
        })),
        onSuccess: invalidar
    });

    return {
        diretorio,
        loading,
        error: error?.message || null,
        // Estados de loading das mutações para desabilitar botões
        isSalvando: criarMutation.isPending || atualizarMutation.isPending,
        isExcluindo: excluirMutation.isPending,
        isMexendoEmCursos: adicionarCursoMutation.isPending || removerCursoMutation.isPending,
        // Mutações relançam erro — o componente trata via toast
        criarContato:    (dados) => criarMutation.mutateAsync(dados),
        atualizarContato:(id, dados) => atualizarMutation.mutateAsync({ id, dados }),
        excluirContato:  (id) => excluirMutation.mutateAsync(id),
        adicionarCurso:  (contatoId, nome) => adicionarCursoMutation.mutateAsync({ contatoId, nome }),
        removerCurso:    (cursoId) => removerCursoMutation.mutateAsync(cursoId),
    };
};
