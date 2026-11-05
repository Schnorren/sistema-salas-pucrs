import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePredio } from '../contexts/PredioContext';
import { avisarGradeRepublicada } from './useGrade';

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
  return json;
}

// Salas do prédio ativo com a situação (visivel | oculta | pendente) e o resumo
// da agenda atual. Escrita: PUT /api/grade/salas, que republica o JSON da grade.
export const useSalasPredio = (session, acesso) => {
  const queryClient = useQueryClient();
  const { predioAtivo } = usePredio();
  const predioId = predioAtivo || acesso?.predioId || '';
  const token = session?.access_token;
  const base = `${import.meta.env.VITE_API_URL}/api/grade/salas`;
  const queryKey = ['salas_predio', predioId];

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-predio-id': predioId,
  });

  const query = useQuery({
    queryKey,
    queryFn: async () => parseResponse(await fetch(base, { headers: getHeaders() })),
    enabled: !!token && !!predioId,
    staleTime: 60 * 1000,
  });

  const salvarMutation = useMutation({
    mutationFn: async ({ exibir, ocultar }) => parseResponse(await fetch(base, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify({ exibir, ocultar }),
    })),
    onSuccess: () => {
      avisarGradeRepublicada(predioId);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const salas = query.data || [];
  return {
    predioId,
    salas,
    pendentes: salas.filter(s => s.situacao === 'pendente'),
    loading: query.isLoading,
    error: query.error,
    recarregar: () => queryClient.invalidateQueries({ queryKey }),
    salvarVisibilidade: salvarMutation.mutateAsync,
    salvando: salvarMutation.isPending,
  };
};
