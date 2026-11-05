import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lerResposta as parseResponse } from '../utils/api';


const API = `${import.meta.env.VITE_API_URL}/api/emprestimos/gestao`;

// Tela Gestão de Empréstimos (módulo gestao_emprestimos): acervo por ponto,
// alunos suspensos e ocorrências. Mutações invalidam todo ['emprestimos', …]
// (o balcão aberto em outra aba também reflete o acervo novo).
export const useGestaoEmprestimos = (session, predioId) => {
    const queryClient = useQueryClient();
    const token = session?.access_token;
    const userId = session?.user?.id;
    const headers = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-predio-id': predioId || ''
    });
    const get = async (caminho) => parseResponse(await fetch(`${API}${caminho}`, { headers: headers() }));
    const enviar = async (metodo, caminho, corpo) => parseResponse(await fetch(`${API}${caminho}`, {
        method: metodo, headers: headers(), body: corpo ? JSON.stringify(corpo) : undefined
    }));
    const habilitado = !!predioId && !!userId;

    const acervo = useQuery({ queryKey: ['emprestimos', 'gestao', predioId, userId], queryFn: () => get(''), enabled: habilitado });
    const bloqueios = useQuery({ queryKey: ['emprestimos', 'gestao-bloqueios', predioId, userId], queryFn: () => get('/bloqueios'), enabled: habilitado });
    const ocorrencias = useQuery({ queryKey: ['emprestimos', 'gestao-ocorrencias', predioId, userId], queryFn: () => get('/ocorrencias'), enabled: habilitado });

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
    const salvarEm = (recurso) => ({ id, ...dados }) => (id ? enviar('PUT', `/${recurso}/${id}`, dados) : enviar('POST', `/${recurso}`, dados));

    const ponto = useMutation({ mutationFn: salvarEm('pontos'), onSuccess: invalidar });
    const categoria = useMutation({ mutationFn: salvarEm('categorias'), onSuccess: invalidar });
    const item = useMutation({ mutationFn: salvarEm('itens'), onSuccess: invalidar });
    const criarBloqueio = useMutation({ mutationFn: (dados) => enviar('POST', '/bloqueios', dados), onSuccess: invalidar });
    const removerBloqueio = useMutation({ mutationFn: (id) => enviar('DELETE', `/bloqueios/${id}`), onSuccess: invalidar });

    return {
        pontos: acervo.data?.pontos || [],
        carregando: acervo.isLoading,
        erro: acervo.error?.message || null,
        bloqueios: bloqueios.data || [],
        ocorrencias: ocorrencias.data || [],
        salvando: ponto.isPending || categoria.isPending || item.isPending,
        salvandoBloqueio: criarBloqueio.isPending || removerBloqueio.isPending,
        salvarPonto: (d) => ponto.mutateAsync(d),
        salvarCategoria: (d) => categoria.mutateAsync(d),
        salvarItem: (d) => item.mutateAsync(d),
        criarBloqueio: (d) => criarBloqueio.mutateAsync(d),
        removerBloqueio: (id) => removerBloqueio.mutateAsync(id),
    };
};
